// Build the weekly dataset: top 10 new-hot repos + README excerpts.
// node build-weekly.mjs

import fs from 'node:fs';

const days = 7;
const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const GH_HEADERS = { 'User-Agent': 'dsh-agent', 'Accept': 'application/vnd.github+json' };

// 1. search: new repos this week, by stars
const q = `created:>=${since}`;
const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`;
const sres = await fetch(searchUrl, { headers: GH_HEADERS });
if (!sres.ok) { console.error('search failed', sres.status, await sres.text()); process.exit(1); }
const sj = await sres.json();
const items = (sj.items || []).slice(0, 10);
console.log(`search ok: ${items.length} repos (since ${since})`);

// 2. README excerpt for each
async function readme(repo) {
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/readme`, {
      headers: { ...GH_HEADERS, 'Accept': 'application/vnd.github.raw' },
    });
    if (!r.ok) return '';
    const txt = await r.text();
    // strip HTML tags, collapse blank lines, cap length
    return txt
      .replace(/<img[^>]*>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 2200);
  } catch (e) { return ''; }
}

const out = [];
for (const it of items) {
  const excerpt = await readme(it.full_name);
  console.log(`  ${it.full_name}: readme ${excerpt.length} chars`);
  out.push({
    repo: it.full_name,
    url: it.html_url,
    desc: it.description || '',
    lang: it.language || '',
    stars: it.stargazers_count,
    forks: it.forks_count,
    created: it.created_at,
    topics: it.topics || [],
    readme: excerpt,
  });
}

const week = new Date().toISOString().slice(0, 10);
const payload = { week, generatedAt: new Date().toISOString(), since, source: 'github search (created within 7d, sorted by stars)', repos: out };
const target = `D:\\dsh-workspace\\gh-weekly\\data\\weekly-${week}.json`;
fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
console.log(`\n[saved ${target}]`);
console.log('total bytes:', fs.statSync(target).size);