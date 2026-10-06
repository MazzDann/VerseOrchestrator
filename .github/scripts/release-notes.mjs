// The notes of a GitHub release (0.14.1): the tag's own line, then what the release brings — the
// tag message's body, Markdown, as written (1.6.4) — then how to download, start, and update, in
// Ukrainian, then in English. Called by .github/workflows/ci.yml:
//
//   node .github/scripts/release-notes.mjs v0.14.1 > notes.md
import { execFileSync } from 'node:child_process';

const tag = process.argv[2] ?? '';
// a release, or a beta (1.8.11): the grammar of server/src/updates.ts
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/.test(tag)) {
  console.error('usage: node .github/scripts/release-notes.mjs vX.Y.Z[-beta.N]');
  process.exit(2);
}
const field = (name) =>
  execFileSync('git', ['tag', '-l', `--format=%(${name})`, tag], { encoding: 'utf8' }).trim();
const subject = field('contents:subject');
const body = field('contents:body');
const preview = tag.startsWith('v0.');
const beta = !preview && tag.includes('-');

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
  'Перший запуск: Windows може попередити про файл з інтернету — підтвердьте запуск. macOS',
  'блокує `start.command`, бо застосунок не підписаний Apple: **Системні параметри** →',
  '**Приватність і безпека** → «Усе одно відкрити» (Open Anyway) → підтвердьте (лише першого',
  'разу; до macOS 15 — правою кнопкою на файлі → **Відкрити**).',
  '',
  'Оновлення: з 1.0.0 застосунок сам каже про нову версію й установлює її — **Налаштування',
  'вигляду** → **Застосунок** → **Оновлення** → **Завантажити оновлення**, потім **Перезапустити й',
  'оновити**. Там само можна вибрати й іншу версію, новішу чи старішу (від 1.6.2). Версію 0.x',
  'оновіть вручну: замініть папку `app/` папкою `app/` з нового архіву. Папки',
  '`data/` (налаштування, бібліотека, пісні) і `modules/` лишаються. Контрольні суми архівів — у',
  '`SHA256SUMS.txt`.',
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
  'First start: Windows may warn about a file from the internet — confirm to run it. macOS',
  'blocks `start.command` because the app isn’t signed by Apple: **System Settings** >',
  '**Privacy & Security** > **Open Anyway** > confirm (the first time only; before macOS 15,',
  'right-click the file > **Open**).',
  '',
  'Updating: from 1.0.0 on, the app tells you about a new version and installs it — **Налаштування',
  'вигляду** > **Застосунок** > **Оновлення** > **Завантажити оновлення**, then **Перезапустити й',
  'оновити**. You can choose another version there too, newer or older (from 1.6.2 on). Update a',
  '0.x version by hand: replace the `app/` folder with the one from the new',
  'archive. The `data/` (settings, library, songs) and `modules/` folders stay. Archive checksums',
  'are in `SHA256SUMS.txt`.',
];

const blocks = [
  subject && `**${subject}**`,
  body,
  preview &&
    'Попередня версія (0.x): перший реліз буде 1.0.0. · A preview (0.x): the first release will be 1.0.0.',
  beta &&
    'Бета-версія: застосунок пропонує її лише на каналі «Бета» (Налаштування вигляду → Застосунок → Оновлення). · A beta: the app offers it only on the «Бета» (Beta) channel (Settings → App → Updates).',
  uk.join('\n'),
  '---',
  en.join('\n'),
];
console.log(blocks.filter(Boolean).join('\n\n'));
