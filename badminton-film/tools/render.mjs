// 无头 Chromium 逐帧渲染驱动。
// 用法：
//   node tools/render.mjs --stills 2.5,10,20 [--prefix name]     渲染指定秒数的静帧到 out/stills/
//   node tools/render.mjs --range 0-240 --out out/x.mkv [--step 2] 渲染帧区间为视频（FFV1 无损）
//   node tools/render.mjs --chunks 480                              全片按块渲染到 out/chunks/（可断点续渲）
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') p = '/src/index.html';
  const fp = path.join(ROOT, p);
  fs.readFile(fp, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    r.end(d);
  });
});
await new Promise((res) => server.listen(0, res));
const PORT = server.address().port;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--js-flags=--max-old-space-size=6144'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => { console.log('[pageerror]', e.message); });
await page.goto(`http://localhost:${PORT}/src/index.html?msaa=${args.msaa ?? 4}`);
await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
const cdp = await page.context().newCDPSession(page);
const meta = await page.evaluate(() => ({ frames: window.FILM.frames, fps: window.FILM.fps, duration: window.FILM.duration }));
console.log(`timeline: ${meta.duration.toFixed(2)}s, ${meta.frames} frames @${meta.fps}`);

async function grab(i) {
  await page.evaluate((f) => window.FILM.renderFrame(f), i);
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
  return Buffer.from(r.data, 'base64');
}

function ffmpegSink(out, fps) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'ffv1', '-level', '3', '-slices', '4', '-pix_fmt', 'yuv444p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  return { write: (b) => new Promise((res) => (ff.stdin.write(b) ? res() : ff.stdin.once('drain', res))), end: async () => { ff.stdin.end(); await done; } };
}

async function renderRange(a, b, out, step = 1) {
  const sink = ffmpegSink(out + '.part.mkv', meta.fps / step);
  const t0 = Date.now();
  for (let i = a; i < b; i += step) {
    await sink.write(await grab(i));
    if ((i - a) % (48 * step) === 0) {
      const done = (i - a) / step + 1, total = Math.ceil((b - a) / step);
      const el = (Date.now() - t0) / 1000;
      console.log(`  frame ${i} (${done}/${total})  ${(el / done).toFixed(2)}s/frame  eta ${((total - done) * el / done / 60).toFixed(1)}min`);
    }
  }
  await sink.end();
  fs.renameSync(out + '.part.mkv', out);
}

try {
  if (args.stills) {
    const dir = path.join(ROOT, 'out', 'stills'); fs.mkdirSync(dir, { recursive: true });
    const prefix = args.prefix || 'still';
    for (const s of String(args.stills).split(',')) {
      const i = Math.round(parseFloat(s) * meta.fps);
      const t0 = Date.now();
      const buf = await grab(i);
      const fn = path.join(dir, `${prefix}_${parseFloat(s).toFixed(2)}s.png`);
      fs.writeFileSync(fn, buf);
      console.log(`${fn}  (${Date.now() - t0}ms)`);
    }
  } else if (args.range) {
    const [a, b] = String(args.range).split('-').map(Number);
    await renderRange(a, b, path.resolve(ROOT, args.out || 'out/range.mkv'), Number(args.step || 1));
  } else if (args.chunks) {
    const size = Number(args.chunks);
    const dir = path.join(ROOT, 'out', 'chunks'); fs.mkdirSync(dir, { recursive: true });
    const first = Number(args.first || 0), last = args.last ? Number(args.last) : Math.ceil(meta.frames / size) - 1;
    for (let c = first; c <= last; c++) {
      const out = path.join(dir, `c${String(c).padStart(3, '0')}.mkv`);
      if (fs.existsSync(out)) { console.log('skip', out); continue; }
      const a = c * size, b = Math.min(meta.frames, a + size);
      console.log(`chunk ${c}: frames ${a}-${b}`);
      await renderRange(a, b, out);
    }
  }
} finally {
  await browser.close();
  server.close();
}
