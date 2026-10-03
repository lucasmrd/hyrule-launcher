// Extrai artes e música da pasta meta do jogo do PRÓPRIO usuário (nada da Nintendo vai no repositório).
// Gera: hero.png (tapeçaria sem o logo), logo.png (logo recortado com alfa), icon.png e theme.wav.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ART_VERSION = 1; // aumente para forçar nova extração quando o algoritmo mudar

function readTga(file) {
  const b = fs.readFileSync(file);
  const idLen = b[0], type = b[2];
  const w = b.readUInt16LE(12), h = b.readUInt16LE(14), bpp = b[16], desc = b[17];
  if (type !== 2) throw new Error(`TGA tipo ${type} não suportado`);
  const px = bpp / 8, topDown = (desc & 0x20) !== 0;
  let off = 18 + idLen;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = topDown ? y : h - 1 - y;
    for (let x = 0; x < w; x++, off += px) {
      const o = (row * w + x) * 4;
      rgba[o] = b[off + 2]; rgba[o + 1] = b[off + 1]; rgba[o + 2] = b[off];
      rgba[o + 3] = px === 4 ? b[off + 3] : 255;
    }
  }
  return { w, h, rgba };
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(file, { w, h, rgba }) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

// O bootTvTex do BotW traz o logo no canto superior direito, sobre um tecido com padrão repetido.
// Recorta o logo (alfa pela "brancura": o fundo é dourado/saturado, o logo é creme) e
// cobre o lugar dele com o próprio tecido copiado de uma repetição mais abaixo.
function splitLogo(tv) {
  const W = tv.w, px = (x, y) => (y * W + x) * 4;
  const sx = W / 1280, sy = tv.h / 720;
  const L = { x0: Math.round(960 * sx), y0: Math.round(22 * sy), x1: Math.round(1250 * sx), y1: Math.round(236 * sy) };
  const lw = L.x1 - L.x0, lh = L.y1 - L.y0;
  const smooth = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  const logo = { w: lw, h: lh, rgba: Buffer.alloc(lw * lh * 4) };
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
    const s = px(L.x0 + x, L.y0 + y), d = (y * lw + x) * 4;
    const r = tv.rgba[s], g = tv.rgba[s + 1], b = tv.rgba[s + 2];
    logo.rgba[d] = r; logo.rgba[d + 1] = g; logo.rgba[d + 2] = b;
    logo.rgba[d + 3] = Math.round(smooth(95, 165, Math.min(r, g, b)) * 255);
  }

  // período vertical do tecido (autocorrelação numa área só de padrão)
  let best = 124, bestErr = Infinity;
  const yA = Math.round(300 * sy), yB = Math.round(560 * sy), xA = Math.round(700 * sx), xB = Math.round(1200 * sx);
  for (let s = Math.round(90 * sy); s <= Math.round(160 * sy); s++) {
    let err = 0;
    for (let y = yA; y < yB; y += 2) for (let x = xA; x < xB; x += 2) {
      const a = px(x, y), b = px(x, y + s);
      err += Math.abs(tv.rgba[a] - tv.rgba[b]) + Math.abs(tv.rgba[a + 1] - tv.rgba[b + 1]);
    }
    if (err < bestErr) { bestErr = err; best = s; }
  }
  const shift = best * Math.ceil((L.y1 + 30) / best), feather = 24;
  const hero = { w: W, h: tv.h, rgba: Buffer.from(tv.rgba) };
  for (let y = 0; y < Math.min(tv.h - shift, L.y1 + feather); y++)
    for (let x = L.x0 - feather; x < W; x++) {
      const dx = Math.max(L.x0 - x, 0), dy = Math.max(y - L.y1, 0);
      const k = 1 - Math.min(1, Math.hypot(dx, dy) / feather);
      const d = px(x, y), s = px(x, y + shift);
      for (let c = 0; c < 3; c++) hero.rgba[d + c] = Math.round(tv.rgba[s + c] * k + tv.rgba[d + c] * (1 - k));
    }
  return { hero, logo };
}

// bootSound.btsnd: PCM 16 bits big-endian, estéreo, 48 kHz, cabeçalho de 8 bytes → WAV
function btsndToWav(src, dst) {
  const pcm = fs.readFileSync(src).subarray(8);
  const n = pcm.length >> 1, rate = 48000, ch = 2;
  const out = Buffer.alloc(44 + n * 2);
  for (let i = 0; i < n; i++) out.writeInt16LE(pcm.readInt16BE(i * 2), 44 + i * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(ch, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * ch * 2, 28); out.writeUInt16LE(ch * 2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(dst, out);
}

/** Garante as artes em cacheDir; devolve os caminhos (música pode faltar). */
function ensureArt(gameDir, cacheDir) {
  const files = { hero: 'hero.png', logo: 'logo.png', icon: 'icon.png', music: 'theme.wav' };
  const stamp = path.join(cacheDir, 'art.json');
  const meta = path.join(gameDir, 'meta');
  const result = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, path.join(cacheDir, f)]));
  try {
    const s = JSON.parse(fs.readFileSync(stamp, 'utf8'));
    if (s.v === ART_VERSION && s.gameDir === gameDir && fs.existsSync(result.hero)) return result;
  } catch { /* ainda não extraído */ }

  fs.mkdirSync(cacheDir, { recursive: true });
  const { hero, logo } = splitLogo(readTga(path.join(meta, 'bootTvTex.tga')));
  writePng(result.hero, hero);
  writePng(result.logo, logo);
  writePng(result.icon, readTga(path.join(meta, 'iconTex.tga')));
  try { btsndToWav(path.join(meta, 'bootSound.btsnd'), result.music); } catch { result.music = null; }
  fs.writeFileSync(stamp, JSON.stringify({ v: ART_VERSION, gameDir }));
  return result;
}

module.exports = { ensureArt };
