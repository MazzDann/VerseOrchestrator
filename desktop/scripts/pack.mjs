// node desktop/scripts/pack.mjs <release folder>
//
// The desktop app (feat/desktop) put into a release copy that `npm run portable -- --release`
// made (portable/VerseOrchestrator-<version>-<os>-<arch>/). The desktop app replaces the browser
// there (the author, 2026-10-13): start.cmd / start.command / start.sh open it.
//   - app/desktop/dist — the shell's code: part of app/, so «Оновлення» updates it with the rest;
//   - shell/ (Windows, Linux) or VerseOrchestrator.app (macOS) — Electron itself, with a stub app
//     that finds app/ and runs that code. Electron changes rarely; a new one comes in a new archive.
// Run after `npm ci && npm run build` in desktop/ (Electron for THIS system comes with npm ci).
import { Buffer } from 'node:buffer';
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

// macOS keeps Documents, Desktop, Downloads and flash drives from an app until the user allows it:
// a copy there reads as «not found» unless the refusal is told apart (Mac check of feat/desktop)
function look() {
  let dir = path.dirname(process.execPath);
  let denied = false;
  for (let i = 0; i < 7; i++) {
    const at = path.join(dir, 'app', 'desktop', 'dist', 'main.js');
    try {
      fs.statSync(at);
      return { main: at, denied };
    } catch (e) {
      if (e.code === 'EPERM' || e.code === 'EACCES') denied = true;
    }
    dir = path.dirname(dir);
  }
  return { main: null, denied };
}
function missing(denied) {
  dialog.showErrorBox(
    'VerseOrchestrator',
    denied
      ? 'macOS не дає застосунку доступу до теки, де він лежить (Документи, Робочий стіл, Завантаження чи флешка). Дозвольте: Системні параметри → Приватність і безпека → Файли та папки → VerseOrchestrator — або перенесіть теку застосунку, наприклад, у свою домашню теку.\\n\\nmacOS keeps the app from the folder it is in (Documents, Desktop, Downloads or a flash drive). Allow it: System Settings → Privacy & Security → Files & Folders → VerseOrchestrator — or move the app’s folder, say, into your home folder.'
      : 'Поруч із програмою немає app/desktop — розпакуйте архів ще раз.\\n\\napp/desktop is missing next to the program — unpack the archive again.',
  );
  app.quit();
}
if (process.platform === 'darwin') {
  // macOS asks for such a folder only once the app has launched — and awaiting «ready» here, at the
  // top, would hold «ready» back for good (the Mac check: the app bounced in the Dock and stopped)
  void app.whenReady().then(async () => {
    const found = look();
    if (found.main) await import(pathToFileURL(found.main).href);
    else missing(found.denied);
  });
} else {
  const found = look();
  if (found.main) await import(pathToFileURL(found.main).href);
  else void app.whenReady().then(() => missing(found.denied));
}
`;
function putStub(resources) {
  const to = path.join(resources, 'app');
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  fs.writeFileSync(path.join(to, 'main.js'), STUB);
  // a stub that doesn't parse is a dialog at every start: checked here, not on the user's screen
  execFileSync(process.execPath, ['--check', path.join(to, 'main.js')]);
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

/**
 * The app's icon and name on the .exe (Explorer, the taskbar, «Властивості»): its resources
 * rewritten with resedit — pure JavaScript, what Electron's own packager uses since rcedit was
 * dropped (rcedit is deprecated on npm). The program runs the same without it: a failure says so.
 */
async function brandExe(exe, ico) {
  try {
    const ResEdit = await import('resedit');
    const pe = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
    const res = ResEdit.NtExecutableResource.from(pe);
    const icon = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
    // Electron's own icon group: replaced in place, every size of ours (16…256)
    const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
    const group = groups[0];
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      group ? group.id : 1,
      group ? group.lang : 1033,
      icon.icons.map((i) => i.data),
    );
    const info = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
    if (info) {
      for (const lang of info.getAllLanguagesForStringValues())
        info.setStringValues(lang, {
          ProductName: 'VerseOrchestrator',
          FileDescription: 'VerseOrchestrator',
          InternalName: 'VerseOrchestrator',
          OriginalFilename: 'VerseOrchestrator.exe',
          CompanyName: 'VerseOrchestrator',
        });
      info.outputToResourceEntries(res.entries);
    }
    res.outputResource(pe);
    fs.writeFileSync(exe, Buffer.from(pe.generate()));
  } catch (e) {
    console.warn(`the .exe keeps Electron's icon: ${e.message}`);
  }
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
  // its own id: macOS keeps permissions, the Dock's place and the window state per id — Electron's
  // shared one mixed them with any other Electron app (Mac check of feat/desktop)
  execFileSync('plutil', [
    '-replace',
    'CFBundleIdentifier',
    '-string',
    'io.github.mazzdann.verseorchestrator',
    plist,
  ]);
  // why it asks for the folder it sits in (Documents, Desktop, Downloads, a flash drive): without
  // these, macOS may refuse the files outright — a copy unpacked in Downloads didn't start (Mac check)
  const why = {
    NSDocumentsFolderUsageDescription:
      'VerseOrchestrator читає свої файли й вашу бібліотеку з теки, де лежить застосунок.',
    NSDesktopFolderUsageDescription:
      'VerseOrchestrator читає свої файли й вашу бібліотеку з теки, де лежить застосунок.',
    NSDownloadsFolderUsageDescription:
      'VerseOrchestrator читає свої файли й вашу бібліотеку з теки, де лежить застосунок.',
    NSRemovableVolumesUsageDescription:
      'VerseOrchestrator читає свої файли, бібліотеку й альбоми з флешки чи зовнішнього диска.',
    NSNetworkVolumesUsageDescription:
      'VerseOrchestrator читає альбоми й відео з мережевої теки, коли ви їх туди покладете.',
  };
  for (const [key, text] of Object.entries(why))
    execFileSync('plutil', ['-replace', key, '-string', text, plist]);
  // the app's icon (assets/icon.icns from assets/icon-mac.svg, made with iconutil): edge to edge —
  // macOS 26 rounds a full square itself, and put the older grid's icon (a transparent margin) on a
  // light plate, a white rim in a dark Dock (the user, 2026-10-13). macOS 13–15 show it square; an
  // Assets.car icon for both (Icon Composer, Xcode 26's actool) would need Xcode on the runner
  fs.copyFileSync(
    path.join(here, '..', 'assets', 'icon.icns'),
    path.join(appDir, 'Contents', 'Resources', 'electron.icns'),
  );
  // Chromium's languages but two, like shell/locales elsewhere: 49 MB less
  const res = path.join(
    appDir,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Resources',
  );
  for (const f of fs.readdirSync(res))
    if (f.endsWith('.lproj') && !/^(en|uk)\.lproj$/.test(f))
      fs.rmSync(path.join(res, f), { recursive: true, force: true });
  // the changes above break Electron's signature: a quarantined copy would then be «damaged» (no
  // «Open Anyway»). Signed again ad hoc, it is only «from an unidentified developer» (Mac check)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appDir]);
} else {
  const to = path.join(top, 'shell');
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(electronDist, to, { recursive: true });
  pruneLocales(path.join(to, 'locales'));
  putStub(path.join(to, 'resources'));
  if (process.platform === 'win32') {
    const exe = path.join(to, 'VerseOrchestrator.exe');
    fs.renameSync(path.join(to, 'electron.exe'), exe);
    await brandExe(exe, path.join(top, 'app', 'web', 'dist', 'icon.ico'));
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
