import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zip, type ZipEntry } from './zip.js';

/**
 * «Діагностика для відгуку» (1.22.0-beta.5, users' F1107-05: «додати якесь логування, щоб можна
 * було долучати зіпкою до відгука»): one .zip to attach to a report — what the app and the
 * computer are, the waiter's log (its end), the server's options, and what the control window
 * adds of its own (its notices this session, the output windows, the browser). Nothing of the
 * operator's content: no texts, pictures, tokens — the settings' secrets live elsewhere
 * (secrets.json) and are never read here.
 */

/** How much of a log's end goes in: the last lines matter, a long log mostly repeats itself. */
export const LOG_TAIL = 512 * 1024;

/** The last `max` bytes of a file, from a line's start; null when there is none. */
export function tailOf(file: string, max = LOG_TAIL): Buffer | null {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const from = Math.max(0, size - max);
    const buf = Buffer.alloc(size - from);
    fs.readSync(fd, buf, 0, buf.length, from);
    if (from === 0) return buf;
    const nl = buf.indexOf(0x0a);
    return nl >= 0 ? buf.subarray(nl + 1) : buf;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export interface DiagnosticsInput {
  dataDir: string;
  version: string;
  /** branch · commit of a clone, or the release's own label */
  label: string;
  /** a release copy (app/ beside data/), not a clone */
  release: boolean;
  /** the server's options (data/settings.json) as the app reads them */
  settings: unknown;
  /** what the control window sends of its own (JSON), as it came */
  client: unknown;
  now?: Date;
}

/** The diagnostics .zip. */
export async function diagnosticsZip(o: DiagnosticsInput): Promise<Buffer> {
  const now = o.now ?? new Date();
  const about = {
    app: 'VerseOrchestrator',
    version: o.version,
    label: o.label,
    copy: o.release ? 'release' : 'clone',
    made: now.toISOString(),
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    node: process.version,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    cpus: os.cpus().length,
  };
  const json = (x: unknown) => Buffer.from(JSON.stringify(x, null, 2) + '\n', 'utf8');
  const entries: ZipEntry[] = [
    { name: 'about.json', data: json(about) },
    { name: 'server-settings.json', data: json(o.settings) },
    { name: 'control-window.json', data: json(o.client ?? null) },
  ];
  for (const name of ['standby.log', 'standby.log.old']) {
    const tail = tailOf(
      path.join(o.dataDir, name),
      name.endsWith('.old') ? LOG_TAIL / 2 : LOG_TAIL,
    );
    if (tail) entries.push({ name, data: tail });
  }
  entries.push({
    name: 'README.txt',
    data: Buffer.from(
      [
        'VerseOrchestrator — diagnostics for a report.',
        'Attach this file to your report. Look inside first if you wish: the logs name the folders of this computer.',
        // both languages in the file itself: it travels to whoever reads the report
        'Діагностика для відгуку. Додайте цей файл до відгуку; у журналах є шляхи до папок цього комп’ютера.', // i18n-ignore
        '',
      ].join('\n'),
      'utf8',
    ),
  });
  return zip(entries, now);
}

/** The file name a browser saves it under. */
export const diagnosticsName = (version: string, now = new Date()) =>
  `VerseOrchestrator-diagnostics-${version}-${now.toISOString().slice(0, 10)}.zip`;
