// GitHub Star 操作：从 git credential 取 token，star/unstar 仓库，并缓存状态
// 用法：node star.mjs <owner/repo> [--unstar] [--check]

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\dsh-workspace\\gh-weekly';
const CACHE_FILE = path.join(ROOT, 'data', 'star-cache.json');

let _token;
export function getToken() {
  if (_token !== undefined) return _token;
  try {
    const out = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      timeout: 5000,
    });
    const m = out.match(/^password=(.+)$/m);
    _token = m ? m[1].trim() : null;
  } catch {
    _token = null;
  }
  return _token;
}

function headers() {
  const t = getToken();
  if (!t) return null;
  return {
    'Authorization': 'Bearer ' + t,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'dsh-agent',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// ── 状态缓存（避免每次打开页面都打 API）──────────────────────
export function readStarCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}
function writeCache(obj) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch { /* 缓存写不了不影响主流程 */ }
}

const TTL_MS = 5 * 60 * 1000; // 5 分钟内不重复查

/** 查某个仓库的 star 状态（带缓存） */
export async function getStarState(repo) {
  const cache = readStarCache();
  const hit = cache[repo];
  if (hit && Date.now() - hit.at < TTL_MS) return { starred: hit.starred, cached: true };

  const H = headers();
  if (!H) return { starred: null, error: 'no-token' };

  try {
    const r = await fetch(`https://api.github.com/user/starred/${repo}`, { headers: H });
    if (r.status === 204) {
      cache[repo] = { starred: true, at: Date.now() };
      writeCache(cache);
      return { starred: true, cached: false };
    }
    if (r.status === 404) {
      cache[repo] = { starred: false, at: Date.now() };
      writeCache(cache);
      return { starred: false, cached: false };
    }
    return { starred: null, error: 'HTTP ' + r.status };
  } catch (e) {
    return { starred: null, error: e.message };
  }
}

/** 批量查（用于页面初始渲染，控制并发） */
export async function getStarStates(repos) {
  const out = {};
  const LIMIT = 4;
  for (let i = 0; i < repos.length; i += LIMIT) {
    const batch = repos.slice(i, i + LIMIT);
    const rs = await Promise.all(batch.map((r) => getStarState(r)));
    batch.forEach((r, k) => { out[r] = rs[k]; });
  }
  return out;
}

/** star / unstar */
export async function setStar(repo, starred) {
  const H = headers();
  if (!H) return { ok: false, error: '没有 GitHub token（凭据管理器里找不到）' };

  try {
    const r = await fetch(`https://api.github.com/user/starred/${repo}`, {
      method: starred ? 'PUT' : 'DELETE',
      headers: { ...H, 'Content-Length': '0' },
    });

    if (r.status === 204) {
      const cache = readStarCache();
      cache[repo] = { starred, at: Date.now() };
      writeCache(cache);
      return { ok: true, starred };
    }

    // PUT 重复 star 会返回 304，视为成功
    if (starred && r.status === 304) {
      const cache = readStarCache();
      cache[repo] = { starred: true, at: Date.now() };
      writeCache(cache);
      return { ok: true, starred: true, note: '本来就已经 star 过' };
    }

    const body = await r.text();
    return { ok: false, error: `HTTP ${r.status}: ${body.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── CLI（仅直接运行时生效）────────────────────────────────────
// 注意：被其他模块 import 时 process.argv[1] 是那个模块，不能只看后缀。
// 用 path 比较自己的真实路径，避免误触发。
import { fileURLToPath } from 'node:url';

const SELF = path.basename(fileURLToPath(import.meta.url));
const ENTRY = path.basename(process.argv[1] || '');
if (ENTRY === SELF) {
  const repo = process.argv[2];
  if (!repo) {
    console.log('用法: node star.mjs <owner/repo> [--unstar] [--check]');
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify(await getStarState(repo), null, 2));
  } else {
    const unstar = process.argv.includes('--unstar');
    console.log(JSON.stringify(await setStar(repo, !unstar), null, 2));
  }
}