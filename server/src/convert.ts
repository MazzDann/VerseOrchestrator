import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Files from a Mac's own apps, turned into what the app reads (macOS only — the user's ask,
 * 2026-10-13): Pages (.pages) and the formats macOS itself reads (.rtf, .doc, .odt, .html,
 * .webarchive) → a Word .docx, a document; Keynote (.key) → a PowerPoint .pptx, a song.
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

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: TIMEOUT_MS, cwd: os.tmpdir() }, (err, _out, stderr) =>
      err ? reject(new Error(String(stderr || err.message).trim())) : resolve(),
    ),
  );
}

/** Converts the file at `from` into `to` (a path ending in .docx / .pptx). */
export async function convertFile(c: Converter, from: string, to: string): Promise<void> {
  if (c.via === 'textutil') await run(TEXTUTIL, ['-convert', 'docx', '-output', to, from]);
  else if (c.via === 'pages')
    await run(OSASCRIPT, ['-e', exportScript('Pages', 'Microsoft Word'), from, to]);
  else await run(OSASCRIPT, ['-e', exportScript('Keynote', 'Microsoft PowerPoint'), from, to]);
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

/**
 * What the documents folder converted: target (the .docx made) → its source and both files'
 * size and time. Kept in the folder itself, hidden (the folder's listing skips dot files).
 */
export const CONVERTED_RECORD = '.converted.json';
interface Made {
  source: string;
  sourceSize: number;
  sourceMtime: number;
  size: number;
  mtime: number;
}

const stamp = (p: string): { size: number; mtime: number } | null => {
  const st = fs.statSync(p, { throwIfNoEntry: false });
  return st?.isFile() ? { size: st.size, mtime: Math.floor(st.mtimeMs) } : null;
};

/**
 * The documents folder: a .pages / .rtf / .doc / .odt put there gets a .docx next to it (the
 * library reads that); a source changed makes it again; a source gone takes its .docx with it —
 * only one this made and nobody changed since. A .docx of the same name that this didn't make is
 * left alone (the user's own). Keynote files are songs, not documents: not here.
 */
export async function convertDocumentsFolder(
  dir: string,
  list: Converter[] = converters(),
  log: (msg: string) => void = () => {},
  convert: typeof convertFile = convertFile,
  /** sources that failed, by their size and time: not tried again until they change (review) */
  failed: Map<string, string> = new Map(),
): Promise<number> {
  const docs = list.filter((c) => c.to === 'docx');
  if (docs.length === 0 || !fs.existsSync(dir)) return 0;
  const recordPath = path.join(dir, CONVERTED_RECORD);
  let record: Record<string, Made> = {};
  try {
    record = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as Record<string, Made>;
  } catch {
    /* none yet */
  }
  const sources: string[] = [];
  const walk = (sub: string, depth: number) => {
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(path.join(dir, sub), { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names) {
      if (d.name.startsWith('.') || d.name.startsWith('~$')) continue;
      const rel = sub ? `${sub}/${d.name}` : d.name;
      if (d.isDirectory()) {
        if (depth < 3) walk(rel, depth + 1);
      } else if (d.isFile() && docs.some((c) => c.ext === extOf(d.name))) sources.push(rel);
    }
  };
  walk('', 0);
  sources.sort();
  let made = 0;
  let changed = false;
  // written after each conversion: a pass cut short leaves no .docx unaccounted for (review)
  const save = () => {
    const tmp = `${recordPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 1));
    fs.renameSync(tmp, recordPath);
  };
  const live = new Set<string>();
  for (const rel of sources) {
    const c = docs.find((x) => x.ext === extOf(rel))!;
    const target = convertedName(rel, 'docx');
    const src = stamp(path.join(dir, rel));
    if (!src) continue;
    // two sources for one .docx (Лекція.rtf and Лекція.pages): the first by name keeps it (review)
    if (live.has(target)) continue;
    live.add(target);
    const was = record[target];
    const now = stamp(path.join(dir, target));
    if (was && was.source !== rel) continue; // another source's
    if (now && !was) continue; // the user's own .docx of that name
    // made from this very source: kept — even when the .docx was deleted in the app (its
    // «Скасувати» needs the place free) — until the source changes (review)
    if (was && was.sourceSize === src.size && was.sourceMtime === src.mtime) continue;
    if (now && was && (was.size !== now.size || was.mtime !== now.mtime)) continue; // edited since
    const key = `${src.size}:${src.mtime}`;
    if (failed.get(rel) === key) continue;
    // made in a hidden folder first: the folder's watcher never reads a half-written .docx
    const work = path.join(dir, '.converting');
    const part = path.join(work, path.basename(target));
    try {
      fs.mkdirSync(work, { recursive: true });
      fs.rmSync(part, { force: true });
      await convert(c, path.join(dir, rel), part);
      fs.renameSync(part, path.join(dir, target));
      const t = stamp(path.join(dir, target))!;
      record[target] = {
        source: rel,
        sourceSize: src.size,
        sourceMtime: src.mtime,
        size: t.size,
        mtime: t.mtime,
      };
      made++;
      changed = true;
      failed.delete(rel);
      save();
      log(`converted ${rel} → ${target}`);
    } catch (e) {
      fs.rmSync(part, { force: true });
      failed.set(rel, key);
      log(`not converted ${rel}: ${(e as Error).message}`);
    }
  }
  // a source taken away: its .docx goes too, if this made it and it's as made
  for (const [target, was] of Object.entries(record)) {
    if (live.has(target)) continue;
    const now = stamp(path.join(dir, target));
    if (now && now.size === was.size && now.mtime === was.mtime)
      fs.rmSync(path.join(dir, target), { force: true });
    delete record[target];
    changed = true;
  }
  fs.rmSync(path.join(dir, '.converting'), { recursive: true, force: true });
  if (changed) save();
  return made;
}
