// The notes of a GitHub release (0.14.1): the tag's own line, then how to download, start, and
// update — in Ukrainian, then in English. Called by .github/workflows/ci.yml:
//
//   node .github/scripts/release-notes.mjs v0.14.1 > notes.md
import { execFileSync } from 'node:child_process';

const tag = process.argv[2] ?? '';
if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error('usage: node .github/scripts/release-notes.mjs vX.Y.Z');
  process.exit(2);
}
const subject = execFileSync('git', ['tag', '-l', '--format=%(contents:subject)', tag], {
  encoding: 'utf8',
}).trim();
const preview = tag.startsWith('v0.');

const files = [
  ['Windows 10/11 (x64)', 'VerseOrchestrator-windows-x64.zip'],
  ['macOS (Apple Silicon)', 'VerseOrchestrator-macos-arm64.zip'],
  ['Linux (x64)', 'VerseOrchestrator-linux-x64.tar.gz'],
];
const table = (system, file) => [
  `| ${system} | ${file} |`,
  '| --- | --- |',
  ...files.map(([s, f]) => `| ${s} | \`${f}\` |`),
];

const uk = [
  '### Завантажте для своєї системи',
  '',
  ...table('Система', 'Файл'),
  '',
  '1. Розпакуйте архів у зручну папку.',
  '2. Запустіть `start.cmd` (Windows), `start.command` (macOS) або `./start.sh` (Linux).',
  '   Node.js та інтернет не потрібні: усе потрібне — в архіві.',
  '3. Покладіть модулі MyBible (`*.SQLite3`) у папку `modules/`: бібліотеку застосунок збере сам.',
  '',
  'Перший запуск: Windows може попередити про файл з інтернету — підтвердьте запуск. На Mac',
  'клацніть `start.command` правою кнопкою → **Відкрити** → **Відкрити** (лише першого разу).',
  '',
  'Оновлення: замініть папку `app/` папкою `app/` з нового архіву. Папки `data/` (налаштування,',
  'бібліотека, пісні) і `modules/` лишаються. Контрольні суми архівів — у `SHA256SUMS.txt`.',
];
const en = [
  '### Download for your system',
  '',
  ...table('System', 'File'),
  '',
  '1. Extract the archive to a folder of your choice.',
  '2. Run `start.cmd` (Windows), `start.command` (macOS), or `./start.sh` (Linux).',
  '   Node.js and an internet connection aren’t needed: everything is in the archive.',
  '3. Put MyBible modules (`*.SQLite3`) in the `modules/` folder: the app builds its library.',
  '',
  'First start: Windows may warn about a file from the internet — confirm to run it. On a Mac,',
  'right-click `start.command` → **Open** → **Open** (the first time only).',
  '',
  'Updating: replace the `app/` folder with the `app/` folder from the new archive. The `data/`',
  '(settings, library, songs) and `modules/` folders stay. Archive checksums are in `SHA256SUMS.txt`.',
];

const blocks = [
  subject && `**${subject}**`,
  preview &&
    'Попередня версія (0.x): перший реліз буде 1.0.0. · A preview (0.x): the first release will be 1.0.0.',
  uk.join('\n'),
  '---',
  en.join('\n'),
];
console.log(blocks.filter(Boolean).join('\n\n'));
