// GitHub 周报阅读器：本地服务，渲染卡片 + 接收想法
// node server.mjs [--port 11436]

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';
import { getFlags, flagOn, disabledList, DESCRIPTIONS } from './flags.mjs';
import { getStarState, getStarStates, setStar, getToken } from './tools/star.mjs';

const ROOT = 'D:\\dsh-workspace\\gh-weekly';
const DATA = path.join(ROOT, 'data');
const INBOX = path.join(ROOT, 'inbox');
const PORT = Number((process.argv.find((a) => a.startsWith('--port=')) || '').split('=')[1] || 11436);
// 监听地址：默认 0.0.0.0 让手机/局域网能访问；只在本机用可传 --host=127.0.0.1
const HOST = (process.argv.find((a) => a.startsWith('--host=')) || '').split('=')[1] || '0.0.0.0';

fs.mkdirSync(INBOX, { recursive: true });

/** 列出所有周（最新的在前），返回 [{week, path}] */
function listWeeks() {
  try {
    return fs.readdirSync(DATA)
      .filter((f) => f.startsWith('weekly-') && f.endsWith('.json'))
      .map((f) => f.replace(/^weekly-/, '').replace(/\.json$/, ''))
      .sort()
      .reverse()
      .map((week) => ({ week, path: path.join(DATA, `weekly-${week}.json`) }));
  } catch { return []; }
}

function latestFile(prefix) {
  try {
    const files = fs.readdirSync(DATA)
      .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
      .sort();
    return files.length ? path.join(DATA, files[files.length - 1]) : null;
  } catch { return null; }
}

/** 加载指定周（默认最新） */
function loadIssue(weekParam) {
  const weeks = listWeeks();
  if (!weeks.length) return null;
  const target = weekParam
    ? weeks.find((w) => w.week === weekParam) || weeks[0]
    : weeks[0];

  const weekly = JSON.parse(fs.readFileSync(target.path, 'utf8'));
  const week = weekly.week;

  const bf = path.join(DATA, `briefings-${week}.json`);
  let briefMap = {};
  if (fs.existsSync(bf)) {
    const b = JSON.parse(fs.readFileSync(bf, 'utf8'));
    for (const it of b.items || []) briefMap[it.repo] = it;
  }

  const items = (weekly.repos || []).map((r, i) => {
    const b = briefMap[r.repo] || {};
    return {
      rank: i + 1,
      repo: r.repo,
      url: r.url,
      desc: r.desc,
      lang: r.lang,
      stars: r.stars,
      forks: r.forks,
      topics: r.topics || [],
      summary: b.summary || r.desc || '',
      whyHot: b.whyHot || '',
      brief: b.brief || '',
      forYou: b.forYou || '',
      tags: b.tags || [],
      relevance: b.relevance || 'medium',
    };
  });
  return { week, generatedAt: weekly.generatedAt, since: weekly.since, items };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readIdeas() {
  try {
    return fs.readFileSync(path.join(INBOX, 'ideas.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

// reports.jsonl: one line per practice result, linked by ideaAt
function readReports() {
  const map = {};
  try {
    const lines = fs.readFileSync(path.join(INBOX, 'reports.jsonl'), 'utf8').split('\n').filter(Boolean);
    for (const l of lines) {
      try {
        const r = JSON.parse(l);
        if (r.ideaAt) map[r.ideaAt] = r;
      } catch { /* skip bad line */ }
    }
  } catch { /* no reports yet */ }
  return map;
}

function renderPage(issue, fc) {
  if (!issue) {
    return `<!doctype html><meta charset="utf-8"><title>周报</title>
<body style="background:#0d1117;color:#e6edf3;font-family:system-ui;padding:40px">
<h1>还没有周报数据</h1><p>先跑 <code>node tools/build-weekly.mjs</code></p></body>`;
  }

  const F = fc.flags;
  const ideas = F['ideas.submit'] || F['reports.display'] ? readIdeas() : [];
  const reports = F['reports.display'] ? readReports() : {};
  const ideasByRepo = {};
  for (const it of ideas) (ideasByRepo[it.repo] ||= []).push(it);

  // ── 左侧历史周栏（只显示每周卡片，最多 5 周）──
  const allWeeks = listWeeks();
  const shownWeeks = allWeeks.slice(0, 5);
  const weekList = shownWeeks.map((w) => {
    const on = w.week === issue.week;
    const label = w.week.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日');
    return `<div class="wcard${on ? ' on' : ''}" onclick="location.href='/?week=${encodeURIComponent(w.week)}'">
      <div class="wk">${esc(label)}</div>
      <div class="wt">${on ? '当前查看' : '查看该周'}</div>
    </div>`;
  }).join('');

  const cards = issue.items.map((it) => {
    // ── 原逻辑：相关度圆点（关闭后不渲染该元素）
    const relColor = it.relevance === 'high' ? '#d29922' : it.relevance === 'medium' ? '#58a6ff' : '#484f58';
    const relText = it.relevance === 'high' ? '与你相关' : it.relevance === 'medium' ? '可借鉴' : '了解即可';
    const relHtml = F['relevance.indicator']
      ? `<span class="rel" style="color:${relColor}">● ${relText}</span>`
      : '';

    // ── 原逻辑：已提交想法 + 实践反馈
    const myIdeas = ideasByRepo[it.repo] || [];
    const ideaHtml = (F['ideas.submit'] && myIdeas.length)
      ? `<div class="myideas">${myIdeas.map((x) => {
          const rp = reports[x.at];
          const head = `<div class="myidea"><span class="t">${esc(x.at ? x.at.slice(5, 16).replace('T', ' ') : '')}</span>${esc(x.text)}</div>`;
          if (!F['reports.display']) return head;
          if (!rp) return head + `<div class="pending">⏳ 已收到，等待实践</div>`;
          return head + `<div class="report"><b>🔧 实践反馈</b><div>${esc(rp.report || '')}</div></div>`;
        }).join('')}</div>`
      : '';

    // ── 原逻辑：展开区三段（逐段受各自开关控制）
    const bodyParts = [];
    if (it.whyHot) bodyParts.push(`<div class="sec"><b>为什么火</b><p>${esc(it.whyHot)}</p></div>`);
    if (it.brief) bodyParts.push(`<div class="sec"><b>简报</b><p>${esc(it.brief)}</p></div>`);
    if (F['briefing.forYou'] && it.forYou) bodyParts.push(`<div class="sec hl"><b>对你的用处</b><p>${esc(it.forYou)}</p></div>`);
    if (F['briefing.tags'] && it.tags.length) bodyParts.push(`<div class="tags">${it.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>`);

    // ── 原逻辑：输入框
    const composerHtml = F['ideas.submit']
      ? `<div class="composer">
          <textarea placeholder="说说你的想法…（比如：这个能不能用在我的知识库上？）" rows="2"></textarea>
          <button onclick="submitIdea(this)">提交想法</button>
        </div>
        <div class="ack"></div>`
      : '';

    // ── 开关关闭时：保留信息但不展开（回到最初形态）
    // 注意：若 ideas.submit 仍开启，输入区必须独立保留在卡片下方，
    // 不能因为展开区关闭而连带失去想法入口。
    if (!F['briefing.expand']) {
      const flatComposer = F['ideas.submit']
        ? `<div class="flatfoot">
            ${ideaHtml}
            <div class="composer">
              <textarea placeholder="说说你的想法…（比如：这个能不能用在我的知识库上？）" rows="2"></textarea>
              <button onclick="submitIdea(this)">提交想法</button>
            </div>
            <div class="ack"></div>
          </div>`
        : '';
      return `
    <article class="card flat" data-repo="${esc(it.repo)}">
      <div class="head static">
        <div class="rank">${it.rank}</div>
        <div class="main">
          <div class="title"><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.repo)}</a></div>
          <div class="sum">${esc(it.summary)}</div>
          <div class="meta">
            ${it.lang ? `<span class="chip">${esc(it.lang)}</span>` : ''}
            <span class="chip">★ ${it.stars.toLocaleString()}</span>
            <span class="chip">fork ${it.forks.toLocaleString()}</span>
            ${relHtml}
          </div>
        </div>
      </div>
      ${flatComposer}
    </article>`;
    }

    // ── Star 按钮（展开区里，点击直接给 GitHub 仓库点星）
    const starBtn = `<div class="starrow">
        <button class="starbtn" data-repo="${esc(it.repo)}" onclick="toggleStar(event, this)">
          <span class="staricon">☆</span>
          <span class="startext">Star</span>
        </button>
        <a class="repoLink" href="${esc(it.url)}" target="_blank" rel="noopener">在 GitHub 打开 ↗</a>
      </div>`;

    return `
    <article class="card" data-repo="${esc(it.repo)}">
      <div class="head" onclick="toggleCard(event, this)">
        <div class="rank">${it.rank}</div>
        <div class="main">
          <div class="title"><a href="${esc(it.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(it.repo)}</a></div>
          <div class="sum">${esc(it.summary)}</div>
          <div class="meta">
            ${it.lang ? `<span class="chip">${esc(it.lang)}</span>` : ''}
            <span class="chip">★ ${it.stars.toLocaleString()}</span>
            <span class="chip">fork ${it.forks.toLocaleString()}</span>
            ${relHtml}
          </div>
        </div>
        <span class="toggle">展开简报 ▾</span>
      </div>
      <div class="body">
        ${bodyParts.join('')}
        ${starBtn}
        ${ideaHtml}
        ${composerHtml}
      </div>
    </article>`;
  }).join('');

  return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GitHub 周报 · ${esc(issue.week)}</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--line:#30363d;--fg:#e6edf3;--dim:#8b949e;--acc:#58a6ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",system-ui,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:32px 20px 80px}
/* ── 左侧历史周栏 ── */
.layout{display:flex;min-height:100vh}
.weeks{flex:0 0 190px;border-right:1px solid var(--line);background:#0a0e13;padding:24px 0;overflow-y:auto;position:sticky;top:0;height:100vh}
.weeks-hd{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--dim);padding:0 16px 10px;font-weight:600}
.wcard{display:block;padding:10px 16px;cursor:pointer;border-left:3px solid transparent;transition:background .12s}
.wcard:hover{background:#151b23}
.wcard.on{background:#161b22;border-left-color:var(--acc)}
.wcard .wk{font-size:13px;font-weight:600;color:var(--fg)}
.wcard.on .wk{color:var(--acc)}
.wcard .wt{font-size:11px;color:var(--dim);margin-top:2px}
.wcard.more{border-top:1px solid var(--line);margin-top:8px;padding-top:12px;color:var(--dim);font-size:12px}
.wcard.more:hover{color:var(--acc)}
.main-col{flex:1;min-width:0}
/* ── 搜索面板（更多）── */
.search-panel{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:50;align-items:center;justify-content:center}
.search-panel.show{display:flex}
.search-box{background:var(--card);border:1px solid var(--line);border-radius:12px;width:min(560px,90vw);max-height:80vh;display:flex;flex-direction:column;overflow:hidden}
.search-box h3{margin:0;padding:16px 18px;font-size:15px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}
.search-box h3 button{background:none;border:none;color:var(--dim);font-size:18px;cursor:pointer;padding:0 4px}
.search-box h3 button:hover{color:var(--fg)}
.search-inputs{padding:14px 18px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--line)}
.search-inputs input{background:#0d1117;border:1px solid var(--line);border-radius:7px;color:var(--fg);padding:8px 10px;font:inherit;font-size:13px}
.search-inputs input:focus{outline:none;border-color:var(--acc)}
.search-results{flex:1;overflow-y:auto;padding:8px 0}
.sres{padding:9px 18px;cursor:pointer;border-left:3px solid transparent}
.sres:hover{background:#151b23;border-left-color:var(--acc)}
.sres .sk{font-size:13px;color:var(--fg)}
.sres .sm{font-size:11px;color:var(--dim);margin-top:2px}
.search-empty{padding:24px;text-align:center;color:var(--dim);font-size:13px}
/* ── Star 按钮 ── */
.starrow{display:flex;align-items:center;gap:14px;margin:14px 0 12px;padding-top:12px;border-top:1px solid var(--line)}
.starbtn{display:inline-flex;align-items:center;gap:7px;background:#21262d;border:1px solid var(--line);border-radius:8px;color:var(--fg);padding:7px 15px;font-size:13px;cursor:pointer;font-family:inherit;transition:all .15s}
.starbtn:hover{border-color:#d29922;color:#e3b341}
.starbtn:disabled{opacity:.5;cursor:default}
.starbtn.on{background:#d29922;border-color:#d29922;color:#0d1117;font-weight:600}
.starbtn.on .staricon{color:#0d1117}
.starbtn.gone{border-color:#f85149;color:#f85149;opacity:.7}
.staricon{font-size:15px;line-height:1}
.repoLink{font-size:12px;color:var(--dim);text-decoration:none}
.repoLink:hover{color:var(--acc)}
header{margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid var(--line)}
h1{margin:0 0 6px;font-size:26px;letter-spacing:-.3px}
.sub{color:var(--dim);font-size:13px}
.count{color:var(--acc)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:14px;overflow:hidden;transition:border-color .15s}
.card:hover{border-color:#484f58}
.head{display:flex;gap:14px;align-items:flex-start;padding:16px 18px;cursor:pointer}
.rank{flex:0 0 30px;height:30px;border-radius:8px;background:#21262d;color:var(--dim);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px}
.main{flex:1;min-width:0}
.title{font-weight:600;font-size:16px;margin-bottom:3px}
.title a{color:var(--fg);text-decoration:none}
.title a:hover{color:var(--acc)}
.sum{color:#c9d1d9;font-size:14px;margin-bottom:8px}
.meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px}
.chip{background:#21262d;color:var(--dim);padding:2px 8px;border-radius:20px}
.rel{font-size:12px}
.toggle{flex:0 0 auto;background:#21262d;border:1px solid var(--line);color:var(--dim);border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;white-space:nowrap}
.toggle:hover{color:var(--fg);border-color:#484f58}
.body{display:none;padding:0 18px 18px 62px;border-top:1px solid var(--line);margin-top:2px;padding-top:14px}
.card.open .body{display:block}
.sec{margin-bottom:12px}
.sec b{display:block;font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.sec p{margin:0;color:#c9d1d9;font-size:14px}
.sec.hl{background:#12261a;border-left:3px solid #2ea043;padding:10px 12px;border-radius:6px}
.sec.hl b{color:#3fb950}
.sec.hl p{color:#d7f0dd}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.tags span{font-size:12px;color:var(--acc);background:#0d2847;padding:2px 8px;border-radius:20px}
.composer{display:flex;gap:8px;margin-top:14px}
.composer textarea{flex:1;background:#0d1117;border:1px solid var(--line);border-radius:8px;color:var(--fg);padding:9px 11px;font:inherit;font-size:13px;resize:vertical;min-height:56px}
.composer textarea:focus{outline:none;border-color:var(--acc)}
.composer button{background:#238636;border:none;color:#fff;border-radius:8px;padding:0 16px;font-size:13px;cursor:pointer;font-weight:500}
.composer button:hover{background:#2ea043}
.composer button:disabled{background:#21262d;color:var(--dim);cursor:default}
.ack{font-size:12px;min-height:16px;margin-top:6px;color:#3fb950}
.ack.err{color:#f85149}
.myideas{margin:12px 0;padding:10px 12px;background:#0d2847;border-radius:8px;border:1px solid #1f6feb}
.myidea{font-size:13px;color:#c9d1d9;margin-bottom:4px}
.myidea .t{color:#58a6ff;margin-right:8px;font-size:11px}
.pending{font-size:12px;color:#8b949e;margin:0 0 8px 0;padding-left:2px}
.report{margin:8px 0 10px;padding:10px 12px;background:#1c2128;border-left:3px solid #d29922;border-radius:6px}
.report b{display:block;font-size:12px;color:#d29922;margin-bottom:5px}
.report div{font-size:13px;color:#c9d1d9;white-space:pre-wrap;line-height:1.65}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);color:#484f58;font-size:12px;text-align:center}
/* ── 功能开关相关样式 ── */
.card.flat{cursor:default}
.head.static{cursor:default}
.head.static:hover{background:none}
.flatfoot{padding:0 18px 16px 62px;border-top:1px solid var(--line);background:#12171e}
.flatfoot .myideas{margin-top:12px}
.flagbar{background:#2d2412;border:1px solid #9e6a03;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:12px;color:#f0d9a0}
.flagbar b{color:#e3b341}
.flagbar code{background:#1c2128;padding:1px 5px;border-radius:4px;color:#e3b341;font-size:11px}

/* ══════════════════════════════════════════════════════════════
   响应式：手机 / 窄屏
   问题背景：左侧历史栏固定 190px + 内容区 flex:1，手机上
   190px 占了近半屏，右侧内容被挤成一列竖排。
   ══════════════════════════════════════════════════════════════ */

/* 平板及以下：历史栏收窄 */
@media (max-width: 1024px) {
  .weeks{flex:0 0 150px}
  .wcard{padding:9px 12px}
  .wcard .wk{font-size:12px}
  .wcard .wt{font-size:10px}
}

/* 手机：历史栏改成顶部横向滚动条，内容占满宽度 */
@media (max-width: 720px) {
  /* 全局禁止横向溢出，长仓库名/长单词强制换行 */
  html,body{max-width:100%;overflow-x:hidden}
  *{word-break:break-word;overflow-wrap:anywhere}

  .layout{flex-direction:column;min-height:auto}
  .weeks{
    flex:none;
    width:100%;
    height:auto;
    position:static;
    border-right:none;
    border-bottom:1px solid var(--line);
    padding:10px 0 8px;
    overflow-x:auto;
    overflow-y:hidden;
    white-space:nowrap;
    -webkit-overflow-scrolling:touch;
  }
  .weeks-hd{padding:0 12px 8px;font-size:10px}
  /* 周卡变成横排的小药丸 */
  .wcard{
    display:inline-block;
    vertical-align:top;
    width:auto;
    min-width:112px;
    padding:7px 12px;
    border-left:none;
    border-bottom:2px solid transparent;
    border-radius:8px;
    margin:0 6px;
  }
  .wcard.on{border-left:none;border-bottom-color:var(--acc)}
  .wcard .wk{font-size:12.5px}
  .wcard .wt{font-size:10px;margin-top:1px}
  .wcard.more{margin-top:0;padding-top:7px;border-top:none}

  .main-col{width:100%}
  .wrap{padding:16px 12px 48px}

  /* 标题缩一档 */
  h1{font-size:20px;line-height:1.3}
  .sub{font-size:12px;line-height:1.5}

  /* 卡片：排名徽章和内容并排，按钮换行到下面 */
  .head{padding:13px 14px;gap:10px;flex-wrap:wrap}
  .rank{flex:0 0 26px;height:26px;font-size:12px}
  .title{font-size:15px;word-break:break-word}
  .sum{font-size:13px;margin-bottom:6px}
  .toggle{
    flex:1 0 100%;
    margin-top:8px;
    text-align:center;
    padding:7px 12px;
  }
  .body{padding:0 14px 14px 14px}

  /* 展开区 */
  .sec p{font-size:13px;line-height:1.6}
  .sec.hl{padding:9px 11px}

  /* Star 行：按钮和链接各占一行更好点 */
  .starrow{flex-wrap:wrap;gap:10px;margin:12px 0 10px}
  .starbtn{padding:8px 16px;font-size:13px}
  .repoLink{font-size:11.5px}

  /* 输入区 */
  .composer{flex-direction:column;gap:8px}
  .composer textarea{min-height:64px;font-size:14px}
  .composer button{width:100%;padding:10px;font-size:14px}

  /* 搜索面板全屏化 */
  .search-box{width:100%;max-width:100%;max-height:92vh;border-radius:12px 12px 0 0}
  .search-panel{align-items:flex-end}
  .search-inputs input{font-size:15px;padding:10px}

  /* 告警条 */
  .flagbar{font-size:11px;padding:9px 11px;line-height:1.5}
}

/* 超窄屏（≤380px）再收一档 */
@media (max-width: 380px) {
  .wrap{padding:12px 9px 40px}
  h1{font-size:18px}
  .chip{font-size:11px;padding:1px 7px}
  .wcard{min-width:100px;padding:6px 10px}
}

/* 触屏设备：去掉 hover 效果带来的粘滞感 */
@media (hover: none) {
  .card:hover{border-color:var(--line)}
  .toggle:hover,.starbtn:hover{border-color:var(--line)}
}
</style></head>
<body>
<div class="layout">
  <aside class="weeks">
    <div class="weeks-hd">历史周报</div>
    ${weekList}
    <div class="wcard more" onclick="openSearch()">
      <div class="wk">更多…</div>
      <div class="wt">按时间 / 关键词搜索</div>
    </div>
  </aside>
  <div class="main-col">
    <div class="wrap">
${(() => {
  const off = disabledList(F);
  if (!off.length) return '';
  return `<div class="flagbar"><b>⚠ ${off.length} 项功能已被开关关闭：</b>` +
    off.map((k) => `<code>${esc(k)}</code>`).join(' ') +
    `<br>改 <code>config/flags.json</code> 即可恢复，无需重启。</div>`;
})()}
<header>
  <h1>GitHub 周热榜 · ${esc(issue.week)}</h1>
  <div class="sub">本周新建且 star 增长最快的 <span class="count">${issue.items.length}</span> 个项目 · 统计起始 ${esc(issue.since)} · 点击卡片看简报，有想法直接写在下面</div>
</header>
${cards}
<footer>小K 出品 · 数据源 GitHub Search API · 每周一自动更新</footer>
    </div>
  </div>
</div>

<!-- 搜索面板 -->
<div class="search-panel" id="searchPanel">
  <div class="search-box">
    <h3>搜索历史周报 <button onclick="closeSearch()" aria-label="关闭">×</button></h3>
    <div class="search-inputs">
      <input id="qKeyword" placeholder="关键词（项目名 / 概括 / 简报内容）" autocomplete="off">
      <input id="qDate" type="month" placeholder="按月份筛选">
    </div>
    <div class="search-results" id="searchResults"></div>
  </div>
</div>
<script>
// ── 卡片展开/收起：点卡片任意处（链接除外）──
function toggleCard(ev, head){
  if (ev.target.closest('a')) return;
  const card = head.closest('.card');
  const btn = card.querySelector('.toggle');
  card.classList.toggle('open');
  if (btn) btn.textContent = card.classList.contains('open') ? '收起 ▴' : '展开简报 ▾';
}

// ── Star：点击直接给 GitHub 仓库点星 ──
async function toggleStar(ev, btn){
  ev.stopPropagation();
  const repo = btn.dataset.repo;
  const on = btn.classList.contains('on');
  btn.disabled = true;
  const icon = btn.querySelector('.staricon');
  const text = btn.querySelector('.startext');
  const prev = text.textContent;
  text.textContent = '处理中…';
  try{
    const r = await fetch('/star', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ repo, starred: !on })
    });
    const j = await r.json();
    if(r.ok && j.ok){
      btn.classList.toggle('on', j.starred);
      icon.textContent = j.starred ? '★' : '☆';
      text.textContent = j.starred ? '已 Star' : 'Star';
    } else if(j.repoMissing){
      text.textContent = '仓库已不存在';
      btn.disabled = true;
      btn.title = '这个仓库可能已被删除或改名，无法 Star';
      btn.classList.add('gone');
    } else {
      text.textContent = prev;
      alert('操作失败：' + (j.error || r.status));
    }
  }catch(e){
    text.textContent = prev;
    alert('网络错误：' + e.message);
  }finally{ btn.disabled = false; }
}

// ── 初始化 star 状态 ──
(async function initStars(){
  const btns = Array.from(document.querySelectorAll('.starbtn'));
  if(!btns.length) return;
  const repos = [...new Set(btns.map(b=>b.dataset.repo))];
  try{
    const r = await fetch('/stars?repos=' + encodeURIComponent(repos.join(',')));
    const j = await r.json();
    if(!j.ok) return;
    btns.forEach(b=>{
      const st = j.states[b.dataset.repo];
      if(st && st.starred === true){
        b.classList.add('on');
        b.querySelector('.staricon').textContent = '★';
        b.querySelector('.startext').textContent = '已 Star';
      }
    });
  }catch(e){ /* 静默 */ }
})();

// ── 搜索面板 ──
function openSearch(){
  document.getElementById('searchPanel').classList.add('show');
  document.getElementById('qKeyword').focus();
  runSearch();
}
function closeSearch(){
  document.getElementById('searchPanel').classList.remove('show');
}
document.getElementById('searchPanel').addEventListener('click', (e)=>{
  if(e.target.id === 'searchPanel') closeSearch();
});
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeSearch();
});

let searchTimer = null;
async function runSearch(){
  const kw = document.getElementById('qKeyword').value.trim();
  const ym = document.getElementById('qDate').value;
  const box = document.getElementById('searchResults');
  box.innerHTML = '<div class="search-empty">搜索中…</div>';
  try{
    const qs = new URLSearchParams();
    if(kw) qs.set('q', kw);
    if(ym) qs.set('ym', ym);
    const r = await fetch('/search?' + qs.toString());
    const j = await r.json();
    if(!j.ok){ box.innerHTML = '<div class="search-empty">搜索失败：' + (j.error||'') + '</div>'; return; }
    if(!j.results.length){ box.innerHTML = '<div class="search-empty">没有匹配的周报</div>'; return; }
    box.innerHTML = j.results.map(x=>
      '<div class="sres" onclick="location.href=\\'/?week=' + encodeURIComponent(x.week) + '\\'">' +
        '<div class="sk">' + x.week + ' · ' + x.count + ' 个项目</div>' +
        '<div class="sm">' + (x.hits.length ? '匹配：' + x.hits.slice(0,3).join('、') : '整周') + '</div>' +
      '</div>'
    ).join('');
  }catch(e){
    box.innerHTML = '<div class="search-empty">错误：' + e.message + '</div>';
  }
}
document.getElementById('qKeyword').addEventListener('input', ()=>{
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 250);
});
document.getElementById('qDate').addEventListener('change', runSearch);

async function submitIdea(btn){
  const card = btn.closest('.card');
  const ta = card.querySelector('textarea');
  const ack = card.querySelector('.ack');
  const text = ta.value.trim();
  if(!text){ ack.textContent='先写点什么'; ack.className='ack err'; return; }
  btn.disabled = true; ack.textContent = '提交中…'; ack.className='ack';
  try{
    const r = await fetch('/idea', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ repo: card.dataset.repo, text })
    });
    const j = await r.json();
    if(r.ok && j.ok){
      ack.textContent = '已收到 ✓ 实践员会在这个项目下回复你';
      ta.value = '';
      const box = card.querySelector('.myideas') || (()=>{ const d=document.createElement('div'); d.className='myideas'; card.querySelector('.composer').before(d); return d; })();
      box.insertAdjacentHTML('beforeend', '<div class="myidea"><span class="t">刚刚</span>' + text.replace(/[<>&]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</div>');
    } else {
      ack.textContent = '失败：' + (j.error || r.status); ack.className='ack err';
    }
  }catch(e){
    ack.textContent = '网络错误：' + e.message; ack.className='ack err';
  }finally{ btn.disabled = false; }
}
</script>
</body></html>`;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
    const fc = getFlags();
    const weekParam = (u.searchParams.get('week') || '').trim() || undefined;
    let issue = null;
    try { issue = loadIssue(weekParam); } catch (e) { console.error('load issue failed:', e.message); }
    const html = renderPage(issue, fc);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }

  if (req.method === 'POST' && u.pathname === '/idea') {
    // ── 开关：ideas.submit 关闭时接口下线（保留原逻辑代码，只是不启用）
    const fc = getFlags();
    if (!fc.flags['ideas.submit']) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: '想法提交功能已被开关关闭（ideas.submit=false）' }));
      return;
    }
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => {
      try {
        const j = JSON.parse(raw || '{}');
        const repo = String(j.repo || '').trim();
        const text = String(j.text || '').trim();
        if (!repo || !text) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'repo 和 text 不能为空' }));
          return;
        }
        const rec = { repo, text, at: new Date().toISOString(), status: 'pending' };
        fs.appendFileSync(path.join(INBOX, 'ideas.jsonl'), JSON.stringify(rec) + '\n', 'utf8');
        console.log(`[idea] ${repo}: ${text.slice(0, 60)}`);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, at: rec.at }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && u.pathname === '/api/ideas') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(readIdeas()));
    return;
  }

  // ── 功能开关状态（只读，便于排查「为什么某个功能不见了」）
  if (req.method === 'GET' && u.pathname === '/api/flags') {
    const fc = getFlags();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      flags: fc.flags,
      meta: { ...fc.meta, descriptions: DESCRIPTIONS },
      disabled: disabledList(fc.flags),
    }, null, 2));
    return;
  }

  // ── Star / Unstar ───────────────────────────────────────────
  if (req.method === 'POST' && u.pathname === '/star') {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 4096) req.destroy(); });
    req.on('end', async () => {
      try {
        const j = JSON.parse(raw || '{}');
        const repo = String(j.repo || '').trim();
        const starred = j.starred !== false;
        if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'repo 格式不对（应为 owner/name）' }));
          return;
        }
        const r = await setStar(repo, starred);
    // 仓库不存在/已删除时 GitHub 返回 404，给前端一个可分辨的标记
    const notFound = !r.ok && /\b404\b/.test(String(r.error || ''));
    if (notFound) r.repoMissing = true;
    console.log(`[star] ${repo} -> ${starred ? 'on' : 'off'} ${r.ok ? 'OK' : 'FAIL: ' + r.error}`);
        res.writeHead(r.ok ? 200 : 500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(r));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── 批量查 star 状态 ─────────────────────────────────────────
  if (req.method === 'GET' && u.pathname === '/stars') {
    (async () => {
      try {
        const raw = u.searchParams.get('repos') || '';
        const repos = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30);
        if (!repos.length) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, states: {} }));
          return;
        }
        const states = await getStarStates(repos);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true, states, hasToken: !!getToken() }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    })();
    return;
  }

  // ── 搜索历史周报 ─────────────────────────────────────────────
  if (req.method === 'GET' && u.pathname === '/search') {
    try {
      const kw = (u.searchParams.get('q') || '').trim().toLowerCase();
      const ym = (u.searchParams.get('ym') || '').trim(); // YYYY-MM
      const out = [];

      for (const w of listWeeks()) {
        if (ym && !w.week.startsWith(ym)) continue;

        let count = 0;
        const hits = [];
        try {
          const weekly = JSON.parse(fs.readFileSync(w.path, 'utf8'));
          const repos = weekly.repos || [];
          count = repos.length;

          if (kw) {
            // 简报内容也纳入搜索
            let briefs = {};
            const bf = path.join(DATA, `briefings-${w.week}.json`);
            if (fs.existsSync(bf)) {
              const b = JSON.parse(fs.readFileSync(bf, 'utf8'));
              for (const it of b.items || []) briefs[it.repo] = it;
            }
            for (const r of repos) {
              const b = briefs[r.repo] || {};
              const hay = [r.repo, r.desc, b.summary, b.whyHot, b.brief, b.forYou, ...(b.tags || [])]
                .filter(Boolean).join(' ').toLowerCase();
              if (hay.includes(kw)) hits.push(r.repo);
            }
            if (!hits.length) continue;
          }
        } catch { continue; }

        out.push({ week: w.week, count, hits });
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, results: out }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

server.listen(PORT, HOST, () => {
  const issue = (() => { try { return loadIssue(); } catch { return null; } })();
  const fc = getFlags();
  const off = disabledList(fc.flags);
  console.log(`\n  GitHub 周报已就绪`);
  console.log(`    本机：  http://127.0.0.1:${PORT}`);
  if (HOST === '0.0.0.0') {
    // 列出局域网地址，手机上用这个
    try {
      for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
        for (const a of addrs || []) {
          if (a.family === 'IPv4' && !a.internal) {
            console.log(`    局域网： http://${a.address}:${PORT}   (${name}, 手机用这个)`);
          }
        }
      }
    } catch { /* ignore */ }
  }
  console.log(`  周期：${issue ? issue.week : '(无数据)'}   项目数：${issue ? issue.items.length : 0}`);
  console.log(`  想法收件箱：${path.join(INBOX, 'ideas.jsonl')}`);
  console.log(`  功能开关：${fc.meta.enabledCount}/${fc.meta.totalCount} 开启${off.length ? '  已关闭: ' + off.join(', ') : ''}`);
  if (fc.meta.killAll) console.log('  ⚠ GHW_FLAGS_OFF=1 已启用，所有新功能下线');
  if (fc.meta.error) console.log(`  ⚠ flags.json 解析失败（沿用上次有效值）：${fc.meta.error}`);
  console.log('');
});