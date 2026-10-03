// Teste visual do zero: dados numa pasta temporária, áudio mutado, seletor de arquivo automático.
// Uso: npx electron tools/snap.js <pasta-saida> <caminho-do-Cemu.exe>
const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const [out, cemuExe] = process.argv.slice(-2);
app.setPath('userData', path.join(out, 'userdata'));
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [cemuExe] });

const steps = [
  { at: 1200, name: '01-splash' },
  { at: 3600, name: '02-setup' },
  { at: 3700, js: "document.querySelector('#st-cemu-btn').click()" },
  { at: 5200, name: '03-setup-found' },
  { at: 5300, js: "document.querySelector('#setup-go').click()" },
  { at: 5700, name: '04-setup-working' },
  { at: 9500, name: '05-library' },
  { at: 9600, js: "document.querySelector('#view-library').scrollTop = 520" },
  { at: 10800, name: '06-scrolled' },
  { at: 10900, js: "document.querySelector('#view-library').scrollTop = 0; document.querySelector('.tab[data-view=shots]').click()" },
  { at: 12200, name: '07-shots' },
  { at: 12300, js: "document.querySelector('.tab[data-view=library]').click(); document.querySelector('#theme-btn').click()" },
  { at: 13800, name: '08-light' },
  { at: 13900, js: "document.querySelector('#theme-btn').click(); showLaunch()" },
  { at: 15600, name: '09-launch' },
];

app.on('browser-window-created', (_e, win) => {
  win.webContents.setAudioMuted(true);
  win.setAlwaysOnTop(true);
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) console.log('[page]', e.message); });
  win.webContents.once('did-finish-load', async () => {
    const t0 = Date.now();
    for (const s of steps) {
      await new Promise((r) => setTimeout(r, Math.max(0, s.at - (Date.now() - t0))));
      if (s.js) await win.webContents.executeJavaScript(s.js).catch((err) => console.log('js err', err.message));
      if (s.name) {
        win.webContents.invalidate();
        await new Promise((r) => setTimeout(r, 100));
        fs.writeFileSync(path.join(out, `${s.name}.png`), (await win.webContents.capturePage()).toPNG());
        console.log('snap', s.name);
      }
    }
    app.quit();
  });
});

require('../src/main.js');
