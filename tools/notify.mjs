// 企业微信群机器人推送
// 用法：node notify.mjs "消息内容" [--markdown]
// 配置：config/wecom.json 里的 webhook 字段
//
// 群机器人 webhook 获取方式（需要你在企业微信里操作）：
//   企业微信 → 群聊 → 右上角 ... → 群机器人 → 添加机器人 → 复制 Webhook 地址
// 地址形如：https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx

import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\dsh-workspace\\gh-weekly';
const CONFIG = path.join(ROOT, 'config', 'wecom.json');

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch {
    return { webhook: '', enabled: false };
  }
}

export function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), 'utf8');
}

/** 发送文本消息（最长 2048 字节） */
export async function sendText(text, webhook) {
  const url = webhook || loadConfig().webhook;
  if (!url) return { ok: false, error: '没有配置 webhook（config/wecom.json）' };

  // 企业微信限制 2048 字节，超出要截断
  const buf = Buffer.from(text, 'utf8');
  let body = text;
  if (buf.length > 2000) {
    body = buf.subarray(0, 1950).toString('utf8').replace(/\uFFFD+$/, '') + '…（内容过长已截断）';
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: body } }),
    });
    const j = await r.json();
    if (j.errcode === 0) return { ok: true, sent: Buffer.byteLength(body, 'utf8') };
    return { ok: false, error: `errcode=${j.errcode} ${j.errmsg || ''}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** 发送 Markdown 消息（企业微信群机器人支持，最长 4096 字节） */
export async function sendMarkdown(md, webhook) {
  const url = webhook || loadConfig().webhook;
  if (!url) return { ok: false, error: '没有配置 webhook（config/wecom.json）' };

  const buf = Buffer.from(md, 'utf8');
  let body = md;
  if (buf.length > 4000) {
    body = buf.subarray(0, 3900).toString('utf8').replace(/\uFFFD+$/, '') + '\n…（内容过长已截断）';
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content: body } }),
    });
    const j = await r.json();
    if (j.errcode === 0) return { ok: true, sent: Buffer.byteLength(body, 'utf8') };
    return { ok: false, error: `errcode=${j.errcode} ${j.errmsg || ''}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** 把一期周报格式化成推送文本 */
export function formatIssue(issue, baseUrl) {
  const lines = [];
  lines.push(`**GitHub 周热榜 · ${issue.week}**`);
  lines.push(`本周新建且 star 增长最快的 ${issue.items.length} 个项目`);
  lines.push('');
  for (const it of issue.items.slice(0, 10)) {
    const star = it.stars >= 1000 ? (it.stars / 1000).toFixed(1) + 'k' : String(it.stars);
    lines.push(`**${it.rank}. ${it.repo}** ★${star}`);
    lines.push(it.summary);
    lines.push('');
  }
  const hot = issue.items.filter((x) => x.relevance === 'high');
  if (hot.length) {
    lines.push('---');
    lines.push(`**${hot.length} 个与你相关**：`);
    for (const h of hot) lines.push(`· ${h.repo} — ${h.summary}`);
    lines.push('');
  }
  lines.push(`[打开完整简报](${baseUrl})`);
  return lines.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────
import { fileURLToPath } from 'node:url';
const SELF = path.basename(fileURLToPath(import.meta.url));
const ENTRY = path.basename(process.argv[1] || '');

if (ENTRY === SELF) {
  const args = process.argv.slice(2);

  if (args[0] === '--config') {
    const cfg = loadConfig();
    console.log('配置文件:', CONFIG);
    console.log('  webhook:', cfg.webhook ? cfg.webhook.slice(0, 60) + '…' : '(未配置)');
    console.log('  enabled:', cfg.enabled);
    process.exit(0);
  }

  if (args[0] === '--set-webhook') {
    const url = args[1];
    if (!url || !url.startsWith('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=')) {
      console.error('请提供企业微信群机器人 webhook 地址，形如：');
      console.error('  https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx');
      process.exit(1);
    }
    const cfg = loadConfig();
    cfg.webhook = url;
    cfg.enabled = true;
    saveConfig(cfg);
    console.log('已保存 webhook');
    const test = await sendText('✅ GitHub 周报推送已接通', url);
    console.log('测试消息:', JSON.stringify(test));
    process.exit(test.ok ? 0 : 1);
  }

  if (args[0] === '--test') {
    const r = await sendText('测试消息 · ' + new Date().toLocaleString('zh-CN'), null);
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }

  const text = args[0] || '';
  if (!text) {
    console.log('用法:');
    console.log('  node notify.mjs "消息内容"          发文本');
    console.log('  node notify.mjs --test              发测试消息');
    console.log('  node notify.mjs --config            看配置');
    console.log('  node notify.mjs --set-webhook <url> 设置 webhook 并测试');
    process.exit(0);
  }
  const r = await sendText(text, null);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
