import { describe, expect, it } from 'vitest';
import {
  parseQuickRef,
  placeKey,
  quickKey,
  quickKeydown,
  showStep,
  type QuickKeyContext,
  type QuickKeyEvent,
  type ShowView,
} from './quickRef';

describe('numbers for a place in the open book (1.4.0)', () => {
  it('a verse of the open chapter, or chapter:verse', () => {
    expect(parseQuickRef('16')).toEqual({ verse: 16 });
    expect(parseQuickRef('3:16')).toEqual({ chapter: 3, verse: 16 });
    expect(parseQuickRef(' 3 : 16 ')).toEqual({ chapter: 3, verse: 16 });
  });

  it('a dot, a comma or a space for the colon', () => {
    expect(parseQuickRef('3.16')).toEqual({ chapter: 3, verse: 16 });
    expect(parseQuickRef('3,16')).toEqual({ chapter: 3, verse: 16 });
    expect(parseQuickRef('3 16')).toEqual({ chapter: 3, verse: 16 });
  });

  it('a few verses, and a chapter from its start', () => {
    expect(parseQuickRef('3:16-18')).toEqual({ chapter: 3, verse: 16, verseEnd: 18 });
    expect(parseQuickRef('16-18')).toEqual({ verse: 16, verseEnd: 18 });
    expect(parseQuickRef('16-16')).toEqual({ verse: 16 });
    expect(parseQuickRef('3:')).toEqual({ chapter: 3 });
    expect(parseQuickRef('3.')).toEqual({ chapter: 3 });
  });

  it('not a place: words, a backwards range, too many parts', () => {
    expect(parseQuickRef('Ів 3:16')).toBeNull();
    expect(parseQuickRef('3:18-16')).toBeNull();
    expect(parseQuickRef('3:16:2')).toBeNull();
    expect(parseQuickRef('')).toBeNull();
    expect(parseQuickRef('1234')).toBeNull();
  });
});

// --- The keys of the typed-number box (Mac check of 1.4.0) ------------------------------

type Ev = QuickKeyEvent & { label: string };
const ev = (key: string, code: string, mods: Partial<QuickKeyEvent> = {}): Ev => ({
  key,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
  label: key,
});
const d = (n: string) => ev(n, `Digit${n}`);
const shift = ev('Shift', 'ShiftLeft', { shiftKey: true });
const enter = ev('Enter', 'Enter');
/** what each layout sends for a separator — a real keyboard sends the Shift keydown first */
const abc = {
  colon: [shift, ev(':', 'Semicolon', { shiftKey: true })],
  dot: [ev('.', 'Period')],
};
const ukrainianPc = {
  colon: [shift, ev(':', 'Digit6', { shiftKey: true })],
  dot: [ev('.', 'Slash')],
  dotKey: [ev('ю', 'Period')],
  commaKey: [ev('б', 'Comma')],
  colonKey: [shift, ev('Ж', 'Semicolon', { shiftKey: true })],
};
const appleUkrainian = {
  colon: [shift, ev(':', 'Digit5', { shiftKey: true })],
  dot: [shift, ev('.', 'Digit7', { shiftKey: true })],
  comma: [shift, ev(',', 'Digit6', { shiftKey: true })],
};

const MAC = { canStart: true, blocked: false, project: 'f5,f2,meta+enter' };
const WIN = { canStart: true, blocked: false, project: 'f5,f2' };

/**
 * The control window's keydown handler (quickKeydown, as Control.tsx calls it) over a key
 * sequence: the box, where it went, and the keys it took from the hotkeys (preventDefault and
 * stopPropagation both called) or let through (neither).
 */
function type(events: Ev[], ctx: QuickKeyContext = MAC) {
  let box: string | null = null;
  const taken: string[] = [];
  const passed: string[] = [];
  let go: { text: string; show: boolean } | null = null;
  const boxes: (string | null)[] = [];
  for (const e of events) {
    let prevented = false;
    let stopped = false;
    const r = quickKeydown(
      box,
      {
        ...e,
        preventDefault: () => (prevented = true),
        stopPropagation: () => (stopped = true),
      },
      ctx,
    );
    expect(prevented).toBe(stopped);
    (prevented ? taken : passed).push(e.label);
    box = r.box;
    if (r.go) go = r.go;
    boxes.push(box);
  }
  return { box, taken, passed, go, boxes };
}

describe('the keys of the typed-number box', () => {
  it('a lone Shift before «:» keeps the box: «3:16» goes to chapter 3 (was verse 16)', () => {
    for (const layout of [abc, ukrainianPc, appleUkrainian]) {
      const r = type([d('3'), ...layout.colon, d('1'), d('6'), enter]);
      expect(r.go).toEqual({ text: '3:16', show: false });
      expect(parseQuickRef(r.go!.text)).toEqual({ chapter: 3, verse: 16 });
      expect(r.passed).toEqual(['Shift']);
    }
    expect(type([d('3'), ...abc.colon, d('1'), d('6'), ev('-', 'Minus'), d('1'), d('8')]).box).toBe(
      '3:16-18',
    );
    expect(type([d('3'), ...abc.colon, enter]).go).toEqual({ text: '3:', show: false });
  });

  it('other keys that only change the next one keep the box too', () => {
    for (const key of ['Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'CapsLock', 'Fn', 'Dead']) {
      expect(quickKey('3', ev(key, key), MAC)).toEqual({ kind: 'pass' });
    }
    // an input method still composing
    expect(quickKey('3', ev('3', 'Digit3', { isComposing: true }), MAC)).toEqual({ kind: 'pass' });
    expect(quickKey('3', ev('Process', 'Digit3', { keyCode: 229 }), MAC)).toEqual({
      kind: 'pass',
    });
  });

  it('the «.» and «,» keys separate on the Ukrainian layouts, never reaching «Чорний екран»', () => {
    const dot = type([d('3'), ...ukrainianPc.dotKey, d('1'), d('6'), enter]);
    expect(dot.go).toEqual({ text: '3.16', show: false });
    expect(dot.taken).toContain('ю');
    const comma = type([d('3'), ...ukrainianPc.commaKey, d('1'), d('6')]);
    expect(comma.box).toBe('3,16');
    expect(comma.taken).toContain('б');
    // the ABC colon's key, the layout's own «.», and Apple's Ukrainian shifted digits
    expect(type([d('3'), ...ukrainianPc.colonKey, d('1'), d('6')]).box).toBe('3:16');
    expect(type([d('3'), ...ukrainianPc.dot, d('1'), d('6')]).box).toBe('3.16');
    expect(type([d('3'), ...appleUkrainian.dot, d('1'), d('6')]).box).toBe('3.16');
    expect(type([d('3'), ...appleUkrainian.comma, d('1'), d('6')]).box).toBe('3,16');
    // the numeric keypad's decimal key, whatever the locale puts there
    expect(type([d('3'), ev(',', 'NumpadDecimal'), d('1'), d('6')]).box).toBe('3,16');
    expect(type([d('3'), ev('Delete', 'NumpadDecimal'), d('1')]).box).toBe('3.1');
    // the ABC «.» and the space as before
    expect(type([d('3'), ...abc.dot, d('1'), d('6')]).box).toBe('3.16');
    expect(type([d('3'), ev(' ', 'Space'), d('1'), d('6')]).box).toBe('3 16');
  });

  it('with the box closed, the «.» key is still «Чорний екран»', () => {
    expect(quickKey(null, ev('ю', 'Period'), MAC)).toEqual({ kind: 'pass' });
    expect(quickKey(null, ev('.', 'Period'), MAC)).toEqual({ kind: 'pass' });
  });

  it('⌘↩ / Ctrl+Enter / «На екран» go to the typed place and show it — never the old selection', () => {
    const meta = ev('Meta', 'MetaLeft', { metaKey: true });
    const cmdEnter = ev('Enter', 'Enter', { metaKey: true });
    const mac = type([d('3'), ...abc.dot, d('1'), d('6'), meta, cmdEnter], MAC);
    expect(mac.go).toEqual({ text: '3.16', show: true });
    expect(mac.taken).toContain('Enter');
    expect(mac.boxes).toEqual(['3', '3.', '3.1', '3.16', '3.16', null]);
    // Fn+F5 on a Mac, F5 / F2 anywhere
    expect(type([d('1'), d('6'), ev('Fn', 'Fn'), ev('F5', 'F5')], MAC).go).toEqual({
      text: '16',
      show: true,
    });
    expect(type([d('1'), d('6'), ev('F2', 'F2')], WIN).go).toEqual({ text: '16', show: true });
    // Ctrl+Enter on Windows: not «На екран» there, but the box's «go and show» all the same
    const ctrl = ev('Control', 'ControlLeft', { ctrlKey: true });
    const ctrlEnter = ev('Enter', 'Enter', { ctrlKey: true });
    const win = type([d('1'), d('6'), ctrl, ctrlEnter], WIN);
    expect(win.go).toEqual({ text: '16', show: true });
    expect(win.passed).toEqual(['Control']);
    // «На екран» rebound
    expect(
      type([d('7'), ev('p', 'KeyP', { altKey: true })], { ...WIN, project: 'alt+p' }).go,
    ).toEqual({ text: '7', show: true });
    // Enter and Shift+Enter only go
    expect(type([d('7'), ev('Enter', 'NumpadEnter', { shiftKey: true })]).go).toEqual({
      text: '7',
      show: false,
    });
  });

  it('Backspace takes a character back; Esc cancels; both stay with the box', () => {
    const bs = ev('Backspace', 'Backspace');
    const r = type([d('3'), ...abc.dot, bs, bs, bs]);
    expect(r.boxes).toEqual(['3', '3.', '3', null, null]);
    expect(r.taken).toEqual(['3', '.', 'Backspace', 'Backspace']);
    expect(r.passed).toEqual(['Backspace']); // the box was already closed
    const esc = type([d('3'), ev('Escape', 'Escape')]);
    expect(esc.box).toBeNull();
    expect(esc.taken).toEqual(['3', 'Escape']);
  });

  it('any other key or chord closes the box and does its own job', () => {
    expect(quickKey('3', ev('ArrowDown', 'ArrowDown'), MAC)).toEqual({
      kind: 'close',
      take: false,
    });
    expect(quickKey('3', ev('b', 'KeyB'), MAC)).toEqual({ kind: 'close', take: false });
    expect(quickKey('3', ev('k', 'KeyK', { metaKey: true }), MAC)).toEqual({
      kind: 'close',
      take: false,
    });
    // a digit with ⌘ / Ctrl is a chord, not a number
    expect(quickKey('3', ev('1', 'Digit1', { ctrlKey: true }), WIN)).toEqual({
      kind: 'close',
      take: false,
    });
    expect(quickKey(null, ev('1', 'Digit1', { metaKey: true }), MAC)).toEqual({ kind: 'pass' });
  });

  it('opens only on a digit, with a book open, outside text fields and the palette', () => {
    expect(quickKey(null, d('3'), MAC)).toEqual({ kind: 'type', text: '3' });
    expect(quickKey(null, ev('3', 'Numpad3'), MAC)).toEqual({ kind: 'type', text: '3' });
    expect(quickKey(null, ev(':', 'Semicolon', { shiftKey: true }), MAC)).toEqual({
      kind: 'pass',
    });
    expect(quickKey(null, d('3'), { ...MAC, canStart: false })).toEqual({ kind: 'pass' });
    expect(quickKey(null, d('3'), { ...MAC, blocked: true })).toEqual({ kind: 'pass' });
    expect(quickKey('3', d('4'), { ...MAC, blocked: true })).toEqual({
      kind: 'close',
      take: false,
    });
  });

  it('holds at most 12 characters', () => {
    const r = type([...'1234567890123'].map((n) => d(n)));
    expect(r.box).toBe('123456789012');
  });
});

describe('a place gone to with «На екран» in the box is shown when it is ready', () => {
  const pending = placeKey(43, 3, [16]);
  const ready: ShowView = {
    place: pending,
    loading: false,
    ready: true,
    page: 0,
    revealStep: null,
  };

  it('waits until the place is the selection and every translation is in', () => {
    expect(showStep(pending, { ...ready, place: placeKey(43, 1, [5]) })).toBe('wait');
    expect(showStep(pending, { ...ready, place: placeKey(43, 3, [16, 17]) })).toBe('wait');
    expect(showStep(pending, { ...ready, loading: true })).toBe('wait');
    expect(showStep(pending, { ...ready, ready: false })).toBe('wait');
    expect(showStep(pending, ready)).toBe('show');
  });

  it('from its first page and reveal step, never the old ones', () => {
    expect(showStep(pending, { ...ready, page: 1, revealStep: 2 })).toBe('firstPage');
    expect(showStep(pending, { ...ready, revealStep: 2 })).toBe('firstStep');
    expect(showStep(pending, { ...ready, revealStep: 1 })).toBe('show');
    // reveal off: the step left from before doesn't matter
    expect(showStep(pending, { ...ready, revealStep: null })).toBe('show');
  });

  it('the place key: the same place, the same key; no book or chapter yet is a place too', () => {
    expect(placeKey(43, 3, [16, 17])).toBe(placeKey(43, 3, [16, 17]));
    expect(placeKey(43, 3, [16, 17])).not.toBe(placeKey(43, 3, [16]));
    expect(placeKey(null, undefined, [])).toBe(placeKey(undefined, null, []));
  });
});
