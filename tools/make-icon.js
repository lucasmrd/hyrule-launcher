// Gera o ícone ORIGINAL do launcher (olho Sheikah) — src/assets/app.ico e docs/icon.png.
// Uso: npx electron tools/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const EYE = 'M26 106 Q100 30 174 106 M38 106 Q100 150 162 106 M70 66 L60 42 M100 56 L100 28 M130 66 L140 42 M100 146 Q86 168 100 184 Q114 168 100 146 Z';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16232d"/><stop offset="1" stop-color="#07090c"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#4fd8f2" stop-opacity=".32"/><stop offset="1" stop-color="#4fd8f2" stop-opacity="0"/></radialGradient>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="56" fill="url(#bg)"/>
  <rect x="15" y="15" width="226" height="226" rx="49" fill="none" stroke="#e2c26f" stroke-opacity=".7" stroke-width="3.5"/>
  <circle cx="128" cy="124" r="96" fill="url(#glow)"/>
  <g transform="translate(28 20)" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="#4fd8f2" stroke-width="14" opacity=".7" filter="url(#blur)"><path d="${EYE}"/><circle cx="100" cy="104" r="21"/></g>
    <g stroke="#7fe6f8" stroke-width="10"><path d="${EYE}"/><circle cx="100" cy="104" r="21"/></g>
    <circle cx="100" cy="104" r="9" fill="#bff4ff"/>
  </g>
</svg>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    `<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`));
  await new Promise((r) => setTimeout(r, 400));
  const big = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });

  const root = path.join(__dirname, '..');
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'icon.png'), big.resize({ width: 256, quality: 'best' }).toPNG());

  const sizes = [256, 128, 64, 48, 32, 24, 16];
  const pngs = sizes.map((s) => big.resize({ width: s, height: s, quality: 'best' }).toPNG());
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  const dir = Buffer.alloc(16 * sizes.length);
  let offset = 6 + dir.length;
  sizes.forEach((s, i) => {
    const o = i * 16;
    dir[o] = s >= 256 ? 0 : s; dir[o + 1] = s >= 256 ? 0 : s;
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(pngs[i].length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += pngs[i].length;
  });
  fs.writeFileSync(path.join(root, 'src', 'assets', 'app.ico'), Buffer.concat([header, dir, ...pngs]));
  console.log('app.ico e docs/icon.png gerados');
  app.quit();
});
