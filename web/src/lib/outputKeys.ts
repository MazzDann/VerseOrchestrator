import type { PresenterCommand } from '../presenterBus';

/** What a key pressed in an output window does: its own fullscreen, or a show command. */
export type OutputKeyAction = PresenterCommand | 'fullscreen';

export type OutputKey = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat'
>;

/** By the physical key, as the control window's hotkeys match (react-hotkeys-hook: `code`). */
const BY_CODE = new Map<string, OutputKeyAction>([
  ['KeyF', 'fullscreen'],
  ['ArrowRight', 'next'],
  ['ArrowDown', 'next'],
  ['PageDown', 'next'],
  ['ArrowLeft', 'prev'],
  ['ArrowUp', 'prev'],
  ['PageUp', 'prev'],
  ['Period', 'black'],
  ['NumpadDecimal', 'black'],
  ['KeyB', 'blank'],
  ['KeyL', 'cover'],
]);

/** …and by the character, only when a browser leaves `code` empty. */
const BY_KEY = new Map<string, OutputKeyAction>([
  ['f', 'fullscreen'],
  ['ArrowRight', 'next'],
  ['ArrowDown', 'next'],
  ['PageDown', 'next'],
  ['ArrowLeft', 'prev'],
  ['ArrowUp', 'prev'],
  ['PageUp', 'prev'],
  ['.', 'black'],
  ['b', 'blank'],
  ['l', 'cover'],
]);

/** A key held down steps on (arrows, a clicker's PageDown); a toggle must not flicker. */
const STEPS = new Set<OutputKeyAction>(['next', 'prev']);

/**
 * The keys of the presentation window (1.4.1; the stage display takes only F): F — its own
 * fullscreen; arrows and PageUp / PageDown — «Далі» / «Назад»; «.», B and L — «Чорний екран»,
 * «Сховати текст» and «Заставка» in the control window. Matched by the physical key, like the
 * control window's hotkeys: with the Ukrainian layout on, F types «а», L types «д» and the
 * period key types «ю», so the characters (1.4.0 and before) left F and «.» dead there, and L
 * and B were never passed on. Chords (⌘L, Ctrl+F…) stay the browser's.
 */
export function outputKeyAction(e: OutputKey): OutputKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const action = e.code
    ? BY_CODE.get(e.code)
    : BY_KEY.get(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (!action || (e.repeat && !STEPS.has(action))) return null;
  return action;
}
