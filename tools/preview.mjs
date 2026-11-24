// Compact preview for briefing: repo + desc + first N chars of README.
import fs from 'node:fs';

const week = process.argv[2] || new Date().toISOString().slice(0, 10);
const f = `D:\\dsh-workspace\\gh-weekly\\data\\weekly-${week}.json`;
const data = JSON.parse(fs.readFileSync(f, 'utf8'));

console.log(`WEEK ${data.week}  (since ${data.since})  ${data.repos.length} repos\n`);
for (const [i, r] of data.repos.entries()) {
  console.log(`--- [${i + 1}] ${r.repo} | ${r.lang || '-'} | ★${r.stars} | forks ${r.forks}`);
  console.log(`DESC: ${r.desc || '(none)'}`);
  const body = (r.readme || '')
    .split('\n')
    .filter((l) => l.trim() && !/^\[?!\[/.test(l.trim()) && !/^<|^#{1,6}\s*$/.test(l.trim()))
    .slice(0, 18)
    .join('\n');
  console.log(`README:\n${body.slice(0, 700)}`);
  console.log('');
}