// node desktop/scripts/pack.mjs <release folder>
//
// The desktop app (feat/desktop) put into a release copy that `npm run portable -- --release`
// made (portable/VerseOrchestrator-<version>-<os>-<arch>/). The desktop app replaces the browser
// there (the author, 2026-10-13): start.cmd / start.command / start.sh open it.
//   - app/desktop/dist — the shell's code: part of app/, so «Оновлення» updates it with the rest;
//   - shell/ (Windows, Linux) or VerseOrchestrator.app (macOS) — Electron itself, with a stub app
//     that finds app/ and runs that code. Electron changes rarely; a new one comes in a new archive.
// Run after `npm ci && npm run build` in desktop/ (Electron for THIS system comes with npm ci).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const top = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !fs.existsSync(path.join(top, 'app', 'server', 'src', 'launcher.ts'))) {
  console.error('usage: node desktop/scripts/pack.mjs <a release copy with app/ in it>');
  process.exit(2);
}
const electronDist = path.join(desktop, 'node_modules', 'electron', 'dist');
const shellDist = path.join(desktop, 'dist');
if (!fs.existsSync(electronDist) || !fs.existsSync(path.join(shellDist, 'main.js'))) {
  console.error('run `npm ci && npm run build` in desktop/ first');
  process.exit(2);
}
const version = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8')).version;

// 1. the shell's code inside app/ (updated with app/)
const code = path.join(top, 'app', 'desktop', 'dist');
fs.rmSync(code, { recursive: true, force: true });
fs.mkdirSync(code, { recursive: true });
for (const f of fs.readdirSync(shellDist))
  if (/\.(js|cjs)$/.test(f) && !/\.test\./.test(f))
    fs.copyFileSync(path.join(shellDist, f), path.join(code, f));

/** Electron's app: a stub that finds app/ up from the program and runs the shell's code there. */
const STUB = `// VerseOrchestrator: the shell's code lives in app/desktop/dist (updated with the app)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, dialog } from 'electron';

let dir = path.dirname(process.execPath);
let main = null;
for (let i = 0; i < 7 && !main; i++) {
  const at = path.join(dir, 'app', 'desktop', 'dist', 'main.js');
  if (fs.existsSync(at)) main = at;
  dir = path.dirname(dir);
}
if (main) await import(pathToFileURL(main).href);
else {
  await app.whenReady();
  dialog.showErrorBox('VerseOrchestrator', 'app/desktop is missing next to the program — unpack the archive again.');
  app.quit();
}
`;
function putStub(resources) {
  const to = path.join(resources, 'app');
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  fs.writeFileSync(path.join(to, 'main.js'), STUB);
  fs.writeFileSync(
    path.join(to, 'package.json'),
    JSON.stringify(
      {
        name: 'verseorchestrator',
        productName: 'VerseOrchestrator',
        version,
        type: 'module',
        main: 'main.js',
      },
      null,
      2,
    ),
  );
  // Electron's own sample app goes
  fs.rmSync(path.join(resources, 'default_app.asar'), { force: true });
}

/** Chromium's interface languages: the two the app speaks (the rest is ~40 MB). */
function pruneLocales(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir))
    if (!/^(en-US|uk)\.pak$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
}

// 2. Electron with the stub
const started = Date.now();
if (process.platform === 'darwin') {
  const appDir = path.join(top, 'VerseOrchestrator.app');
  fs.rmSync(appDir, { recursive: true, force: true });
  // ditto keeps the bundle's links and modes (cp would break the frameworks)
  execFileSync('ditto', [path.join(electronDist, 'Electron.app'), appDir]);
  putStub(path.join(appDir, 'Contents', 'Resources'));
  const plist = path.join(appDir, 'Contents', 'Info.plist');
  for (const key of ['CFBundleName', 'CFBundleDisplayName'])
    execFileSync('plutil', ['-replace', key, '-string', 'VerseOrchestrator', plist]);
} else {
  const to = path.join(top, 'shell');
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(electronDist, to, { recursive: true });
  pruneLocales(path.join(to, 'locales'));
  putStub(path.join(to, 'resources'));
  if (process.platform === 'win32') {
    const exe = path.join(to, 'VerseOrchestrator.exe');
    fs.renameSync(path.join(to, 'electron.exe'), exe);
  } else {
    fs.renameSync(path.join(to, 'electron'), path.join(to, 'verseorchestrator'));
  }
}
const mb = (p) => {
  let n = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.isFile()) n += fs.statSync(f).size;
    }
  };
  walk(p);
  return Math.round(n / 1048576);
};
const shellDir = process.platform === 'darwin' ? 'VerseOrchestrator.app' : 'shell';
console.log(
  `desktop app added to ${top} in ${Date.now() - started} ms (${shellDir}: ${mb(path.join(top, shellDir))} MB)`,
);
