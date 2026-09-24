import { type Slide } from '../presenterBus';

/** True when two slides show the same content (used to merge preview into the live monitor). */
export function sameContent(a: Slide, b: Slide): boolean {
  if ((a.reference ?? '') !== (b.reference ?? '') || a.lines.length !== b.lines.length)
    return false;
  if ((a.subline ?? '') !== (b.subline ?? '')) return false;
  return a.lines.every((l, i) => l.text === b.lines[i].text);
}
