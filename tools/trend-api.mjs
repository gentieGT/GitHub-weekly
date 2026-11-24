// Fetch weekly-hot repos via GitHub Search API (works without auth, 60 req/h).
// node trend-api.mjs [days]

const days = Number(process.argv[2] || 7);
const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

const queries = [
  `created:>=${since}`,                      // brand new repos this week
  `pushed:>=${since} stars:>500`,            // active popular repos
];

const out = [];
for (const q of queries) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=15`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'dsh-agent',
        'Accept': 'application/vnd.github+json',
      },
    });
    console.log(`\n=== q="${q}" -> ${r.status} ===`);
    if (!r.ok) { console.log((await r.text()).slice(0, 200)); continue; }
    const j = await r.json();
    console.log('total_count:', j.total_count);
    for (const [i, it] of (j.items || []).entries()) {
      console.log(`${i + 1}. ${it.full_name}  [${it.language || '-'}]  ★${it.stargazers_count}  forks ${it.forks_count}`);
      console.log(`   ${(it.description || '(no description)').slice(0, 110)}`);
      out.push({
        repo: it.full_name,
        desc: it.description || '',
        lang: it.language || '',
        stars: it.stargazers_count,
        forks: it.forks_count,
        url: it.html_url,
        created: it.created_at,
        pushed: it.pushed_at,
        topics: it.topics || [],
        source: q,
      });
    }
  } catch (e) {
    console.log('ERR', q, e.message);
  }
}

const fs = await import('node:fs');
fs.writeFileSync('D:\\dsh-workspace\\gh-weekly\\data\\raw-api.json', JSON.stringify(out, null, 2), 'utf8');
console.log('\n[saved raw-api.json,', out.length, 'entries]');