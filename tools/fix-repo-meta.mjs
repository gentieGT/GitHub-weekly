// 修正 GitHub 仓库的 About 描述（中文）
// 用 Node 而不是 PowerShell：后者发 JSON 会按 GBK 编码，中文全变问号
import { execSync } from 'node:child_process';

const REPO = 'gentieGT/GitHub-weekly';

const out = execSync('git credential fill', {
  input: 'protocol=https\nhost=github.com\n\n',
  encoding: 'utf8',
});
const token = out.match(/^password=(.+)$/m)[1].trim();

const DESCRIPTION = '每周 GitHub 热榜阅读器：自动抓取本周最火的 10 个项目，可折叠简报、一键 Star、历史周栏与搜索。Node 零依赖，本地运行。';
const HOMEPAGE = '';

const r = await fetch(`https://api.github.com/repos/${REPO}`, {
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'dsh-agent',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json; charset=utf-8',
  },
  body: JSON.stringify({
    description: DESCRIPTION,
    homepage: HOMEPAGE,
    topics: ['github-trending', 'weekly-report', 'nodejs', 'zero-dependency', 'chinese', 'self-hosted'],
  }),
});

console.log('PATCH 状态:', r.status);
if (!r.ok) {
  console.log((await r.text()).slice(0, 400));
  process.exit(1);
}

const j = await r.json();
console.log('新 description:', j.description);
console.log('topics:', (j.topics || []).join(', '));

// 验证：读回来确认没有问号
const chk = await fetch(`https://api.github.com/repos/${REPO}`, {
  headers: { 'Authorization': 'Bearer ' + token, 'User-Agent': 'dsh-agent' },
});
const c = await chk.json();
const bad = /\?{2,}/.test(c.description || '');
console.log('\n读回:', c.description);
console.log(bad ? '✗ 仍有问号' : '✓ 中文正常');