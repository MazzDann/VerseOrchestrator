import { matchesCombo, type KeyChord } from '../hotkeys';

/**
 * A place in the open book typed as numbers (1.4.0): «16» — a verse of the open chapter,
 * «3:16» — chapter 3, verse 16, «3:16-18» — a few verses, «3:» — chapter 3 from its start.
 * A dot, a comma or a space may stand for the colon («3.16», «3 16»). Typed straight into the
 * control window or into «Перейти до посилання»; the book is the one that is open.
 */
export interface QuickRef {
  /** absent: the open chapter */
  chapter?: number;
  /** absent: the chapter's first verse */
  verse?: number;
  verseEnd?: number;
}

const FULL = /^(\d{1,3})(?:\s*[:.,\s]\s*(\d{1,3}))?(?:\s*-\s*(\d{1,3}))?$/;
const CHAPTER_ONLY = /^(\d{1,3})\s*[:.,]$/;

export function parseQuickRef(input: string): QuickRef | null {
  const q = input.trim();
  const only = q.match(CHAPTER_ONLY);
  if (only) return { chapter: Number(only[1]) };
  const m = q.match(FULL);
  if (!m) return null;
  const [a, b, end] = [m[1], m[2], m[3]].map((x) => (x === undefined ? undefined : Number(x)));
  const r: QuickRef = b === undefined ? { verse: a } : { chapter: a, verse: b };
  if (end !== undefined) {
    if (end < (r.verse ?? 0)) return null;
    if (end !== r.verse) r.verseEnd = end;
  }
  return r;
}

/** A keydown as the typed-number box sees it (a KeyboardEvent is one). */
export interface QuickKeyEvent extends KeyChord {
  /** an input method is composing (Safari and older engines say so with keyCode 229) */
  isComposing?: boolean;
  keyCode?: number;
}

export interface QuickKeyContext {
  /** a book is open: a digit may open the box */
  canStart: boolean;
  /** a text field or the palette has the keyboard: the box takes nothing there */
  blocked: boolean;
  /** the current «На екран» combo (keymap.project) */
  project: string;
}

/** What one keydown does to the box. */
export type QuickKeyAction =
  /** not the box's key: the box stays as it is, the key goes on */
  | { kind: 'pass' }
  /** the box now reads `text` (the first digit opens it); the key stops here */
  | { kind: 'type'; text: string }
  /** the box goes; `take`: the key stops here (Esc), else it goes on to its own hotkey */
  | { kind: 'close'; take: boolean }
  /** go to `text` (the key stops here); `show`: and put the place on screen */
  | { kind: 'go'; text: string; show: boolean };

/**
 * Keys that only change the next key, or are no key yet (Mac check of 1.4.0): a real keyboard
 * sends a lone Shift keydown before «:», and it closed the box — «3:16» went to verse 16.
 */
const NOT_A_KEY = new Set([
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'OS',
  'Super',
  'Hyper',
  'Fn',
  'FnLock',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Symbol',
  'SymbolLock',
  'Dead',
  'Process',
  'Unidentified',
]);
const SEPARATORS = [':', '.', ',', ' ', '-'];
/**
 * Separators by the physical key, whatever the layout types there (Mac check of 1.4.0): on the
 * Ukrainian layouts the «.» and «,» keys type «ю» and «б» — and the «.» key is «Чорний екран».
 */
const SEPARATOR_CODES: Record<string, string> = {
  Period: '.',
  Comma: ',',
  NumpadDecimal: '.',
  NumpadComma: ',',
  Semicolon: ':',
};
const MAX_TYPED = 12;

const PASS: QuickKeyAction = { kind: 'pass' };

/**
 * One keydown in the control window against the box of typed numbers (`box`: what it reads,
 * null while closed). Digits open it; digits and separators add to it; Backspace takes one
 * back; Enter goes; «На екран» (⌘↩ / Ctrl+Enter, or its hotkey) goes and shows; Esc cancels;
 * any other key closes it and does its own job.
 */
export function quickKey(
  box: string | null,
  e: QuickKeyEvent,
  ctx: QuickKeyContext,
): QuickKeyAction {
  if (NOT_A_KEY.has(e.key) || e.isComposing || e.keyCode === 229) return PASS;
  if (ctx.blocked) return box === null ? PASS : { kind: 'close', take: false };
  const chord = e.ctrlKey || e.altKey || e.metaKey;
  const digit = !chord && /^[0-9]$/.test(e.key);
  if (box === null) return digit && ctx.canStart ? { kind: 'type', text: e.key } : PASS;
  const sep = chord ? undefined : SEPARATORS.includes(e.key) ? e.key : SEPARATOR_CODES[e.code];
  if (digit || sep)
    return { kind: 'type', text: (box + (digit ? e.key : sep)).slice(0, MAX_TYPED) };
  const project = matchesCombo(e, ctx.project);
  if (project || e.key === 'Enter') {
    return { kind: 'go', text: box, show: project || e.ctrlKey || e.metaKey };
  }
  if (chord) return { kind: 'close', take: false };
  if (e.key === 'Backspace') {
    return box.length > 1
      ? { kind: 'type', text: box.slice(0, -1) }
      : { kind: 'close', take: true };
  }
  if (e.key === 'Escape') return { kind: 'close', take: true };
  return { kind: 'close', take: false };
}

/** A keydown the control window hands to the box (a KeyboardEvent is one). */
export interface QuickKeydown extends QuickKeyEvent {
  preventDefault(): void;
  stopPropagation(): void;
}

/**
 * The control window's keydown handler for the box (window, capture phase): takes the key when
 * the box keeps it — so a separator never reaches «Чорний екран» and ⌘↩ never «На екран» with
 * the old selection — and says what the box reads next and where to go.
 */
export function quickKeydown(
  box: string | null,
  e: QuickKeydown,
  ctx: QuickKeyContext,
): { box: string | null; go: { text: string; show: boolean } | null } {
  const a = quickKey(box, e, ctx);
  if (a.kind === 'pass') return { box, go: null };
  if (a.kind !== 'close' || a.take) {
    e.preventDefault();
    e.stopPropagation();
  }
  return {
    box: a.kind === 'type' ? a.text : null,
    go: a.kind === 'go' ? { text: a.text, show: a.show } : null,
  };
}

/** A book, a chapter and the verses selected in it, as one comparable string. */
export function placeKey(
  book: number | null | undefined,
  chapter: number | null | undefined,
  verses: readonly number[],
): string {
  return JSON.stringify([book ?? null, chapter ?? null, verses]);
}

/** The control window now, as a place waiting to be shown sees it. */
export interface ShowView {
  /** placeKey of the open book, chapter and the selection */
  place: string;
  /** a translation's verses are still loading */
  loading: boolean;
  /** the slide has lines to show */
  ready: boolean;
  page: number;
  /** the reveal step while reveal is on, else null */
  revealStep: number | null;
}

/**
 * The next step for a place gone to with «На екран» in the box (`pending`: its placeKey): wait
 * until it is the selection and every translation's verses are in, bring it back to its first
 * page and reveal step, then show it.
 */
export function showStep(
  pending: string,
  v: ShowView,
): 'wait' | 'firstPage' | 'firstStep' | 'show' {
  if (v.place !== pending || v.loading || !v.ready) return 'wait';
  if (v.page !== 0) return 'firstPage';
  if (v.revealStep !== null && v.revealStep !== 1) return 'firstStep';
  return 'show';
}
