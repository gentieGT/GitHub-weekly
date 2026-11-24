// 从 git credential 取 token，验证 GitHub API 权限
import { execSync } from 'node:child_process';

function getToken() {
  const input = 'protocol=https\nhost=github.com\n\n';
  const out = execSync('git credential fill', { input, encoding: 'utf8' });
  const m = out.match(/^password=(.+)$/m);
  return m ? m[1].trim() : null;
}

const token = getToken();
if (!token) { console.log('没拿到 token'); process.exit(1); }
console.log('token 前缀:', token.slice(0, 4) + '...' + token.slice(-4), ' 长度:', token.length);

const H = {
  'Authorization': 'Bearer ' + token,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'dsh-agent',
  'X-GitHub-Api-Version': '2022-11-28',
};

// 1. 当前用户
const me = await fetch('https://api.github.com/user', { headers: H });
console.log('\n/user ->', me.status);
if (me.ok) {
  const j = await me.json();
  console.log('  登录为:', j.login, ' id:', j.id);
} else {
  console.log(' ', (await me.text()).slice(0, 200));
}

// 2. 限流额度（顺便确认 token 生效）
const rl = await fetch('https://api.github.com/rate_limit', { headers: H });
if (rl.ok) {
  const j = await rl.json();
  console.log('\n限流:', j.resources.core.limit, '/时  剩余', j.resources.core.remaining);
}

// 3. 检查 token scopes（响应头里）
console.log('\nscopes:', me.headers.get('x-oauth-scopes') || '(未返回)');

// 4. 试探 star 能力：查一个仓库是否已 star（只读，不改状态）
const testRepo = 'ItsNotRexed/Leonida';
const st = await fetch(`https://api.github.com/user/starred/${testRepo}`, { headers: H });
console.log(`\n/user/starred/${testRepo} ->`, st.status, st.status === 204 ? '(已star)' : st.status === 404 ? '(未star)' : '');