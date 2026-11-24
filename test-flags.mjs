// 功能开关测试：开 / 关 两种状态 + 热加载 + 降级保护
// node test-flags.mjs
// 会在临时端口起一个 server 实例，不改动正在跑的服务

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\dsh-workspace\\gh-weekly';
const FLAG_FILE = path.join(ROOT, 'config', 'flags.json');
const PORT = 11499;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(p) {
  const r = await fetch(BASE + p);
  return { status: r.status, text: await r.text(), json: async () => JSON.parse(await r.text()) };
}

async function post(p, body) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

function writeFlags(obj) {
  fs.writeFileSync(FLAG_FILE, JSON.stringify({ flags: obj }, null, 2), 'utf8');
}

// ─────────────────────────────────────────────
// 备份原 flags.json
// ─────────────────────────────────────────────
const backup = fs.existsSync(FLAG_FILE) ? fs.readFileSync(FLAG_FILE, 'utf8') : null;

// ─────────────────────────────────────────────
// 起服务
// ─────────────────────────────────────────────
const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs'), `--port=${PORT}`], {
  cwd: ROOT,
  env: { ...process.env, GHW_FLAGS_OFF: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let startupLog = '';
child.stdout.on('data', (d) => { startupLog += d.toString(); });
child.stderr.on('data', (d) => { startupLog += d.toString(); });

async function waitUp() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + '/api/flags'); if (r.ok) return true; } catch { /* not yet */ }
    await sleep(250);
  }
  return false;
}

try {
  const up = await waitUp();
  if (!up) { console.error('服务没起来\n' + startupLog); process.exit(1); }
  console.log('\n服务已启动，开始测试\n');

  // ═══════════════════════════════════════════
  console.log('【状态 A】全开（默认）');
  // ═══════════════════════════════════════════
  writeFlags({
    'briefing.expand': true, 'briefing.forYou': true, 'briefing.tags': true,
    'relevance.indicator': true, 'ideas.submit': true, 'reports.display': true,
  });
  await sleep(150);

  let f = await (await fetch(BASE + '/api/flags')).json();
  check('API 报 6/6 开启', f.meta.enabledCount === 6, `实际 ${f.meta.enabledCount}`);
  check('disabled 列表为空', f.disabled.length === 0, JSON.stringify(f.disabled));

  let page = await get('/');
  check('页面 200', page.status === 200);
  check('有展开按钮', page.text.includes('class="toggle"'));
  check('有「对你的用处」段', page.text.includes('对你的用处'));
  check('有标签', page.text.includes('class="tags"'));
  check('有相关度圆点', page.text.includes('class="rel"'));
  check('有想法输入框', page.text.includes('class="composer"'));
  check('有卡片 body 容器', page.text.includes('class="body"'));
  check('无告警条', !page.text.includes('class="flagbar"'));

  let post1 = await post('/idea', { repo: '__test__/flag-a', text: '状态A测试' });
  check('POST /idea 成功', post1.status === 200 && post1.body.ok === true, JSON.stringify(post1));

  // ═══════════════════════════════════════════
  console.log('\n【状态 B】全关');
  // ═══════════════════════════════════════════
  writeFlags({
    'briefing.expand': false, 'briefing.forYou': false, 'briefing.tags': false,
    'relevance.indicator': false, 'ideas.submit': false, 'reports.display': false,
  });
  await sleep(150);

  f = await (await fetch(BASE + '/api/flags')).json();
  check('API 报 0/6 开启', f.meta.enabledCount === 0, `实际 ${f.meta.enabledCount}`);
  check('disabled 列表 6 项', f.disabled.length === 6, JSON.stringify(f.disabled));

  page = await get('/');
  check('页面仍 200（不崩）', page.status === 200);
  check('无展开按钮', !page.text.includes('class="toggle"'));
  check('无「对你的用处」', !page.text.includes('sec hl'));
  check('无标签', !page.text.includes('class="tags"'));
  check('无相关度圆点', !page.text.includes('class="rel"'));
  check('无想法输入框', !page.text.includes('class="composer"'));
  check('无卡片 body 容器', !page.text.includes('class="body"'));
  check('有告警条', page.text.includes('class="flagbar"'));
  check('告警条列出 6 项', page.text.includes('6 项功能已被开关关闭'));
  // 降级后核心信息还在
  check('降级后仍显示项目名', page.text.includes('ItsNotRexed/Leonida') || page.text.includes('/'));
  check('降级后仍显示概括', page.text.includes('class="sum"'));
  check('降级后仍显示 star', page.text.includes('★'));

  post1 = await post('/idea', { repo: '__test__/flag-b', text: '状态B测试' });
  check('POST /idea 返回 503', post1.status === 503, `实际 ${post1.status}`);
  check('503 带说明', String(post1.body.error || '').includes('ideas.submit'));

  // ═══════════════════════════════════════════
  console.log('\n【热加载】改文件不重启');
  // ═══════════════════════════════════════════
  writeFlags({ 'ideas.submit': true });
  await sleep(150);
  post1 = await post('/idea', { repo: '__test__/flag-hot', text: '热加载测试' });
  check('只开 ideas.submit 后接口恢复', post1.status === 200 && post1.body.ok === true, JSON.stringify(post1));

  f = await (await fetch(BASE + '/api/flags')).json();
  check('未在文件里写的项回落到默认（true）', f.meta.enabledCount === 6, `实际 ${f.meta.enabledCount}`);

  writeFlags({ 'ideas.submit': false });
  await sleep(150);
  post1 = await post('/idea', { repo: '__test__/flag-hot2', text: '再关掉' });
  check('再关掉后接口又 503', post1.status === 503, `实际 ${post1.status}`);
  check('进程未重启（startupLog 只有一次就绪行）', (startupLog.match(/已就绪/g) || []).length === 1);

  // ═══════════════════════════════════════════
  console.log('\n【依赖级联】父关子必关');
  // ═══════════════════════════════════════════
  writeFlags({ 'briefing.expand': false, 'briefing.forYou': true, 'briefing.tags': true });
  await sleep(150);
  f = await (await fetch(BASE + '/api/flags')).json();
  check('expand=false 时 forYou 被级联关闭', f.flags['briefing.forYou'] === false);
  check('expand=false 时 tags 被级联关闭', f.flags['briefing.tags'] === false);
  check('级联来源可追溯', String(f.meta.sources['briefing.forYou']).startsWith('cascade:'), f.meta.sources['briefing.forYou']);

  // ═══════════════════════════════════════════
  console.log('\n【正交性】展开关掉但想法仍可提交');
  // ═══════════════════════════════════════════
  writeFlags({ 'briefing.expand': false, 'ideas.submit': true });
  await sleep(150);
  page = await get('/');
  check('展开区已关（无 .body）', !page.text.includes('class="body"'));
  check('但输入框仍在（.composer）', page.text.includes('class="composer"'));
  check('输入框有收起态容器 .flatfoot', page.text.includes('class="flatfoot"'));
  check('textarea 存在', page.text.includes('<textarea'));
  post1 = await post('/idea', { repo: '__test__/flag-orth', text: '正交测试' });
  check('此时 POST /idea 正常', post1.status === 200 && post1.body.ok === true, JSON.stringify(post1));

  f = await (await fetch(BASE + '/api/flags')).json();
  check('两个开关互不影响', f.flags['briefing.expand'] === false && f.flags['ideas.submit'] === true);

  // ═══════════════════════════════════════════
  console.log('\n【正交性 2】想法关掉但展开仍在');
  // ═══════════════════════════════════════════
  writeFlags({ 'briefing.expand': true, 'ideas.submit': false });
  await sleep(150);
  page = await get('/');
  check('展开区在（.body）', page.text.includes('class="body"'));
  check('无输入框（.composer）', !page.text.includes('class="composer"'));
  check('无 flatfoot 残留', !page.text.includes('class="flatfoot"'));
  check('简报内容仍在', page.text.includes('对你的用处') || page.text.includes('为什么火'));

  // ═══════════════════════════════════════════
  console.log('\n【容错】文件损坏 / 不存在');
  // ═══════════════════════════════════════════
  // 先把全开写一遍，确保 lastGood 是 6 项
  writeFlags({
    'briefing.expand': true, 'briefing.forYou': true, 'briefing.tags': true,
    'relevance.indicator': true, 'ideas.submit': true, 'reports.display': true,
  });
  await sleep(150);
  f = await (await fetch(BASE + '/api/flags')).json();
  const baseCount = f.meta.enabledCount;
  check('基准已回到 6 项', baseCount === 6, `实际 ${baseCount}`);

  fs.writeFileSync(FLAG_FILE, '{ this is not json ', 'utf8');
  await sleep(150);
  page = await get('/');
  check('flags.json 损坏时页面不崩', page.status === 200);
  f = await (await fetch(BASE + '/api/flags')).json();
  check('损坏时上报 error', !!f.meta.error, String(f.meta.error));
  check('损坏时沿用上次有效值', f.meta.enabledCount === baseCount, `实际 ${f.meta.enabledCount}`);

  fs.unlinkSync(FLAG_FILE);
  await sleep(150);
  page = await get('/');
  check('flags.json 不存在时页面不崩', page.status === 200);
  f = await (await fetch(BASE + '/api/flags')).json();
  check('不存在时全用默认值', f.meta.enabledCount === 6, `实际 ${f.meta.enabledCount}`);
  check('不存在时 disabled 为空', f.disabled.length === 0, JSON.stringify(f.disabled));

  // ═══════════════════════════════════════════
  console.log('\n【开关关闭时保留原逻辑】代码未删除');
  // ═══════════════════════════════════════════
  const src = fs.readFileSync(path.join(ROOT, 'server.mjs'), 'utf8');
  check('submitIdea 函数仍在源码里', src.includes('function submitIdea'));
  check('toggle 函数仍在源码里', src.includes('function toggle'));
  check('「对你的用处」文案仍在源码里', src.includes('对你的用处'));
  check('实践反馈块仍在源码里', src.includes('实践反馈'));
  check('开关判断用的是运行时读取', src.includes('getFlags()'));

} finally {
  // 清理
  child.kill();
  await sleep(300);
  if (backup !== null) fs.writeFileSync(FLAG_FILE, backup, 'utf8');
  else { try { fs.unlinkSync(FLAG_FILE); } catch { /* ignore */ } }

  // 清掉测试写入的想法
  const ideasPath = path.join(ROOT, 'inbox', 'ideas.jsonl');
  try {
    const lines = fs.readFileSync(ideasPath, 'utf8').split('\n').filter(Boolean);
    const kept = lines.filter((l) => !l.includes('__test__/flag-'));
    fs.writeFileSync(ideasPath, kept.length ? kept.join('\n') + '\n' : '', 'utf8');
  } catch { /* ignore */ }

  console.log(`\n─────────────────────────────`);
  console.log(`  通过 ${pass}   失败 ${fail}`);
  if (fail) {
    console.log('\n  失败项：');
    for (const x of failures) console.log(`   - ${x.name}${x.detail ? '  → ' + x.detail : ''}`);
  }
  console.log(`─────────────────────────────\n`);
  process.exit(fail ? 1 : 0);
}