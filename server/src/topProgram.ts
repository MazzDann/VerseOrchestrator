/**
 * VerseOrchestrator.exe at the top of a Windows release (1.25.2, desktop/launcher/Start.cs) in a copy that came
 * to this version by an update (1.25.3): an update in parts brings app/ alone — the files beside it are
 * the old copy's own — so the program travels inside app/ (`app/top/`, desktop/scripts/pack.mjs) and the
 * server puts it beside app/ at its start.
 *
 * Only node: imports (like layout.ts).
 */
import fs from 'node:fs';
import path from 'node:path';

export const TOP_DIR = 'top';

const same = (a: string, b: string) => {
  try {
    const x = fs.readFileSync(a);
    const y = fs.readFileSync(b);
    return x.equals(y);
  } catch {
    return false;
  }
};

/** The files of app/top put beside app/ when they are missing or older there; their names. */
export function bringTopFiles(appRoot: string): string[] {
  const from = path.join(appRoot, TOP_DIR);
  const top = path.dirname(appRoot);
  let names: string[];
  try {
    names = fs
      .readdirSync(from, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch {
    return []; // another system's copy: nothing travels so
  }
  const out: string[] = [];
  for (const name of names) {
    const to = path.join(top, name);
    if (same(path.join(from, name), to)) continue;
    const part = `${to}.part`;
    try {
      // whole or not at all: it may be double-clicked this very moment
      fs.copyFileSync(path.join(from, name), part);
      fs.renameSync(part, to);
      out.push(name);
    } catch {
      fs.rmSync(part, { force: true }); // in use, or a folder that can't be written: the next start
    }
  }
  return out;
}
