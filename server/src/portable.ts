/**
 * `npm run portable` (1.6.3): a copy of the app for another computer of the same system (Windows,
 * macOS or Linux, the same processor) that needs neither Node.js nor the internet — for a PC
 * without them, carried on a flash drive. Into `portable/VerseOrchestrator-<version>-<os>-<arch>/`:
 * the project's tracked files, this Node (node + npm, so the launcher can still install or rebuild
 * there), only the dependencies the app runs on (server + builder — not the bundler), the built
 * interface and, with `--with-library`, the library and its segments. The launchers use the Node
 * inside the folder first.
 *
 *   npm run portable [-- --with-library]
 *
 * Like launcher.ts: only node: imports and no TS-only syntax (`node server/src/portable.ts`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NPM_CI, writeDepsRecord } from './launcher.ts';
import { buildUi, run } from './standby.ts';

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
    if (missing) return `немає ${path.win32.join(dir, missing)} — потрібен Node.js з npm`;
    return files.map((f) => ({ from: path.win32.join(dir, f), to: f }));
  }
  const npm = [execPath, realExecPath]
    .map((p) => path.posix.join(path.posix.dirname(p), '..', 'lib', 'node_modules', 'npm'))
    .find((p) => exists(p));
  if (!npm) return `немає npm поруч із ${realExecPath} — потрібен Node.js з npm`;
  return [
    { from: realExecPath, to: 'bin/node' },
    { from: npm, to: 'lib/node_modules/npm' },
  ];
}

/** bin/npm and bin/npx of the copy: the npm beside it, run by the node beside it. */
export const npmShim = (cli: 'npm-cli' | 'npx-cli') => `#!/bin/sh
# npm of the Node in this folder (VerseOrchestrator portable copy)
here=$(dirname "$0")
exec "$here/node" "$here/../lib/node_modules/npm/bin/${cli}.js" "$@"
`;

const SYSTEM: Record<string, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };

/** The note next to the launchers — in Ukrainian, for whoever opens the folder. */
export function howToStart(o: {
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  withLibrary: boolean;
}): string {
  const launcher =
    o.platform === 'win32'
      ? 'двічі клацніть start.cmd'
      : o.platform === 'darwin'
        ? 'двічі клацніть start.command'
        : 'виконайте ./start.sh у терміналі';
  const off = o.platform === 'win32' ? 'start.cmd --off' : './start.sh --off';
  return [
    `VerseOrchestrator ${o.version} — портативна копія для ${SYSTEM[o.platform] ?? o.platform} (${o.arch})`,
    '',
    'Node.js та інтернет не потрібні: усе потрібне — у цій папці.',
    '',
    `Запуск: ${launcher}. Вікно керування відкриється в браузері, адресу для`,
    'телефонів видно у вікні запуску.',
    `Зупинити: закрийте вікно запуску. Вимкнути все й прибрати автозапуск: ${off}.`,
    '',
    o.withLibrary
      ? 'Тексти: бібліотеку вже додано.'
      : 'Тексти: покладіть модулі MyBible (*.SQLite3) у папку modules/ — застосунок збере\nбібліотеку сам (кілька хвилин).',
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
const secs = (from: number) => `${((Date.now() - from) / 1000).toFixed(1)} с`;

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
  const withLibrary = argv.includes('--with-library');
  const unknown = argv.find((a) => a !== '--with-library');
  if (unknown) {
    say(`Невідомий параметр «${unknown}». Можна: --with-library`);
    return 2;
  }
  const started = Date.now();
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const name = `VerseOrchestrator-${version}-${process.platform}-${process.arch}`;
  const out = path.join(root, 'portable', name);
  say(`Портативна копія ${name}`);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

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
    fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
    fs.copyFileSync(from, path.join(out, f));
  }
  if (process.platform !== 'win32')
    for (const f of ['start.sh', 'start.command']) fs.chmodSync(path.join(out, f), 0o755);
  say(`✓ Файли проєкту: ${files.length}`);

  // 2. The interface, built for this version (the copy has no bundler)
  const stamp = path.join(root, 'web', 'dist', '.vo-version');
  const built = fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === version;
  if (!built) {
    const t = Date.now();
    say('… Збираю інтерфейс');
    await buildUi(root, () => undefined);
    say(`✓ Інтерфейс зібрано за ${secs(t)}`);
  }
  fs.cpSync(path.join(root, 'web', 'dist'), path.join(out, 'web', 'dist'), { recursive: true });

  // 3. This Node, with npm
  const copy = nodeCopy(process.platform, process.execPath, fs.realpathSync(process.execPath));
  if (typeof copy === 'string') {
    say(`✗ ${copy}`);
    return 1;
  }
  for (const { from, to } of copy)
    fs.cpSync(from, path.join(out, 'node', to), { recursive: true, dereference: true });
  if (process.platform !== 'win32') {
    fs.writeFileSync(path.join(out, 'node', 'bin', 'npm'), npmShim('npm-cli'), { mode: 0o755 });
    fs.writeFileSync(path.join(out, 'node', 'bin', 'npx'), npmShim('npx-cli'), { mode: 0o755 });
  }
  say(`✓ Node ${process.versions.node} (${process.platform}-${process.arch})`);

  // 4. Only what the app runs on: the server's and the builder's dependencies
  const t = Date.now();
  say('… Встановлюю залежності для роботи (без засобів розробки)');
  try {
    await run('npm', NPM_CI.runtime, out, () => undefined, { inherit: true });
  } catch {
    say('✗ Не вдалося встановити залежності (потрібен інтернет або кеш npm).');
    return 1;
  }
  const sqlite = spawnSync(
    path.join(out, 'node', process.platform === 'win32' ? 'node.exe' : 'bin/node'),
    ['-e', "new (require('better-sqlite3'))(':memory:').close()"],
    { cwd: path.join(out, 'server'), windowsHide: true },
  );
  if (sqlite.status !== 0) {
    say('✗ Модуль SQLite не завантажується в копії.');
    return 1;
  }
  // the launcher there counts these as installed, and reinstalls the same way if ever needed
  writeDepsRecord(out, 'runtime');
  say(`✓ Залежності встановлено за ${secs(t)}`);

  // 5. The texts, if asked (the library is large; modules can be added to the copy later)
  if (withLibrary) {
    const dataDir = process.env.VO_DATA_DIR ?? path.join(root, 'data');
    const db = process.env.LIBRARY_DB ?? path.join(dataDir, 'library.db');
    if (!fs.existsSync(db)) {
      say(`✗ Бібліотеки немає (${db}). Зберіть її: npm run build:library`);
      return 1;
    }
    fs.mkdirSync(path.join(out, 'data'), { recursive: true });
    fs.copyFileSync(db, path.join(out, 'data', 'library.db'));
    const segments = path.join(dataDir, 'segments');
    if (fs.existsSync(segments))
      fs.cpSync(segments, path.join(out, 'data', 'segments'), { recursive: true });
    say('✓ Бібліотеку додано');
  }

  fs.writeFileSync(
    path.join(out, 'ЯК ЗАПУСТИТИ.txt'),
    howToStart({ version, platform: process.platform, arch: process.arch, withLibrary }),
  );
  const mb = Math.round(folderBytes(out) / 1048576);
  say('');
  say(`✓ Готово за ${secs(started)}: ${out} (${mb} МБ)`);
  say('  Скопіюйте цю папку на інший комп’ютер з такою самою системою — і запускайте.');
  return 0;
}

const invokedDirectly =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) void main(process.argv.slice(2)).then((code) => process.exit(code));
