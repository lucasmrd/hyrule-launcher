// Renderiza um SVG (como <img>, igual ao GitHub) em PNG depois de N ms. Uso: npx electron tools/svg-snap.js <svg> <png> <ms> <w> <h>
const { app, BrowserWindow } = require('electron');
const [svg, png, ms, w, h] = process.argv.slice(-5);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: +w, height: +h, show: false, webPreferences: { offscreen: true } });
  const url = require('url').pathToFileURL(svg).href;
  const html = require('path').join(require('os').tmpdir(), 'svg-snap.html');
  require('fs').writeFileSync(html, `<body style="margin:0;background:#fff;overflow:hidden"><img src="${url}" width="${w}"></body>`);
  await win.loadFile(html);
  await new Promise((r) => setTimeout(r, +ms));
  require('fs').writeFileSync(png, (await win.webContents.capturePage()).toPNG());
  app.quit();
});
