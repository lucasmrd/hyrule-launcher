// Hyrule Launcher — casca visual em volta do Cemu. Não altera nenhuma configuração do emulador:
// só lê o settings.xml/meta.xml e inicia o Cemu.exe com "-g <jogo>", exatamente como o próprio Cemu faria.
const { app, BrowserWindow, ipcMain, shell, screen, dialog, nativeImage } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const cemu = require('./cemu');
const { ensureArt } = require('./art');

const POLL_MS = 2000;

app.setAppUserModelId('Hyrule.Launcher');
if (!app.requestSingleInstanceLock()) app.quit();

let win;
let cemuRunning = false;
let launchedByUs = false;

const dataFile = (name) => path.join(app.getPath('userData'), name);
const readJson = (name) => {
  try { return JSON.parse(fs.readFileSync(dataFile(name), 'utf8').replace(/^﻿/, '')); }
  catch (e) { if (e.code !== 'ENOENT') log(`erro lendo ${name}:`, e.code || '', e.message); return null; }
};
const writeJson = (name, obj) => { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(dataFile(name), JSON.stringify(obj, null, 2)); };

/* ================= Preferências visuais (tema, música, volume) ================= */
const THEMES = { dark: { bg: '#07090c', symbol: '#d8c79a' }, light: { bg: '#f3efe6', symbol: '#5a4a24' } };
let prefs = { theme: 'dark', music: false, volume: 0.7, fullscreen: false };
function mergePrefs(p) {
  if (!p) return;
  if (p.theme in THEMES) prefs.theme = p.theme;
  if (typeof p.music === 'boolean') prefs.music = p.music;
  if (typeof p.volume === 'number') prefs.volume = Math.max(0, Math.min(1, p.volume));
  if (typeof p.fullscreen === 'boolean') prefs.fullscreen = p.fullscreen;
}
function applyWindowTheme() {
  if (!win || win.isDestroyed()) return;
  const t = THEMES[prefs.theme];
  win.setBackgroundColor(t.bg);
  win.setTitleBarOverlay({ color: t.bg, symbolColor: t.symbol, height: 40 });
}

/* ================= Configuração (onde estão o Cemu e o jogo) ================= */
// setup.json: { cemuExe, gameDir } — escolhido na primeira abertura
let setup = null;
const versions = new Map();
// diagnóstico em %APPDATA%\Hyrule Launcher\launcher.log
function log(...args) {
  try { fs.appendFileSync(dataFile('launcher.log'), `[${new Date().toISOString()}] ${args.join(' ')}\n`); } catch { /* sem log */ }
}
function loadSetup() {
  const s = readJson('setup.json');
  setup = s && fs.existsSync(s.cemuExe) && cemu.asGame(s.gameDir) ? s : null;
  if (s && !setup) log('setup inválido:', `exe=${fs.existsSync(s.cemuExe)}`, `gameDir=${fs.existsSync(s.gameDir)}`,
    `meta=${fs.existsSync(path.join(s.gameDir || '', 'meta', 'meta.xml'))}`, `jogo=${!!cemu.asGame(s.gameDir)}`, JSON.stringify(s));
  if (!s) log('setup.json não encontrado em', dataFile('setup.json'));
  return s;
}
// Logo depois de ligar o PC o disco do jogo pode demorar a responder: espera até 15 s
// antes de concluir que os caminhos salvos sumiram (e mostrar a configuração de novo).
let setupReady = null;
function waitForSetup() {
  if (!setupReady) setupReady = (async () => {
    for (let i = 0; i < 15; i++) {
      const saved = loadSetup();
      if (setup || !saved) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
  })();
  return setupReady;
}
const install = () => cemu.resolveInstall(setup.cemuExe);
const game = () => cemu.asGame(setup.gameDir);
const artDir = () => dataFile(path.join('art', game().titleId));
async function versionOf(exe) {
  if (!versions.has(exe)) versions.set(exe, await cemu.readVersion(exe));
  return versions.get(exe);
}

function readScreenshots(inst) {
  const shots = [];
  const walk = (d, depth) => {
    let items = [];
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const p = path.join(d, it.name);
      if (it.isDirectory() && depth < 2) walk(p, depth + 1);
      else if (/\.(png|jpe?g|bmp)$/i.test(it.name)) shots.push({ url: pathToFileURL(p).href, mtime: fs.statSync(p).mtimeMs });
    }
  };
  cemu.screenshotDirs(inst).forEach((d) => walk(d, 0));
  return shots.sort((a, b) => b.mtime - a.mtime);
}

function artUrls() {
  const files = ensureArt(game().dir, artDir());
  const url = (p) => (p && fs.existsSync(p) ? `${pathToFileURL(p).href}?v=${Math.round(fs.statSync(p).mtimeMs)}` : null);
  return { hero: url(files.hero), logo: url(files.logo), icon: url(files.icon), music: url(files.music), iconPath: files.icon };
}

async function gameInfo() {
  await waitForSetup();
  // caminhos salvos que (ainda) não respondem: a tela tenta de novo sozinha, sem pedir para escolher
  if (!setup) return { needsSetup: true, saved: readJson('setup.json'), running: cemuRunning };
  const inst = install(), g = game(), meta = cemu.readMetaXml(g.dir);
  const art = artUrls();
  if (win && !win.isDestroyed() && fs.existsSync(art.iconPath)) win.setIcon(nativeImage.createFromPath(art.iconPath));
  return {
    needsSetup: false,
    title: meta.title || 'The Legend of Zelda: Breath of the Wild',
    publisher: meta.publisher,
    productCode: meta.productCode,
    region: g.region,
    titleId: g.titleId,
    ...cemu.readPlaytime(inst, g.titleId),
    packs: cemu.readPacks(inst, g.titleId),
    cemuVersion: await versionOf(setup.cemuExe),
    screenshots: readScreenshots(inst),
    art,
    installed: fs.existsSync(setup.cemuExe) && fs.existsSync(g.rpx),
    running: cemuRunning,
  };
}

/* ================= Cemu em execução? ================= */
function isCemuRunning() {
  const image = setup ? path.basename(setup.cemuExe) : 'Cemu.exe';
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (err, stdout) => {
      resolve(!err && stdout.toLowerCase().includes(`"${image.toLowerCase()}"`));
    });
  });
}

async function poll() {
  const now = await isCemuRunning();
  if (now !== cemuRunning) {
    cemuRunning = now;
    send('cemu:state', { running: now });
    if (now && launchedByUs && win && !win.isDestroyed()) {
      // só sai da frente quando a janela do Cemu existir, e entrega o foco a ela
      // (sem foco o Cemu não recebe teclado nem controle)
      focusCemuWhenReady();
    }
    if (!now) {
      // o Cemu grava o tempo de jogo ao fechar; relê em seguida
      setTimeout(async () => send('game:info', await gameInfo()), 1500);
      if (launchedByUs && win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.show(); win.focus();
      }
      launchedByUs = false;
    }
  }
  setTimeout(poll, POLL_MS);
}

// Passa o foco para a janela do Cemu SÓ com SetForegroundWindow: não mexe em tamanho,
// posição nem tela cheia (o AppActivate do WScript podia tirar o jogo da tela cheia).
function focusCemuScript(waitMs) {
  const name = path.basename(setup?.cemuExe || 'Cemu.exe', '.exe').replace(/'/g, "''");
  return [
    `Add-Type -Namespace HL -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();'`,
    `$end = (Get-Date).AddMilliseconds(${waitMs})`,
    `do {`,
    `  $p = Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1`,
    `  if ($p) { if ([HL.W]::GetForegroundWindow() -ne $p.MainWindowHandle) { [void][HL.W]::SetForegroundWindow($p.MainWindowHandle) }; 'ok'; break }`,
    `  Start-Sleep -Milliseconds 250`,
    `} while ((Get-Date) -lt $end)`,
  ].join('\n');
}
function focusCemuWhenReady() {
  execFile('powershell', ['-NoProfile', '-Command', focusCemuScript(30000)], { windowsHide: true }, (_err, stdout) => {
    const ready = String(stdout).includes('ok');
    if (win && !win.isDestroyed() && cemuRunning) setTimeout(() => win.minimize(), ready ? 400 : 0);
  });
}

function send(ch, data) {
  if (win && !win.isDestroyed()) win.webContents.send(ch, data);
}

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.min(1440, Math.round(workAreaSize.width * 0.8));
  const height = Math.min(900, Math.round(workAreaSize.height * 0.85));
  win = new BrowserWindow({
    width, height, minWidth: 1080, minHeight: 680,
    show: false,
    backgroundColor: THEMES[prefs.theme].bg,
    title: 'Hyrule Launcher',
    icon: path.join(__dirname, 'assets', 'app.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: THEMES[prefs.theme].bg, symbolColor: THEMES[prefs.theme].symbol, height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('minimize', () => send('window:visible', false));
  win.on('restore', () => send('window:visible', true));
}

/* ================= IPC ================= */
ipcMain.handle('game:info', () => gameInfo());
ipcMain.handle('setup:retry', () => { loadSetup(); return gameInfo(); });
ipcMain.on('prefs:get', (e) => { e.returnValue = prefs; });
ipcMain.on('cemu:running', (e) => { e.returnValue = cemuRunning; });
ipcMain.handle('prefs:set', (_e, patch) => {
  mergePrefs(patch);
  writeJson('prefs.json', prefs);
  if ('theme' in patch) applyWindowTheme();
  return prefs;
});

// --- primeira configuração ---
async function describeCemu(exe) {
  const inst = cemu.resolveInstall(exe);
  const g = cemu.findGame(inst);
  return { ok: true, exe, version: await versionOf(exe), configDir: inst.configDir, game: g };
}
ipcMain.handle('setup:pickCemu', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Onde está o Cemu.exe?', properties: ['openFile'], filters: [{ name: 'Cemu', extensions: ['exe'] }],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const exe = r.filePaths[0];
  if (!/cemu/i.test(path.basename(exe))) return { ok: false, error: 'Esse arquivo não parece ser o Cemu.exe' };
  return describeCemu(exe);
});
ipcMain.handle('setup:pickGame', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Pasta do Breath of the Wild (a que tem code, content e meta)', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const g = cemu.findGameIn(r.filePaths[0]);
  return g ? { ok: true, game: g } : { ok: false, error: 'Não encontrei o Breath of the Wild nessa pasta' };
});
ipcMain.handle('setup:finish', async (_e, { cemuExe, gameDir }) => {
  if (!fs.existsSync(cemuExe) || !cemu.asGame(gameDir)) return { ok: false, error: 'Caminhos inválidos' };
  setup = { cemuExe, gameDir };
  try {
    ensureArt(gameDir, artDir());
  } catch (err) {
    setup = null;
    return { ok: false, error: `Não consegui ler as artes do jogo (${err.message})` };
  }
  writeJson('setup.json', setup);
  cemuRunning = await isCemuRunning();
  return { ok: true };
});

// --- jogo ---
ipcMain.handle('game:launch', async () => {
  if (cemuRunning) return { ok: true, already: true };
  if (!setup || !fs.existsSync(setup.cemuExe)) return { ok: false, error: 'Cemu.exe não encontrado' };
  launchedByUs = true;
  // -f = "Launch games in fullscreen mode" (parâmetro oficial do Cemu; não altera a configuração dele)
  const args = ['-g', game().rpx, ...(prefs.fullscreen ? ['-f'] : [])];
  const child = spawn(setup.cemuExe, args, { cwd: path.dirname(setup.cemuExe), detached: true, stdio: 'ignore' });
  child.on('error', () => { launchedByUs = false; send('cemu:error', 'Falha ao iniciar o Cemu'); });
  child.unref();
  return { ok: true };
});

ipcMain.handle('cemu:focus', () => {
  // traz a janela do Cemu para frente (só o foco, nada mais)
  execFile('powershell', ['-NoProfile', '-Command', focusCemuScript(0)], { windowsHide: true });
});

ipcMain.handle('open:path', (_e, which) => {
  if (!setup) return;
  const inst = install();
  const shots = cemu.screenshotDirs(inst).find((d) => fs.existsSync(d)) || inst.configDir;
  const targets = { cemu: inst.exeDir, game: setup.gameDir, screenshots: shots };
  if (targets[which]) shell.openPath(targets[which]);
});

ipcMain.handle('cemu:open', () => {
  if (setup && !cemuRunning) spawn(setup.cemuExe, [], { cwd: path.dirname(setup.cemuExe), detached: true, stdio: 'ignore' }).unref();
});

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(async () => {
  mergePrefs(readJson('prefs.json'));
  waitForSetup(); // a abertura animada já aparece enquanto isso
  cemuRunning = await isCemuRunning();
  createWindow();
  setTimeout(poll, POLL_MS);
});

app.on('window-all-closed', () => app.quit());
