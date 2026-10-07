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
  | 'previewNext'
  | 'previewPrev'
  | 'playlistNext'
  | 'playlistPrev'
  | 'chorus'
  | 'project'
  | 'blank'
  | 'black'
  | 'cover'
  | 'countdown'
  | 'clear'
  | 'restore'
  | 'searchCurrent'
  | 'searchAll'
  | 'searchFocus'
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
  /** the default on macOS instead of `default` (where macOS itself takes those keys) */
  macInstead?: string;
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
  // 1.1.0, the operator's ask: with «Наживо» on, walk the preview ahead while the screen stays.
  // Ctrl+arrows (they only scrolled the list before — Alt+↑/↓ does that now, Control.tsx); on a
  // Mac ⌥, since macOS takes ⌃+arrows for its desktops and Mission Control
  {
    id: 'previewNext',
    label: N_('Прев’ю: далі'),
    hint: N_('Наступний вірш лише в прев’ю — екран стоїть до «На екран»'),
    default: 'ctrl+right,ctrl+down',
    macInstead: 'alt+right,alt+down',
  },
  {
    id: 'previewPrev',
    label: N_('Прев’ю: назад'),
    hint: N_('Попередній вірш лише в прев’ю — екран стоїть до «На екран»'),
    default: 'ctrl+left,ctrl+up',
    macInstead: 'alt+left,alt+up',
  },
  // 1.8.12-beta.6 (F1005-06): the running order item by item from the keyboard — with Shift, the
  // keys a clicker sends stay «Далі»; «Стрілки» can give them ← → (withArrowScheme)
  {
    id: 'playlistNext',
    label: N_('Наступний елемент показу'),
    hint: N_('Наступний елемент послідовності показу — на екран'),
    default: 'shift+pagedown',
  },
  {
    id: 'playlistPrev',
    label: N_('Попередній елемент показу'),
    hint: N_('Попередній елемент послідовності показу — на екран'),
    default: 'shift+pageup',
  },
  // 1.3.0: songs repeat their chorus after every verse, and some have a different one —
  // this finds the next chorus of the open song (shared/src/songs/sections.ts)
  {
    id: 'chorus',
    label: N_('До приспіву'),
    hint: N_('У відкритій пісні: найближчий приспів — одразу на екран'),
    default: 'c',
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
  // 1.4.0: the operator's logo and a line of text between items (Налаштування вигляду →
  // Заставка); again — exactly what it covered, like the two toggles above
  {
    id: 'cover',
    label: N_('Заставка'),
    hint: N_('Логотип і текст між елементами; ще раз — те, що було'),
    default: 'l',
  },
  // 1.8.1 (the user's ask: a timer with its own key): the countdown on screen stops and goes
  // on; with none, a new one of the length last chosen in «Відлік»
  {
    id: 'countdown',
    label: N_('Відлік: пауза / далі'),
    hint: N_('Відлік на екрані — пауза або далі; без нього — новий, на час, вибраний у «Відлік»'),
    default: 't',
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
    // 1.8.12-beta.4 (F1005-07): LibreWolf / Firefox keep Ctrl+F for their own find bar
    id: 'searchFocus',
    label: N_('До поля пошуку'),
    hint: N_('Курсор у полі пошуку вгорі — клавіша, якої браузер не забирає'),
    default: 'slash',
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
  mac && a.macInstead ? a.macInstead : mac && a.mac ? `${a.default},${a.mac}` : a.default;

/** The default keymap for a platform (the Mac one adds the ⌘ chords). */
export function defaultKeymap(mac: boolean = IS_MAC): Keymap {
  return Object.fromEntries(HOTKEY_ACTIONS.map((a) => [a.id, defaultFor(a, mac)])) as Keymap;
}

export const DEFAULT_KEYMAP: Keymap = defaultKeymap();

/**
 * What the arrows do (1.8.12-beta.6, F1005-06 — the author's call: as before by default, a choice in
 * «Клавіші»): «same» — all four step on («Далі / Назад»); «screenPreview» — ← → step the screen, ↑ ↓ only
 * the preview; «versesItems» — ↑ ↓ step the verses, ← → the running order's items. A scheme only writes
 * the bindings of these actions, each stays editable; `arrowScheme` reads which one they match.
 */
export type ArrowScheme = 'same' | 'screenPreview' | 'versesItems';
export const ARROW_SCHEMES: { id: ArrowScheme; label: string; hint: string }[] = [
  { id: 'same', label: N_('Усі — далі / назад'), hint: N_('Усі чотири стрілки крокують показом') },
  {
    id: 'screenPreview',
    label: N_('← → екран, ↑ ↓ прев’ю'),
    hint: N_('↑ ↓ ведуть лише прев’ю, екран чекає «На екран»'),
  },
  {
    id: 'versesItems',
    label: N_('↑ ↓ вірші, ← → елементи'),
    hint: N_('← → — попередній / наступний елемент послідовності показу'),
  },
];
const ARROW_ACTIONS = [
  'advanceNext',
  'advancePrev',
  'previewNext',
  'previewPrev',
  'playlistNext',
  'playlistPrev',
] as const;

function schemeKeys(scheme: ArrowScheme, mac: boolean): Partial<Keymap> {
  const d = defaultKeymap(mac);
  const base = Object.fromEntries(ARROW_ACTIONS.map((id) => [id, d[id]])) as Partial<Keymap>;
  if (scheme === 'screenPreview')
    return {
      ...base,
      advanceNext: 'right,pagedown',
      advancePrev: 'left,pageup',
      previewNext: `down,${d.previewNext}`,
      previewPrev: `up,${d.previewPrev}`,
    };
  if (scheme === 'versesItems')
    return {
      ...base,
      advanceNext: 'down,pagedown',
      advancePrev: 'up,pageup',
      playlistNext: `right,${d.playlistNext}`,
      playlistPrev: `left,${d.playlistPrev}`,
    };
  return base;
}

/** The keymap with the arrows of a scheme (the other actions untouched). */
export function withArrowScheme(keymap: Keymap, scheme: ArrowScheme, mac = IS_MAC): Keymap {
  return { ...keymap, ...schemeKeys(scheme, mac) };
}

/** The scheme the arrows' bindings match, or null — the operator's own. */
export function arrowScheme(keymap: Keymap, mac = IS_MAC): ArrowScheme | null {
  return (
    ARROW_SCHEMES.map((s) => s.id).find((id) => {
      const keys = schemeKeys(id, mac);
      return ARROW_ACTIONS.every((a) => keymap[a] === keys[a]);
    }) ?? null
  );
}

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

/** The parts of a keydown a chord is made of (a KeyboardEvent is one; tests pass plain objects). */
export type KeyChord = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'
>;

/**
 * Build a combo string from a keydown event, or null for a lone modifier press.
 * The base token is derived from `e.code` the way react-hotkeys-hook does — so it
 * matches at press time regardless of layout/shift (e.g. main '+' → 'equal', numpad
 * '+' → 'add', Shift+3 → 'shift+3'), not the unmatchable shifted glyph from e.key.
 * Falls back to e.key when there is no code. Modifiers (ctrl, alt, shift, meta) are
 * order-independent flags in rhh; we emit a stable order for display.
 */
export function comboFromEvent(e: KeyChord): string | null {
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
export function matchesCombo(e: KeyChord, combo: string): boolean {
  const chord = comboFromEvent(e);
  return !!chord && combo.split(',').includes(chord);
}

/**
 * Which way a key steps what owns the arrows — a song's stanzas, an album (1.8.12-beta.6): the
 * «Далі / Назад» keys, and the plain arrows and PageUp / PageDown — unless the running order has
 * the key (`playlistNext` / `playlistPrev`, «↑ ↓ вірші, ← → елементи»): that one passes on.
 */
export function stepDirection(e: KeyChord, keymap: Keymap): 1 | -1 | 0 {
  if (matchesCombo(e, keymap.playlistNext) || matchesCombo(e, keymap.playlistPrev)) return 0;
  if (matchesCombo(e, keymap.advanceNext)) return 1;
  if (matchesCombo(e, keymap.advancePrev)) return -1;
  if (e.ctrlKey || e.altKey || e.metaKey) return 0;
  if (['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)) return 1;
  if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) return -1;
  return 0;
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
