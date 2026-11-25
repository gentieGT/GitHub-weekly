// 手机视口下截取「展开卡片」的截图，验证 Star 按钮和输入框
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://192.168.1.5:11436/';
const OUT = 'D:\\dsh-workspace\\gh-weekly\\docs\\mobile-expanded.png';

const userDataDir = path.join(os.tmpdir(), 'cdp-shot-' + Date.now());
try { fs.unlinkSync(OUT); } catch {}

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--remote-debugging-port=9334',
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], { stdio: 'ignore' });

await new Promise((r) => setTimeout(r, 3000));

const ver = await (await fetch('http://127.0.0.1:9334/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
function send(method, params = {}, sessionId) {
  return new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });
}
await new Promise((r) => ws.addEventListener('open', r));

const { result: t } = await send('Target.createTarget', { url: URL });
const { result: a } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
const sid = a.sessionId;

await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 1100, deviceScaleFactor: 2, mobile: true,
}, sid);
await send('Page.enable', {}, sid);
await new Promise((r) => setTimeout(r, 2500));

// 展开第一个卡片
const { result: clickRes } = await send('Runtime.evaluate', {
  expression: `
    (() => {
      const head = document.querySelector('.card .head');
      if (!head) return 'no card';
      head.click();
      const card = head.closest('.card');
      return card.classList.contains('open') ? 'opened' : 'not-open';
    })()
  `,
  returnByValue: true,
}, sid);
console.log('点击结果:', clickRes.result.value);

await new Promise((r) => setTimeout(r, 800));

// 再查溢出
const { result: ov } = await send('Runtime.evaluate', {
  expression: `
    (() => {
      const de = document.documentElement;
      const wide = [];
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.right > de.clientWidth + 1 && r.width > 0) {
          wide.push(el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.slice(0,30) : ''));
        }
      }
      return JSON.stringify({ clientWidth: de.clientWidth, scrollWidth: de.scrollWidth, wide: wide.slice(0,8) });
    })()
  `,
  returnByValue: true,
}, sid);
console.log('展开后:', ov.result.value);

// 截图
const { result: shot } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sid);
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('截图已保存:', OUT, fs.statSync(OUT).size, 'bytes');

ws.close();
chrome.kill();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}