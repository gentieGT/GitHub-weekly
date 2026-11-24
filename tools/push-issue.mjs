// 把某一期周报推到企业微信（Markdown 格式）
// 用法：node push-issue.mjs [周日期] [--text]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sendMarkdown, sendText, formatIssue } from './notify.mjs';

const ROOT = 'D:\\dsh-workspace\\gh-weekly';
const DATA = path.join(ROOT, 'data');
const PORT = 11436;

/** 找一个手机能访问的地址：优先局域网 IP，退化到 127.0.0.1 */
function lanBaseUrl(port) {
  try {
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const a of addrs || []) {
        if (a.family === 'IPv4' && !a.internal) {
          return `http://${a.address}:${port}`;
        }
      }
    }
  } catch { /* ignore */ }
  return `http://127.0.0.1:${port}`;
}

const weekArg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const asText = process.argv.includes('--text');

function listWeeks() {
  return fs.readdirSync(DATA)
    .filter((f) => f.startsWith('weekly-') && f.endsWith('.json'))
    .map((f) => f.replace(/^weekly-/, '').replace(/\.json$/, ''))
    .sort()
    .reverse();
}

const weeks = listWeeks();
const week = weekArg || weeks[0];
if (!week) {
  console.error('没有周报数据');
  process.exit(1);
}
if (!weeks.includes(week)) {
  console.error(`找不到 ${week}，现有：${weeks.join(', ')}`);
  process.exit(1);
}

const weekly = JSON.parse(fs.readFileSync(path.join(DATA, `weekly-${week}.json`), 'utf8'));
const bf = path.join(DATA, `briefings-${week}.json`);
let briefMap = {};
if (fs.existsSync(bf)) {
  const b = JSON.parse(fs.readFileSync(bf, 'utf8'));
  for (const it of b.items || []) briefMap[it.repo] = it;
}

const items = (weekly.repos || []).map((r, i) => {
  const b = briefMap[r.repo] || {};
  return {
    rank: i + 1,
    repo: r.repo,
    url: r.url || `https://github.com/${r.repo}`,
    stars: r.stars,
    summary: b.summary || r.desc || '',
    relevance: b.relevance || 'medium',
  };
});

const issue = { week, items };
// 手机要能打开，必须用局域网 IP；可用 GHW_HOST 环境变量强制指定
const host = process.env.GHW_HOST || lanBaseUrl(PORT).replace(/^https?:\/\//, '').split(':')[0];
const baseUrl = `http://${host}:${PORT}/?week=${week}`;

console.log(`推送 ${week}（${items.length} 个项目）…`);
console.log(`链接地址: ${baseUrl}`);

const r = asText
  ? await sendText(formatIssue(issue, baseUrl))
  : await sendMarkdown(formatIssue(issue, baseUrl));

console.log(JSON.stringify(r, null, 2));
process.exit(r.ok ? 0 : 1);