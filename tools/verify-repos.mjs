// 验证本周榜里的仓库是否真实存在（Node 的 TLS 栈可用，PowerShell 不行）
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('D:\\dsh-workspace\\gh-weekly\\data\\weekly-2026-11-23.json', 'utf8'));
const H = { 'User-Agent': 'dsh-agent', 'Accept': 'application/vnd.github+json' };

for (const r of data.repos) {
  try {
    const res = await fetch(`https://api.github.com/repos/${r.repo}`, { headers: H });
    if (res.ok) {
      const j = await res.json();
      console.log(`  ✓ ${r.repo.padEnd(42)} full_name=${j.full_name}`);
    } else {
      console.log(`  ✗ ${r.repo.padEnd(42)} HTTP ${res.status}`);
    }
  } catch (e) {
    console.log(`  ✗ ${r.repo.padEnd(42)} ERR ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 120));
}