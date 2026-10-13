import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Files from a Mac's own apps, read as what the app reads (macOS only — the user's ask,
 * 2026-10-13): Pages (.pages) and the formats macOS itself reads (.rtf, .doc, .odt, .html,
 * .webarchive) through a Word .docx straight into the library — no file is left beside them
 * (documents.ts); Keynote (.key) → a PowerPoint .pptx for «Пісні»'s import.
 * `textutil` is part of macOS; Pages and Keynote do their own export when they're installed
 * (AppleScript — macOS asks once whether the app may control them).
 */
export type ConvertTo = 'docx' | 'pptx';
export interface Converter {
  ext: string;
  to: ConvertTo;
  via: 'textutil' | 'pages' | 'keynote';
}

const TEXTUTIL = '/usr/bin/textutil';
const OSASCRIPT = '/usr/bin/osascript';
/** what textutil reads (`man textutil`), the ones people send: Word 97, OpenDocument, RTF, web */
const TEXTUTIL_EXT = ['rtf', 'doc', 'odt', 'wordml', 'html', 'htm', 'webarchive'];
/** a Pages document of 50 pages exports in seconds; the app's first start takes longer */
const TIMEOUT_MS = 120_000;

const installed = (name: string): boolean =>
  [path.join('/Applications', name), path.join(os.homedir(), 'Applications', name)].some((p) =>
    fs.existsSync(p),
  );

/** What this computer converts (none but on macOS). */
export function converters(
  platform: NodeJS.Platform = process.platform,
  has: (app: string) => boolean = installed,
  exists: (p: string) => boolean = fs.existsSync,
): Converter[] {
  if (platform !== 'darwin') return [];
  const out: Converter[] = [];
  if (exists(TEXTUTIL))
    for (const ext of TEXTUTIL_EXT) out.push({ ext, to: 'docx', via: 'textutil' });
  if (has('Pages.app')) out.push({ ext: 'pages', to: 'docx', via: 'pages' });
  if (has('Keynote.app')) out.push({ ext: 'key', to: 'pptx', via: 'keynote' });
  return out;
}

export const extOf = (name: string): string =>
  (/\.([^./\\]+)$/.exec(name)?.[1] ?? '').toLowerCase();

/** The converter for a file name, if this computer has one. */
export const converterFor = (name: string, list: Converter[] = converters()): Converter | null =>
  list.find((c) => c.ext === extOf(name)) ?? null;

/** The name the converted file takes: the same, with the new extension. */
export const convertedName = (name: string, to: ConvertTo): string =>
  name.replace(/\.[^./\\]+$/, '') + `.${to}`;

/** An app's own export, run by AppleScript: the document opens, is exported, closes unsaved. */
function exportScript(app: 'Pages' | 'Keynote', as: string): string {
  return [
    'on run argv',
    `  tell application "${app}"`,
    // an alias, not a POSIX file: with that, open returns no document (Mac check)
    '    set d to open ((POSIX file (item 1 of argv)) as alias)',
    // a failed export leaves no document open in the app (review)
    '    try',
    `      export d to (POSIX file (item 2 of argv)) as ${as}`,
    '    on error m number n',
    '      close d saving no',
    '      error m number n',
    '    end try',
    '    close d saving no',
    '  end tell',
    'end run',
  ].join('\n');
}

/** A conversion that ran out of time — Pages / Keynote waiting for macOS's question, or stuck. */
export class ConvertTimeout extends Error {}

function run(cmd: string, args: string[], timeout = TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout, cwd: os.tmpdir() }, (err, _out, stderr) => {
      if (!err) return resolve();
      const msg = String(stderr || err.message).trim();
      reject(err.killed ? new ConvertTimeout(msg || 'timed out') : new Error(msg));
    }),
  );
}

/**
 * The document a timed-out export left open (osascript was stopped before its `close`): closed
 * unsaved by its file (the PC's review of #14). Best effort, briefly — the app may still wait.
 */
export function closeLeftOpen(app: 'Pages' | 'Keynote', file: string): Promise<void> {
  const script = [
    'on run argv',
    `  tell application "${app}"`,
    '    repeat with d in (every document)',
    '      try',
    '        if POSIX path of ((file of d) as alias) is (item 1 of argv) then close d saving no',
    '      end try',
    '    end repeat',
    '  end tell',
    'end run',
  ].join('\n');
  // the app reports the real path: /var/folders/… is /private/var/folders/… there (Mac check)
  let real = file;
  try {
    real = fs.realpathSync(file);
  } catch {
    /* gone: the path as given */
  }
  return run(OSASCRIPT, ['-e', script, real], 15_000).catch(() => undefined);
}

/** Converts the file at `from` into `to` (a path ending in .docx / .pptx). */
export async function convertFile(c: Converter, from: string, to: string): Promise<void> {
  if (c.via === 'textutil') await run(TEXTUTIL, ['-convert', 'docx', '-output', to, from]);
  else {
    const app = c.via === 'pages' ? 'Pages' : 'Keynote';
    const as = c.via === 'pages' ? 'Microsoft Word' : 'Microsoft PowerPoint';
    try {
      await run(OSASCRIPT, ['-e', exportScript(app, as), from, to]);
    } catch (e) {
      if (e instanceof ConvertTimeout) await closeLeftOpen(app, from);
      throw e;
    }
  }
  if (!fs.existsSync(to)) throw new Error('nothing was written');
}

/** A dropped file's bytes converted: the new bytes and name, the temporary files gone. */
export async function convertBytes(
  c: Converter,
  bytes: Uint8Array,
  name: string,
): Promise<{ bytes: Buffer; name: string }> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-convert-'));
  try {
    const base = path.basename(name).replace(/[\\/:]/g, '_') || `file.${c.ext}`;
    const from = path.join(work, base);
    const out = path.join(work, convertedName(base, c.to));
    fs.writeFileSync(from, bytes);
    await convertFile(c, from, out);
    return { bytes: fs.readFileSync(out), name: convertedName(path.basename(name), c.to) };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
