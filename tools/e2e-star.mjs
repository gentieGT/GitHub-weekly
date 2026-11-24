// 端到端测试：模拟浏览器点击流程
// 1. 取页面 HTML，解析出一个真实的 repo
// 2. 查 star 状态
// 3. star 它
// 4. 再查，确认变成 true
// 5. 回滚（unstar），保持干净
import { getStarState, setStar } from './star.mjs';

const BASE = 'http://127.0.0.1:11436';

async function main() {
  // 从页面拿实际的 repo 列表（绕过 HTML 解析，直接读数据文件）
  const fs = await import('node:fs');
  const data = JSON.parse(fs.readFileSync('D:\\dsh-workspace\\gh-weekly\\data\\weekly-2026-11-23.json', 'utf8'));

  // 挑一个确认存在的仓库
  const target = 'deepseek-ai/DeepSeek-V3';
  console.log('目标仓库:', target);

  console.log('\n[1] 初始状态');
  const s0 = await getStarState(target);
  console.log('   ', JSON.stringify(s0));

  // 如果已经 star 了，先取消，保证从干净状态开始
  if (s0.starred === true) {
    console.log('   原本已 star，先取消');
    await setStar(target, false);
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log('\n[2] 执行 star');
  const r1 = await setStar(target, true);
  console.log('   ', JSON.stringify(r1));

  console.log('\n[3] 验证状态（绕过缓存）');
  // 直接打 API
  const { execSync } = await import('node:child_process');
  const out = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
  const token = out.match(/^password=(.+)$/m)[1].trim();
  const verify = async () => {
    const r = await fetch(`https://api.github.com/user/starred/${target}`, {
      headers: { 'Authorization': 'Bearer ' + token, 'User-Agent': 'dsh-agent' },
    });
    return r.status; // 204 = starred, 404 = not
  };
  const st1 = await verify();
  console.log('    GitHub 返回:', st1, st1 === 204 ? '(已 star ✓)' : '(未 star ✗)');

  console.log('\n[4] 通过 HTTP 接口验证 /stars 端点');
  const res = await fetch(`${BASE}/stars?repos=${encodeURIComponent(target)}`);
  const j = await res.json();
  console.log('   ', JSON.stringify(j.states[target]));

  console.log('\n[5] 回滚（取消 star，保持你的 GitHub 干净）');
  const r2 = await setStar(target, false);
  console.log('   ', JSON.stringify(r2));
  const st2 = await verify();
  console.log('    GitHub 返回:', st2, st2 === 404 ? '(已取消 ✓)' : '(还在 ✗)');

  const pass = st1 === 204 && st2 === 404 && r1.ok && r2.ok;
  console.log('\n════════════════════════════');
  console.log(pass ? '  ✓ 全部通过' : '  ✗ 有失败项');
  console.log('════════════════════════════');
  process.exit(pass ? 0 : 1);
}

main();