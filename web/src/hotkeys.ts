import { N_ } from '@vo/shared';

/**
 * User-rebindable keyboard shortcuts: the action registry, default keymap, and
 * helpers to capture a combo from a KeyboardEvent and format one for display.
 *
 * Combo strings use the react-hotkeys-hook grammar: `+` joins modifiers
 * (`ctrl+f`), `,` separates alternatives (`right,down,pagedown`).
 *
 * macOS (0.5.12, Mac test): F-keys there need Fn, so the defaults add ⌘ chords — ⌘↩ on
 * screen, ⌘F / ⇧⌘F search, ⌘K palette — next to the F-keys, which stay. Combos are shown
 * the Mac way there (⇧⌘F).
 */

/** Running on a Mac (or an iPad with a keyboard)? */
export const IS_MAC =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      '',
  );

export type HotkeyActionId =
  | 'advanceNext'
  | 'advancePrev'
  | 'project'
  | 'blank'
  | 'black'
  | 'clear'
  | 'restore'
  | 'searchCurrent'
  | 'searchAll'
  | 'palette';

export interface HotkeyActionDef {
  id: HotkeyActionId;
  label: string;
  hint: string;
  /** Whether the action should still fire while a text field is focused (search). */
  enableOnFormTags?: boolean;
  default: string;
  /** extra default chords on macOS, next to `default` */
  mac?: string;
}

/** The operator actions that can be rebound, in display order. */
export const HOTKEY_ACTIONS: HotkeyActionDef[] = [
  {
    id: 'advanceNext',
    label: N_('Далі'),
    hint: N_('Наступний вірш або сторінка'),
    default: 'right,down,pagedown',
  },
  {
    id: 'advancePrev',
    label: N_('Назад'),
    hint: N_('Попередній вірш або сторінка'),
    default: 'left,up,pageup',
  },
  {
    id: 'project',
    label: N_('На екран'),
    hint: N_('Показати поточний вибір'),
    enableOnFormTags: true,
    default: 'f5,f2',
    mac: 'meta+enter',
  },
  {
    id: 'blank',
    label: N_('Сховати текст'),
    hint: N_('Текст згасає, фон лишається; ще раз — той самий слайд назад'),
    default: 'b',
  },
  {
    id: 'black',
    label: N_('Чорний екран'),
    hint: N_('Одразу все чорне, навіть фон; ще раз — усе назад'),
    default: 'period',
  },
  {
    id: 'clear',
    label: N_('Очистити'),
    hint: N_('Прибрати слайд з екрана'),
    default: 'escape',
  },
  {
    id: 'restore',
    label: N_('Повернути на екран'),
    hint: N_('Скасувати «Очистити»: прибраний слайд — знову на екрані'),
    default: 'ctrl+z',
    mac: 'meta+z',
  },
  {
    id: 'searchCurrent',
    label: N_('Пошук (поточний)'),
    hint: N_('Пошук у поточному модулі'),
    enableOnFormTags: true,
    default: 'f3,ctrl+f',
    mac: 'meta+f',
  },
  {
    id: 'searchAll',
    label: N_('Пошук (усі)'),
    hint: N_('Пошук в усіх модулях'),
    enableOnFormTags: true,
    default: 'f4',
    mac: 'meta+shift+f',
  },
  {
    id: 'palette',
    label: N_('Палітра команд'),
    hint: N_('Швидкий пошук дій, книг і пісень'),
    enableOnFormTags: true,
    default: 'ctrl+k,ctrl+p',
    mac: 'meta+k',
  },
];

export type Keymap = Record<HotkeyActionId, string>;

const defaultFor = (a: HotkeyActionDef, mac: boolean) =>
  mac && a.mac ? `${a.default},${a.mac}` : a.default;

/** The default keymap for a platform (the Mac one adds the ⌘ chords). */
export function defaultKeymap(mac: boolean = IS_MAC): Keymap {
  return Object.fromEntries(HOTKEY_ACTIONS.map((a) => [a.id, defaultFor(a, mac)])) as Keymap;
}

export const DEFAULT_KEYMAP: Keymap = defaultKeymap();

/**
 * Mirror of react-hotkeys-hook's internal `mapKey`: its special-key table plus the
 * same lowercase + strip, so a token we emit equals what rhh computes at match time
 * (rhh compares the hotkey token against mapKey(e.code) and e.key.toLowerCase()).
 */
const RHH_SPECIAL: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  '.': 'period',
  ',': 'comma',
  '-': 'slash',
  ' ': 'space',
  '`': 'backquote',
  '#': 'backslash',
  '+': 'bracketright',
};
function mapKey(raw: string | undefined): string {
  return ((raw && RHH_SPECIAL[raw]) || raw || '')
    .trim()
    .toLowerCase()
    .replace(/key|digit|numpad|arrow/, '');
}

/**
 * Build a combo string from a keydown event, or null for a lone modifier press.
 * The base token is derived from `e.code` the way react-hotkeys-hook does — so it
 * matches at press time regardless of layout/shift (e.g. main '+' → 'equal', numpad
 * '+' → 'add', Shift+3 → 'shift+3'), not the unmatchable shifted glyph from e.key.
 * Falls back to e.key when there is no code. Modifiers (ctrl, alt, shift, meta) are
 * order-independent flags in rhh; we emit a stable order for display.
 */
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');
  if (e.metaKey) mods.push('meta');
  const base = mapKey(e.code) || mapKey(e.key);
  if (!base) return null;
  return [...mods, base].join('+');
}

const DISPLAY: Record<string, string> = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  period: '.',
  comma: ',',
  space: 'Space',
  escape: 'Esc',
  enter: 'Enter',
  equal: '=',
  minus: '-',
  slash: '/',
  backslash: '\\',
  backquote: '`',
  bracketleft: '[',
  bracketright: ']',
  semicolon: ';',
  quote: "'",
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  decimal: '.',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** macOS symbols, modifiers in the Mac order ⌃⌥⇧⌘. */
const MAC_MODS = ['ctrl', 'alt', 'shift', 'meta'];
const MAC_DISPLAY: Record<string, string> = {
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
  meta: '⌘',
  enter: '↩',
  escape: '⎋',
};

/** Pretty single-alternative combo: 'ctrl+f' → 'Ctrl + F'; on a Mac 'meta+shift+f' → '⌘⇧F'. */
export function formatChord(chord: string, mac: boolean = IS_MAC): string {
  const parts = chord.split('+');
  const key = (p: string) => DISPLAY[p] ?? (p.length === 1 ? p.toUpperCase() : cap(p));
  if (!mac) return parts.map(key).join(' + ');
  const mods = MAC_MODS.filter((m) => parts.includes(m)).map((m) => MAC_DISPLAY[m]);
  const rest = parts.filter((p) => !MAC_MODS.includes(p)).map((p) => MAC_DISPLAY[p] ?? key(p));
  return [...mods, ...rest].join('');
}

/** Pretty full combo (with alternatives): 'right,down' → '→  /  ↓'. */
export function formatCombo(combo: string, mac: boolean = IS_MAC): string {
  return combo
    .split(',')
    .filter(Boolean)
    .map((c) => formatChord(c, mac))
    .join('  /  ');
}

/** Is this keydown one of the combo's chords? */
export function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  const chord = comboFromEvent(e);
  return !!chord && combo.split(',').includes(chord);
}

/** Action ids whose keymap entry shares an alternative chord with `chord` (excluding `self`). */
export function findConflicts(
  keymap: Keymap,
  chord: string,
  self: HotkeyActionId,
): HotkeyActionId[] {
  return (Object.keys(keymap) as HotkeyActionId[]).filter(
    (id) => id !== self && keymap[id].split(',').includes(chord),
  );
}

/** Other actions that share any chord with `self` given the live keymap (for the conflict banner). */
export function conflictsForAction(keymap: Keymap, self: HotkeyActionId): HotkeyActionId[] {
  const out = new Set<HotkeyActionId>();
  for (const chord of keymap[self].split(',').filter(Boolean)) {
    for (const id of findConflicts(keymap, chord, self)) out.add(id);
  }
  return [...out];
}

/**
 * Coerce a persisted/foreign keymap into a valid one: every action gets a string chord or
 * its default. An action still on the other platform's default gets this platform's: on a
 * Mac the ⌘ chords are added to a keymap saved elsewhere or before 0.5.12, and elsewhere
 * they are dropped from one saved on a Mac (settings travel with the app folder since
 * 0.7.4). Anything the user changed stays.
 */
export function sanitizeKeymap(raw: unknown, mac: boolean = IS_MAC): Keymap {
  const r = (raw ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    HOTKEY_ACTIONS.map((a) => {
      const v = r[a.id];
      if (typeof v !== 'string' || !v || v === defaultFor(a, !mac))
        return [a.id, defaultFor(a, mac)];
      return [a.id, v];
    }),
  ) as Keymap;
}
