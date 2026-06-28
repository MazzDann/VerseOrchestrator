/**
 * User-rebindable keyboard shortcuts: the action registry, default keymap, and
 * helpers to capture a combo from a KeyboardEvent and format one for display.
 *
 * Combo strings use the react-hotkeys-hook grammar: `+` joins modifiers
 * (`ctrl+f`), `,` separates alternatives (`right,down,pagedown`).
 */

export type HotkeyActionId =
  | 'advanceNext'
  | 'advancePrev'
  | 'project'
  | 'blank'
  | 'black'
  | 'clear'
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
}

/** The operator actions that can be rebound, in display order. */
export const HOTKEY_ACTIONS: HotkeyActionDef[] = [
  {
    id: 'advanceNext',
    label: 'Далі',
    hint: 'Наступний вірш або сторінка',
    default: 'right,down,pagedown',
  },
  {
    id: 'advancePrev',
    label: 'Назад',
    hint: 'Попередній вірш або сторінка',
    default: 'left,up,pageup',
  },
  {
    id: 'project',
    label: 'На екран',
    hint: 'Показати поточний вибір',
    enableOnFormTags: true,
    default: 'f5,f2',
  },
  { id: 'blank', label: 'Затемнити', hint: 'Сховати текст, фон лишається', default: 'b' },
  { id: 'black', label: 'Чорний екран', hint: 'Повністю чорний, ігнорує фон', default: 'period' },
  { id: 'clear', label: 'Очистити', hint: 'Прибрати слайд з екрана', default: 'escape' },
  {
    id: 'searchCurrent',
    label: 'Пошук (поточний)',
    hint: 'Пошук у поточному модулі',
    enableOnFormTags: true,
    default: 'f3,ctrl+f',
  },
  {
    id: 'searchAll',
    label: 'Пошук (усі)',
    hint: 'Пошук в усіх модулях',
    enableOnFormTags: true,
    default: 'f4',
  },
  {
    id: 'palette',
    label: 'Палітра команд',
    hint: 'Швидкий пошук дій, книг і пісень',
    enableOnFormTags: true,
    default: 'ctrl+k,ctrl+p',
  },
];

export type Keymap = Record<HotkeyActionId, string>;

export const DEFAULT_KEYMAP: Keymap = Object.fromEntries(
  HOTKEY_ACTIONS.map((a) => [a.id, a.default]),
) as Keymap;

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

/** Pretty single-alternative combo: 'ctrl+f' → 'Ctrl + F'. */
export function formatChord(chord: string): string {
  return chord
    .split('+')
    .map((p) => DISPLAY[p] ?? (p.length === 1 ? p.toUpperCase() : cap(p)))
    .join(' + ');
}

/** Pretty full combo (with alternatives): 'right,down' → '→  /  ↓'. */
export function formatCombo(combo: string): string {
  return combo.split(',').filter(Boolean).map(formatChord).join('  /  ');
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

/** Coerce a persisted/foreign keymap into a valid one: every action gets a string chord or its default. */
export function sanitizeKeymap(raw: unknown): Keymap {
  const r = (raw ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    HOTKEY_ACTIONS.map((a) => [
      a.id,
      typeof r[a.id] === 'string' && r[a.id] ? (r[a.id] as string) : DEFAULT_KEYMAP[a.id],
    ]),
  ) as Keymap;
}
