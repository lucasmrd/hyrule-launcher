// Teste de música/tema: áudio MUTADO e preferências numa pasta temporária (não toca nada, não mexe nas prefs reais).
// Uso: npx electron tools/snap-prefs.js <pasta-saida> <fase: first|second>
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const [out, phase] = process.argv.slice(-2);
app.setPath('userData', path.join(out, 'userdata'));
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const dbg = "JSON.stringify({ st: [state, winVisible, document.hidden], music: music.debug(), theme: document.documentElement.dataset.theme, tip: document.querySelector('#music-btn').dataset.tip })";
const steps = phase === 'first'
  ? [
      { at: 3400, name: 'a-default', js: dbg },
      { at: 3500, js: "document.querySelector('#music-btn').click()" },
      { at: 6500, name: 'b-music-on', js: dbg },
      { at: 6600, js: "document.querySelector('#theme-btn').click()" },
      { at: 6950, name: 'c-theme-mid' },
      { at: 8200, name: 'd-light', js: dbg },
      { at: 8300, js: "document.querySelector('#view-library').scrollTop = 520; document.querySelector('#music-btn').dispatchEvent(new MouseEvent('mouseover'))" },
      { at: 9600, name: 'e-light-scrolled' },
    ]
  : phase === 'volume'
  ? [
      { at: 3400, js: "document.querySelector('#vol-pop').classList.add('open')" },
      { at: 3800, name: 'g-vol-off', js: dbg },
      { at: 3900, name: 'g2', js: "music.setVol(0.35); " + dbg },
      { at: 4300, name: 'g3', js: dbg },
      { at: 6200, name: 'h-vol-35', js: dbg },
      { at: 6300, js: "document.querySelector('#theme-btn').click()" },
      { at: 7600, name: 'i-vol-light', js: dbg },
    ]
  : [{ at: 4500, name: 'f-restart', js: dbg }];

app.on('browser-window-created', (_e, win) => {
  win.webContents.setAudioMuted(true);
  win.setAlwaysOnTop(true);
  win.webContents.once('did-finish-load', async () => {
    const t0 = Date.now();
    for (const s of steps) {
      await new Promise((r) => setTimeout(r, Math.max(0, s.at - (Date.now() - t0))));
      if (s.js) { const v = await win.webContents.executeJavaScript(s.js).catch((e) => 'erro: ' + e.message); if (s.name) console.log(s.name, v); }
      if (s.name) {
        win.webContents.invalidate();
        await new Promise((r) => setTimeout(r, 100));
        fs.writeFileSync(path.join(out, `${s.name}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
    console.log('prefs.json:', fs.readFileSync(path.join(out, 'userdata', 'prefs.json'), 'utf8').replace(/\s+/g, ' '));
    app.quit();
  });
});

require('../src/main.js');
