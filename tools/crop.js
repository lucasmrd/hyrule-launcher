// recorta e amplia uma região de um PNG (para inspeção)
const { app, nativeImage } = require('electron');
const [src, dst, x, y, w, h, scale] = process.argv.slice(-7);
app.whenReady().then(() => {
  const img = nativeImage.createFromPath(src).crop({ x: +x, y: +y, width: +w, height: +h });
  const out = img.resize({ width: Math.round(w * scale), quality: 'best' });
  require('fs').writeFileSync(dst, /\.jpe?g$/i.test(dst) ? out.toJPEG(86) : out.toPNG());
  app.quit();
});
