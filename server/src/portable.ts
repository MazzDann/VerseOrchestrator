/**
 * `npm run portable` (0.7.3): a copy of the app for another computer of the same system (Windows,
 * macOS or Linux, the same processor) that needs neither Node.js nor the internet — for a PC
 * without them, carried on a flash drive. Into `portable/VerseOrchestrator-<version>-<os>-<arch>/`:
 * the project's tracked files, this Node (node + npm, so the launcher can still install or rebuild
 * there), only the dependencies the app runs on (server + builder — not the bundler), the built
 * interface and, with `--with-library`, the library and its segments. The launchers use the Node
 * inside the folder first.
 *
 * The layout of a release (0.14.0): at the top only what a user needs — the start file of this
 * system, `modules/`, `data/` and a note; everything else in `app/` with a marker that points the
 * app at the user's folders (layout.ts). A new version replaces `app/` and nothing else.
 *
 *   npm run portable [-- --with-library]
 *   npm run portable -- --release        (0.14.1: what the release workflow publishes)
 *
 * `--release` makes a copy for everyone: none of this machine's settings (ui-state.json), never
 * the library (the translations carry their own licences), and the note in both languages.
 *
 * Like launcher.ts: only node: imports and no TS-only syntax (`node server/src/portable.ts`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NPM_CI, writeDepsRecord } from './launcher.ts';
import { buildUi, needsBuild, run } from './standby.ts';
import { consoleLang, setLang, tr, type Lang } from './lang.ts';
import { LAYOUT_MARKER, OS_NAME, RELEASE_MARKER } from './layout.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** What to copy of the running Node, and where it goes in the copy (the layout Node ships in). */
export type NodeCopy = { from: string; to: string }[];

/**
 * Windows: node.exe with npm next to it (npm.cmd runs node_modules\npm with the node.exe beside
 * it). Elsewhere: bin/node + lib/node_modules/npm — found beside the node on PATH or beside the
 * real file it links to (official tarballs, nvm, Homebrew); bin/npm is written as a small script
 * (a symlink wouldn't survive a flash drive). A message instead when npm isn't found.
 */
export function nodeCopy(
  platform: NodeJS.Platform,
  execPath: string,
  realExecPath: string,
  exists: (p: string) => boolean = fs.existsSync,
): NodeCopy | string {
  if (platform === 'win32') {
    const dir = path.win32.dirname(execPath);
    const files = ['node.exe', 'npm.cmd', 'npx.cmd', path.win32.join('node_modules', 'npm')];
    const missing = files.find((f) => !exists(path.win32.join(dir, f)));
    if (missing) {
      return tr('немає {file} — потрібен Node.js з npm', { file: path.win32.join(dir, missing) });
    }
    // Node's own licence goes with the binary (0.14.1: copies are published now)
    if (exists(path.win32.join(dir, 'LICENSE'))) files.push('LICENSE');
    return files.map((f) => ({ from: path.win32.join(dir, f), to: f }));
  }
  const npm = [execPath, realExecPath]
    .map((p) => path.posix.join(path.posix.dirname(p), '..', 'lib', 'node_modules', 'npm'))
    .find((p) => exists(p));
  if (!npm) return tr('немає npm поруч із {node} — потрібен Node.js з npm', { node: realExecPath });
  const copy = [
    { from: realExecPath, to: 'bin/node' },
    { from: npm, to: 'lib/node_modules/npm' },
  ];
  const licence = path.posix.join(path.posix.dirname(realExecPath), '..', 'LICENSE');
  if (exists(licence)) copy.push({ from: licence, to: 'LICENSE' });
  return copy;
}

/** bin/npm and bin/npx of the copy: the npm beside it, run by the node beside it. */
export const npmShim = (cli: 'npm-cli' | 'npx-cli') => `#!/bin/sh
# npm of the Node in this folder (VerseOrchestrator portable copy)
here=$(dirname "$0")
exec "$here/node" "$here/../lib/node_modules/npm/bin/${cli}.js" "$@"
`;

const SYSTEM: Record<string, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
/** The start file a user of this system clicks; it hands over to app/ (0.14.0). */
export const START_FILE: Record<string, string> = {
  win32: 'start.cmd',
  darwin: 'start.command',
  linux: 'start.sh',
};

/** The note next to the launchers, for whoever opens the folder — in the console's language. */
export function howToStart(
  o: {
    version: string;
    platform: NodeJS.Platform;
    arch: string;
    withLibrary: boolean;
  },
  lang?: Lang,
): string {
  const launcher =
    o.platform === 'win32'
      ? tr('двічі клацніть start.cmd', undefined, lang)
      : o.platform === 'darwin'
        ? tr('двічі клацніть start.command', undefined, lang)
        : tr('виконайте ./start.sh у терміналі', undefined, lang);
  const off =
    o.platform === 'win32' ? 'start.cmd --off' : `./${START_FILE[o.platform] ?? 'start.sh'} --off`;
  return [
    tr(
      'VerseOrchestrator {version} — портативна копія для {system} ({arch})',
      { version: o.version, system: SYSTEM[o.platform] ?? o.platform, arch: o.arch },
      lang,
    ),
    '',
    tr('Node.js та інтернет не потрібні: усе потрібне — у цій папці.', undefined, lang),
    '',
    tr(
      'Запуск: {launcher}. Вікно керування відкриється в браузері, адресу для\nтелефонів видно у вікні запуску.',
      { launcher },
      lang,
    ),
    tr(
      'Зупинити: закрийте вікно запуску. Вимкнути все й прибрати автозапуск: {off}.',
      { off },
      lang,
    ),
    '',
    o.withLibrary
      ? tr('Тексти: бібліотеку вже додано.', undefined, lang)
      : tr(
          'Тексти: покладіть модулі MyBible (*.SQLite3) у папку modules/ — застосунок збере\nбібліотеку сам (кілька хвилин).',
          undefined,
          lang,
        ),
    '',
    tr(
      'Ваші дані — у папці data/: налаштування, бібліотека, пісні. Сам застосунок — у папці\napp/: нова версія замінює лише її, а data/ і modules/ лишаються.',
      undefined,
      lang,
    ),
    '',
  ].join('\n');
}

/** Never part of the project's files (as in .gitignore): data, builds, modules, tooling. */
const NOT_PROJECT = new Set([
  '.git',
  '.claude',
  'node_modules',
  'data',
  'modules',
  'old',
  'portable',
  'dist',
]);

/** The project's files without git — the folder minus what .gitignore keeps out. */
export function projectFiles(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!NOT_PROJECT.has(e.name)) out.push(...projectFiles(dir, p));
    } else if (e.isFile() && !/\.(tsbuildinfo|log|SQLite3|db|zip|pptx?)$/i.test(e.name)) {
      if (e.name !== '.mcp.json' && !e.name.startsWith('.env')) out.push(p);
    }
  }
  return out;
}

const say = (m: string) => process.stdout.write(`${m}\n`);
const secs = (from: number) => tr('{s} с', { s: ((Date.now() - from) / 1000).toFixed(1) });

function folderBytes(dir: string): number {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += folderBytes(p);
    else if (e.isFile()) total += fs.statSync(p).size;
  }
  return total;
}

async function main(argv: string[]): Promise<number> {
  setLang(consoleLang(process.env.VO_DATA_DIR ?? path.join(root, 'data')));
  const withLibrary = argv.includes('--with-library');
  const release = argv.includes('--release');
  const unknown = argv.find((a) => a !== '--with-library' && a !== '--release');
  if (unknown) {
    say(tr('Невідомий параметр «{arg}». Можна: --with-library, --release', { arg: unknown }));
    return 2;
  }
  if (release && withLibrary) {
    say(
      tr(
        'У реліз бібліотека не потрапляє: переклади мають власні ліцензії. Приберіть --with-library.',
      ),
    );
    return 2;
  }
  const started = Date.now();
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const name = `VerseOrchestrator-${version}-${OS_NAME[process.platform] ?? process.platform}-${process.arch}`;
  const out = path.join(root, 'portable', name);
  /** the app itself; the user's folders sit next to it (0.14.0) */
  const app = path.join(out, 'app');
  say(tr('Портативна копія {name}', { name }));
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(app, { recursive: true });

  // 1. The project's files — what git tracks (no data, builds, modules or tooling), or the
  // same by name without git (a downloaded zip, a machine without git)
  let files: string[];
  try {
    files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  } catch {
    files = projectFiles(root);
  }
  // the app, not its tests (they need the dev tools the copy leaves out)
  files = files.filter((f) => !/\.test\.tsx?$/.test(f));
  for (const f of files) {
    const from = path.join(root, f);
    if (!fs.existsSync(from)) continue; // deleted, not committed yet
    fs.mkdirSync(path.dirname(path.join(app, f)), { recursive: true });
    fs.copyFileSync(from, path.join(app, f));
  }
  if (process.platform !== 'win32')
    for (const f of ['start.sh', 'start.command']) fs.chmodSync(path.join(app, f), 0o755);
  say(`✓ ${tr('Файли проєкту: {n}', { n: files.length })}`);

  // 2. The interface, built from this code (the copy has no bundler)
  if (needsBuild(root)) {
    const t = Date.now();
    say(`… ${tr('Збираю інтерфейс')}`);
    await buildUi(root, () => undefined);
    say(`✓ ${tr('Інтерфейс зібрано за {time}', { time: secs(t) })}`);
  }
  fs.cpSync(path.join(root, 'web', 'dist'), path.join(app, 'web', 'dist'), { recursive: true });

  // 3. This Node, with npm
  const copy = nodeCopy(process.platform, process.execPath, fs.realpathSync(process.execPath));
  if (typeof copy === 'string') {
    say(`✗ ${copy}`);
    return 1;
  }
  for (const { from, to } of copy)
    fs.cpSync(from, path.join(app, 'node', to), { recursive: true, dereference: true });
  if (process.platform !== 'win32') {
    fs.writeFileSync(path.join(app, 'node', 'bin', 'npm'), npmShim('npm-cli'), { mode: 0o755 });
    fs.writeFileSync(path.join(app, 'node', 'bin', 'npx'), npmShim('npx-cli'), { mode: 0o755 });
  }
  say(`✓ Node ${process.versions.node} (${process.platform}-${process.arch})`);

  // 4. Only what the app runs on: the server's and the builder's dependencies
  const t = Date.now();
  say(`… ${tr('Встановлюю залежності для роботи (без засобів розробки)')}`);
  try {
    await run('npm', NPM_CI.runtime, app, () => undefined, { inherit: true });
  } catch {
    say(`✗ ${tr('Не вдалося встановити залежності (потрібен інтернет або кеш npm).')}`);
    return 1;
  }
  const sqlite = spawnSync(
    path.join(app, 'node', process.platform === 'win32' ? 'node.exe' : 'bin/node'),
    ['-e', "new (require('better-sqlite3'))(':memory:').close()"],
    { cwd: path.join(app, 'server'), windowsHide: true },
  );
  if (sqlite.status !== 0) {
    say(`✗ ${tr('Модуль SQLite не завантажується в копії.')}`);
    return 1;
  }
  // the launcher there counts these as installed, and reinstalls the same way if ever needed
  writeDepsRecord(app, 'runtime');
  say(`✓ ${tr('Залежності встановлено за {time}', { time: secs(t) })}`);

  // 5. The texts, if asked (the library is large; modules can be added to the copy later)
  if (withLibrary) {
    const dataDir = process.env.VO_DATA_DIR ?? path.join(root, 'data');
    const db = process.env.LIBRARY_DB ?? path.join(dataDir, 'library.db');
    if (!fs.existsSync(db)) {
      say(`✗ ${tr('Бібліотеки немає ({file}). Зберіть її: npm run build:library', { file: db })}`);
      return 1;
    }
    fs.mkdirSync(path.join(out, 'data'), { recursive: true });
    fs.copyFileSync(db, path.join(out, 'data', 'library.db'));
    const segments = path.join(dataDir, 'segments');
    if (fs.existsSync(segments))
      fs.cpSync(segments, path.join(out, 'data', 'segments'), { recursive: true });
    say(`✓ ${tr('Бібліотеку додано')}`);
  }

  // the operator's settings and running order travel with the copy (0.7.4) — not with a release
  const uiState = path.join(process.env.VO_DATA_DIR ?? path.join(root, 'data'), 'ui-state.json');
  if (!release && fs.existsSync(uiState)) {
    fs.mkdirSync(path.join(out, 'data'), { recursive: true });
    fs.copyFileSync(uiState, path.join(out, 'data', 'ui-state.json'));
    say(`✓ ${tr('Налаштування вигляду й послідовність')}`);
  }

  // 6. What a user sees (0.14.0): the start file, modules/, data/ and the note — the rest is app/
  fs.writeFileSync(path.join(app, LAYOUT_MARKER), `${JSON.stringify(RELEASE_MARKER)}\n`);
  const start = START_FILE[process.platform] ?? 'start.sh';
  fs.copyFileSync(path.join(app, start), path.join(out, start));
  if (process.platform !== 'win32') fs.chmodSync(path.join(out, start), 0o755);
  for (const d of ['modules', 'data']) fs.mkdirSync(path.join(out, d), { recursive: true });
  // a release is for everyone: the note in both languages; a copy for yourself — in yours
  const notes: (Lang | undefined)[] = release ? ['uk', 'en'] : [undefined];
  for (const lang of notes)
    fs.writeFileSync(
      path.join(out, tr('ЯК ЗАПУСТИТИ.txt', undefined, lang)),
      howToStart({ version, platform: process.platform, arch: process.arch, withLibrary }, lang),
    );
  say(`✓ ${tr('Зверху: {start}, modules/, data/; застосунок — у app/', { start })}`);
  const mb = Math.round(folderBytes(out) / 1048576);
  say('');
  say(`✓ ${tr('Готово за {time}: {folder} ({mb} МБ)', { time: secs(started), folder: out, mb })}`);
  say(`  ${tr('Скопіюйте цю папку на інший комп’ютер з такою самою системою — і запускайте.')}`);
  return 0;
}

const invokedDirectly =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) void main(process.argv.slice(2)).then((code) => process.exit(code));
