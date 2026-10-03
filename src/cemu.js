// Leitura (somente leitura!) da instalação do Cemu 1.x e 2.x: onde ficam as configurações,
// onde está o Breath of the Wild, tempo de jogo, graphic packs e capturas.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// IDs do jogo base: JPN, USA, EUR
const BOTW_IDS = ['00050000101C9300', '00050000101C9400', '00050000101C9500'];
const REGION_BY_ID = { '00050000101C9300': 'JPN', '00050000101C9400': 'USA', '00050000101C9500': 'EUR' };

const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const tag = (xml, name) => (xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1]?.trim();
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1].trim());

/** Mesma regra do Cemu (CemuApp.cpp): pasta "portable" > settings.xml ao lado do exe > %APPDATA%\Cemu */
function resolveInstall(cemuExe) {
  const exeDir = path.dirname(cemuExe);
  let configDir;
  if (isDir(path.join(exeDir, 'portable'))) configDir = path.join(exeDir, 'portable');
  else if (exists(path.join(exeDir, 'settings.xml'))) configDir = exeDir;
  else configDir = path.join(process.env.APPDATA || '', 'Cemu');
  const settingsXml = read(path.join(configDir, 'settings.xml')) || '';
  const mlc = tag(settingsXml, 'mlc_path') || path.join(configDir, 'mlc01');
  return { exe: cemuExe, exeDir, configDir, settingsXml, mlc };
}

function readMetaXml(gameDir) {
  const xml = read(path.join(gameDir, 'meta', 'meta.xml'));
  if (!xml) return null;
  return {
    titleId: (tag(xml, 'title_id') || '').toUpperCase(),
    title: (tag(xml, 'longname_en') || '').replace(/\s*\n\s*/, ': '),
    publisher: tag(xml, 'publisher_en') || 'Nintendo',
    productCode: tag(xml, 'product_code') || '',
  };
}

function findRpx(gameDir) {
  const code = path.join(gameDir, 'code');
  try { return fs.readdirSync(code).filter((f) => /\.rpx$/i.test(f)).map((f) => path.join(code, f))[0] || null; } catch { return null; }
}

function asGame(gameDir) {
  const meta = readMetaXml(gameDir);
  if (!meta || !BOTW_IDS.includes(meta.titleId)) return null;
  const rpx = findRpx(gameDir);
  if (!rpx) return null;
  return { dir: gameDir, rpx, titleId: meta.titleId, region: REGION_BY_ID[meta.titleId] };
}

// procura pastas de jogo (com meta/meta.xml) até uma certa profundidade
function scan(dir, depth, out) {
  if (depth < 0 || !isDir(dir)) return;
  const g = asGame(dir);
  if (g) { out.push(g); return; }
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const it of items) if (it.isDirectory() && !/^(content|code|meta|aoc)$/i.test(it.name)) scan(path.join(dir, it.name), depth - 1, out);
}

/** Acha o BotW: último caminho usado pelo Cemu > títulos instalados na mlc01 > pastas de jogos do Cemu */
function findGame(install) {
  const found = [];
  const xml = install.settingsXml;
  // 1) GameCache (1.x) e title_list_cache.xml (2.x): caminhos de .rpx/pastas que o Cemu já abriu
  const cachePaths = [...tags(tag(xml, 'GameCache') || '', 'path'), ...tags(read(path.join(install.configDir, 'title_list_cache.xml')) || '', 'path')];
  for (const p of cachePaths) {
    const dir = /\.rpx$/i.test(p) ? path.dirname(path.dirname(p)) : p;
    const g = asGame(dir); if (g) found.push(g);
  }
  // 2) instalado dentro da mlc01
  for (const id of BOTW_IDS) {
    const g = asGame(path.join(install.mlc, 'usr', 'title', id.slice(0, 8).toLowerCase(), id.slice(8))) ||
              asGame(path.join(install.mlc, 'usr', 'title', id.slice(0, 8), id.slice(8)));
    if (g) found.push(g);
  }
  // 3) pastas de jogos configuradas
  for (const p of tags(tag(xml, 'GamePaths') || '', 'Entry')) scan(p, 3, found);
  return found[0] || null;
}

/** Procura o BotW dentro de uma pasta escolhida pelo usuário (ela mesma ou subpastas) */
function findGameIn(dir) {
  const out = [];
  scan(dir, 3, out);
  return out[0] || null;
}

/** Tempo de jogo como o Cemu calcula: PlayStats.dat (minutos, 2.x) + legado do settings.xml (segundos, 1.x) */
function readPlaytime(install, titleId) {
  let minutes = 0, last = 0;
  const pdm = path.join(install.mlc, 'usr', 'save', 'system', 'pdm', '80000001', 'PlayStats.dat');
  try {
    const b = fs.readFileSync(pdm);
    const n = Math.min(b.readUInt32BE(0), 256);
    const hi = parseInt(titleId.slice(0, 8), 16), lo = parseInt(titleId.slice(8), 16);
    for (let i = 0; i < n; i++) {
      const o = 4 + i * 20;
      if (b.readUInt32BE(o) === hi && b.readUInt32BE(o + 4) === lo) {
        minutes += b.readUInt32BE(o + 8);
        const day = b.readUInt16BE(o + 16); // mostRecentDayIndex: dias desde 01/01/2000
        if (day) last = Math.max(last, Date.UTC(2000, 0, 1) + day * 864e5 + 12 * 36e5);
        break;
      }
    }
  } catch { /* Cemu 1.x não tem PlayStats.dat */ }

  const idDec = BigInt('0x' + titleId).toString();
  for (const entry of (tag(install.settingsXml, 'GameCache') || '').split(/<\/Entry>/)) {
    if (tag(entry + '</Entry>', 'title_id') !== idDec) continue;
    minutes += parseInt(tag(entry + '</Entry>', 'time_played') || '0', 10) / 60;
    const lp = parseInt(tag(entry + '</Entry>', 'last_played') || '0', 10) * 1000;
    last = Math.max(last, lp);
    break;
  }
  return { playMinutes: minutes, lastPlayed: last || null };
}

/** Graphic packs ativos que valem para este jogo */
function readPacks(install, titleId) {
  const shortId = titleId.slice(-8);
  const out = [];
  const files = [...(tag(install.settingsXml, 'GraphicPack') || '').matchAll(/filename="([^"]+)"/g)].map((m) => m[1]);
  for (const rel of files) {
    const rules = read(path.join(install.configDir, rel)) || read(path.join(install.exeDir, rel));
    if (!rules) continue;
    const ids = (rules.match(/titleIds\s*=\s*([^\r\n]+)/i) || [])[1] || '';
    if (!ids.toUpperCase().includes(shortId)) continue;
    const name = ((rules.match(/^\s*name\s*=\s*"?([^"\r\n]+)"?/im) || [])[1] || path.basename(path.dirname(rel))).trim();
    const parts = rel.split(/[\\/]/);
    out.push({ name, category: (parts.length >= 4 ? parts[parts.length - 3] : 'Graphic Pack').replace(/^!/, '') });
  }
  return out;
}

function screenshotDirs(install) {
  return [...new Set([path.join(install.configDir, 'screenshots'), path.join(install.exeDir, 'screenshots')])];
}

/** Versão: info do exe (2.x) ou nome da pasta (ex.: cemu_1.22.6) */
function readVersion(cemuExe) {
  return new Promise((resolve) => {
    const fromFolder = (path.basename(path.dirname(cemuExe)).match(/(\d+\.\d+(?:\.\d+)?\w*)/) || [])[1] || '';
    execFile('powershell', ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${cemuExe.replace(/'/g, "''")}').VersionInfo.ProductVersion`],
      { windowsHide: true, timeout: 8000 }, (err, stdout) => {
        const v = (stdout || '').trim().replace(/^v/i, '');
        resolve(!err && v ? v : fromFolder);
      });
  });
}

module.exports = { resolveInstall, findGame, findGameIn, asGame, readMetaXml, readPlaytime, readPacks, screenshotDirs, readVersion, BOTW_IDS };
