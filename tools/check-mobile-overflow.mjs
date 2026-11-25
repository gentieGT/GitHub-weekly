// 检查手机视口下是否有横向溢出
import { execSync } from 'node:child_process';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://192.168.1.5:11436/';

// 用 CDP 拿实际布局数据
const { spawn } = await import('node:child_process');
const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');

const userDataDir = path.join(os.tmpdir(), 'cdp-check-' + Date.now());

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--remote-debugging-port=9333',
  `--user-data-dir=${userDataDir}`,
  '--window-size=390,844',
  'about:blank',
], { stdio: 'ignore' });

await new Promise((r) => setTimeout(r, 3000));

async function getWs() {
  const r = await fetch('http://127.0.0.1:9333/json/version');
  const j = await r.json();
  return j.webSocketDebuggerUrl;
}

const wsUrl = await getWs();

// 用原生 WebSocket（Node 22+ 有全局 WebSocket）
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

function send(method, params = {}, sessionId) {
  return new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });
}

await new Promise((r) => ws.addEventListener('open', r));

// 建一个新页面
const { result: target } = await send('Target.createTarget', { url: URL });
const { result: attached } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
const sid = attached.sessionId;

await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
}, sid);

await send('Page.enable', {}, sid);
await new Promise((r) => setTimeout(r, 2500));

const { result: ev } = await send('Runtime.evaluate', {
  expression: `
    (() => {
      const de = document.documentElement;
      const overflow = de.scrollWidth - de.clientWidth;
      // 找出超出视口右边界的元素
      const wide = [];
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.right > de.clientWidth + 1 && r.width > 0) {
          wide.push({
            tag: el.tagName.toLowerCase(),
            cls: el.className && typeof el.className === 'string' ? el.className.slice(0, 40) : '',
            right: Math.round(r.right),
            width: Math.round(r.width),
            text: (el.textContent || '').trim().slice(0, 30),
          });
        }
      }
      return JSON.stringify({
        clientWidth: de.clientWidth,
        scrollWidth: de.scrollWidth,
        overflow,
        wideCount: wide.length,
        wide: wide.slice(0, 12),
      }, null, 2);
    })()
  `,
  returnByValue: true,
}, sid);

console.log(ev.result.value);

ws.close();
chrome.kill();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
