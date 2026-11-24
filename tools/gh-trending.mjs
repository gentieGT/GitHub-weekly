// Fetch GitHub Trending (weekly) and extract repos.
// node gh-trending.mjs [--proxy]

import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { URL } from 'node:url';

const USE_PROXY = process.argv.includes('--proxy');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const TARGET = 'https://github.com/trending?since=weekly';

function directGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      host: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return directGet(new URL(res.headers.location, url).toString()).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function proxyGet(url, depth = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const port = u.port ? Number(u.port) : 443;
    const sock = net.connect({ host: '127.0.0.1', port: 7897 });
    let buf = '';
    sock.once('error', reject);
    sock.once('connect', () => sock.write(`CONNECT ${u.hostname}:${port} HTTP/1.1\r\nHost: ${u.hostname}:${port}\r\n\r\n`));
    const onData = (d) => {
      buf += d.toString('latin1');
      const i = buf.indexOf('\r\n\r\n');
      if (i === -1) return;
      sock.removeListener('data', onData);
      if (!/ 200 /.test(buf.split('\r\n')[0])) return reject(new Error('proxy refused'));
      const rest = buf.slice(i + 4);
      if (rest.length) sock.unshift(Buffer.from(rest, 'latin1'));
      const secure = tls.connect({ socket: sock, servername: u.hostname }, () => {
        const req = https.request({
          host: u.hostname, path: u.pathname + u.search, method: 'GET',
          headers: { 'User-Agent': UA, 'Accept': 'text/html' },
          createConnection: () => secure, servername: u.hostname,
        }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', async () => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
              secure.destroy();
              try {
                const next = new URL(res.headers.location, url).toString();
                console.log('[redirect ->', next, ']');
                resolve(await proxyGet(next, depth + 1));
              } catch (e) { reject(e); }
              return;
            }
            resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
          });
        });
        req.on('error', reject);
        req.end();
      });
      secure.once('error', reject);
    };
    sock.on('data', onData);
  });
}

async function get(url) {
  if (USE_PROXY) return proxyGet(url);
  try {
    const r = await directGet(url);
    if (r.status === 200 && r.body.length > 5000) return r;
    console.log('[direct returned', r.status, r.body.length, 'bytes, trying proxy]');
  } catch (e) { console.log('[direct failed:', e.message, '- trying proxy]'); }
  return proxyGet(url);
}

const r = await get(TARGET);
console.log('status:', r.status, 'bytes:', r.body.length);
if (r.status !== 200) { console.log(r.body.slice(0, 300)); process.exit(1); }

// Split into <article> blocks
const articles = r.body.split('<article').slice(1);
console.log('articles found:', articles.length);

const repos = [];
for (const a of articles) {
  // repo path: <h2 ...><a href="/owner/name" ...>
  const hrefM = a.match(/<h2[^>]*>[\s\S]*?<a[^>]+href="\/([^"\/]+)\/([^"]+)"/);
  if (!hrefM) continue;
  const repo = `${hrefM[1]}/${hrefM[2]}`;

  // description
  const descM = a.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  const desc = descM ? descM[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';

  // language
  const langM = a.match(/<span[^>]*itemprop="programmingLanguage"[^>]*>([^<]+)<\/span>/);
  const lang = langM ? langM[1].trim() : '';

  // total stars
  const starM = a.match(/href="\/[^"]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/);
  const stars = starM ? starM[1].replace(/<[^>]+>/g, '').replace(/[^\d]/g, '') : '';

  // weekly stars gained
  const weekM = a.match(/([\d,]+)\s+stars?\s+this\s+week/);
  const weekStars = weekM ? weekM[1] : '';

  repos.push({ repo, desc, lang, stars, weekStars });
}

console.log('\n=== parsed', repos.length, 'repos ===');
for (const [i, x] of repos.entries()) {
  console.log(`${i + 1}. ${x.repo}  [${x.lang}]  ★${x.stars}  +${x.weekStars}/week`);
  console.log(`   ${x.desc.slice(0, 100)}`);
}

const fs = await import('node:fs');
fs.writeFileSync('D:\\dsh-workspace\\gh-weekly\\data\\raw-trending.json', JSON.stringify(repos, null, 2), 'utf8');
console.log('\n[saved raw-trending.json]');