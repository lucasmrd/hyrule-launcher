// Gera o executável (dist/Hyrule Launcher-win32-x64/) e, com --zip, o pacote da release.
const { packager } = require('@electron/packager');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const root = path.join(__dirname, '..');
// --out=<pasta> permite empacotar sem sobrescrever um launcher que está aberto em dist/
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outDir = path.join(root, outArg ? outArg.slice(6) : 'dist');
const KEEP_LOCALES = ['en-US.pak', 'pt-BR.pak'];

(async () => {
  const [out] = await packager({
    dir: root,
    out: outDir,
    name: 'Hyrule Launcher',
    executableName: 'Hyrule Launcher',
    platform: 'win32',
    arch: 'x64',
    icon: path.join(root, 'src', 'assets', 'app.ico'),
    appVersion: pkg.version,
    overwrite: true,
    asar: true,
    prune: true,
    ignore: [/^\/tools/, /^\/dist/, /^\/release/, /^\/docs/, /^\/\.git/, /^\/README\.md/, /^\/node_modules\/\.cache/],
    win32metadata: { CompanyName: 'Hyrule Launcher', FileDescription: 'Hyrule Launcher', ProductName: 'Hyrule Launcher' },
  });

  // o Chromium traz ~50 idiomas; o launcher só precisa de pt-BR e en-US
  const locales = path.join(out, 'locales');
  for (const f of fs.readdirSync(locales)) if (!KEEP_LOCALES.includes(f)) fs.unlinkSync(path.join(locales, f));
  console.log('OK:', out);

  if (process.argv.includes('--zip')) {
    const zip = path.join(outDir, `Hyrule-Launcher-v${pkg.version}-win64.zip`);
    if (fs.existsSync(zip)) fs.unlinkSync(zip);
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    // dentro do zip a pasta se chama só "Hyrule Launcher"
    const named = path.join(path.dirname(out), 'Hyrule Launcher');
    fs.renameSync(out, named);
    try { execFileSync(tar, ['-a', '-c', '-f', zip, '-C', path.dirname(named), path.basename(named)]); }
    finally { fs.renameSync(named, out); }
    console.log('ZIP:', zip, `${(fs.statSync(zip).size / 1048576).toFixed(0)} MB`);
  }
})();
