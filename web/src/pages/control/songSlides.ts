import { secondParts, unmark } from '@vo/shared';
import { type SlideLine, type TextSpan } from '../../presenterBus';

/**
 * A song line with its second part (1.3.0): `marked` is the line's text with the second part
 * marked (shared/src/songs/pptx.ts); it keeps `color` — the file's — or, without one, goes
 * dimmer. The pieces are the text itself, so they join without spaces.
 */
export function withSecond(line: SlideLine, marked: string, color?: string): SlideLine {
  if (unmark(marked) !== line.text) return line;
  const segments: TextSpan[] = secondParts(marked).map((p) =>
    p.second ? { text: p.text, ...(color ? { color } : { soft: true }) } : { text: p.text },
  );
  return { ...line, segments, exact: true };
}
