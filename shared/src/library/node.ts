import fs from 'node:fs';
import path from 'node:path';
import {
  detectTextFormat,
  parseTextModule,
  parseUsfmFiles,
  TEXT_MODULE_EXT,
  TEXT_MODULE_HEAD,
  TEXT_MODULE_MAX,
  type ParsedModule,
} from './textFormats.js';

/**
 * Text modules on disk (Node only, `@vo/shared/modules-node`): which files of modules/ are modules
 * in a text format (textFormats.ts), told by their content, and reading one. A folder of USFM
 * books in modules/ is one module, named as the folder.
 */
const USFM = /\.(usfm|sfm)$/i;

/** What was told of a file, by its size and time: modules/ is listed often, a .zip is read whole. */
const told = new Map<string, boolean>();
const TOLD_MAX = 2000;

function usfmBooks(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => USFM.test(f) && !f.startsWith('.'))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/** The file's first 64 KB — a .zip's all (its list of files is at its end). */
function headOf(file: string, size: number): Uint8Array {
  if (/\.zip$/i.test(file)) return fs.readFileSync(file);
  const head = Buffer.alloc(Math.min(size, TEXT_MODULE_HEAD));
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, head, 0, head.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  return head;
}

/** Is the file (or the folder) a module in a text format? */
export function isTextModule(file: string): boolean {
  const name = path.basename(file);
  if (name.startsWith('.')) return false;
  try {
    const st = fs.statSync(file);
    if (st.isDirectory()) return usfmBooks(file).length > 0;
    if (!TEXT_MODULE_EXT.test(name) || st.size > TEXT_MODULE_MAX) return false;
    const key = `${file}|${st.size}|${st.mtimeMs}`;
    let is = told.get(key);
    if (is === undefined) {
      is = detectTextFormat(name, headOf(file, st.size)) !== null;
      if (told.size >= TOLD_MAX) told.clear();
      told.set(key, is);
    }
    return is;
  } catch {
    return false;
  }
}

/** The text modules right in the modules folder (its documents/ is not one). */
export function listTextModules(dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((f) => f !== 'documents' && isTextModule(path.join(dir, f))).sort();
}

/** A text module on disk, read; a ModuleError when nothing can be. */
export function readTextModule(file: string): ParsedModule {
  if (fs.statSync(file).isDirectory())
    return parseUsfmFiles(usfmBooks(file).map((f) => fs.readFileSync(f)));
  return parseTextModule(path.basename(file), fs.readFileSync(file));
}
