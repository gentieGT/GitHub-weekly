// 单独设置仓库 topics（PATCH 里带 topics 有时不生效，用专门的端点）
import { execSync } from 'node:child_process';

const REPO = 'gentieGT/GitHub-weekly';
const TOPICS = [
  'github-trending',
  'weekly-report',
  'nodejs',
  'zero-dependency',
  'self-hosted',
  'chinese',
  'dashboard',
  'tech-radar',
];

const out = execSync('git credential fill', {
  input: 'protocol=https\nhost=github.com\n\n',
  encoding: 'utf8',
});
const token = out.match(/^password=(.+)$/m)[1].trim();

const H = {
  'Authorization': 'Bearer ' + token,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'dsh-agent',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json; charset=utf-8',
};

// PUT /repos/{owner}/{repo}/topics
const r = await fetch(`https://api.github.com/repos/${REPO}/topics`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({ names: TOPICS }),
});

console.log('PUT topics 状态:', r.status);
if (!r.ok) {
  console.log((await r.text()).slice(0, 300));
  process.exit(1);
}
const j = await r.json();
console.log('已设置 topics:', (j.names || []).join(', '));