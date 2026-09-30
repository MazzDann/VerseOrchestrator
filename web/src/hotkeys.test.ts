import { describe, it, expect } from 'vitest';
import {
  comboFromEvent,
  conflictsForAction,
  sanitizeKeymap,
  DEFAULT_KEYMAP,
  defaultKeymap,
  formatChord,
  matchesCombo,
} from './hotkeys';

/** Minimal KeyboardEvent stand-in carrying just the fields comboFromEvent reads. */
function evt(key: string, code: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  } as KeyboardEvent;
}

describe('comboFromEvent', () => {
  it('maps letters and digits from the code', () => {
    expect(comboFromEvent(evt('b', 'KeyB'))).toBe('b');
    expect(comboFromEvent(evt('3', 'Digit3'))).toBe('3');
  });

  it('maps arrows, page keys, F-keys, escape, space', () => {
    expect(comboFromEvent(evt('ArrowDown', 'ArrowDown'))).toBe('down');
    expect(comboFromEvent(evt('PageDown', 'PageDown'))).toBe('pagedown');
    expect(comboFromEvent(evt('F5', 'F5'))).toBe('f5');
    expect(comboFromEvent(evt('Escape', 'Escape'))).toBe('escape');
    expect(comboFromEvent(evt(' ', 'Space'))).toBe('space');
  });

  it('includes modifiers in ctrl/alt/shift/meta order', () => {
    expect(comboFromEvent(evt('f', 'KeyF', { ctrlKey: true }))).toBe('ctrl+f');
    expect(comboFromEvent(evt('a', 'KeyA', { ctrlKey: true, shiftKey: true }))).toBe(
      'ctrl+shift+a',
    );
  });

  it('returns a matchable token for shifted punctuation (not the shifted glyph)', () => {
    // Shift+3 → '#': must store 'shift+3' (rhh matches via e.code Digit3 → "3"), not 'shift+#'
    expect(comboFromEvent(evt('#', 'Digit3', { shiftKey: true }))).toBe('shift+3');
  });

  it('returns a matchable token for the plus key (main and numpad)', () => {
    // Main '+' is Shift+= → 'shift+equal'; numpad '+' → 'add'. Never the unmatchable 'plus'.
    expect(comboFromEvent(evt('+', 'Equal', { shiftKey: true }))).toBe('shift+equal');
    expect(comboFromEvent(evt('+', 'NumpadAdd'))).toBe('add');
  });

  it('maps the period key (main and numpad) to matchable tokens', () => {
    expect(comboFromEvent(evt('.', 'Period'))).toBe('period');
    expect(comboFromEvent(evt('.', 'NumpadDecimal'))).toBe('decimal');
  });

  it('ignores lone modifier presses', () => {
    expect(comboFromEvent(evt('Shift', 'ShiftLeft', { shiftKey: true }))).toBeNull();
    expect(comboFromEvent(evt('Control', 'ControlLeft', { ctrlKey: true }))).toBeNull();
  });
});

describe('sanitizeKeymap', () => {
  it('returns the full defaults for missing / non-object input', () => {
    expect(sanitizeKeymap(undefined)).toEqual(DEFAULT_KEYMAP);
    expect(sanitizeKeymap('garbage')).toEqual(DEFAULT_KEYMAP);
  });

  it('keeps valid string overrides and falls back for non-strings', () => {
    const km = sanitizeKeymap({ black: 'g', advanceNext: 123 });
    expect(km.black).toBe('g');
    expect(km.advanceNext).toBe(DEFAULT_KEYMAP.advanceNext); // 123 rejected → default
  });

  it('drops unknown/garbage keys', () => {
    const km = sanitizeKeymap({ project: 'f9', bogus: 'x' });
    expect(km.project).toBe('f9');
    expect((km as Record<string, unknown>).bogus).toBeUndefined();
    // every real action is present
    expect(Object.keys(km).sort()).toEqual(Object.keys(DEFAULT_KEYMAP).sort());
  });
});

describe('macOS (⌘ chords next to the F-keys)', () => {
  it('the Mac defaults add ⌘↩ / ⌘F / ⌘⇧F / ⌘K and keep every F-key', () => {
    const mac = defaultKeymap(true);
    expect(mac.project).toBe('f5,f2,meta+enter');
    expect(mac.searchCurrent).toBe('f3,ctrl+f,meta+f');
    expect(mac.searchAll).toBe('f4,meta+shift+f');
    expect(mac.palette).toBe('ctrl+k,ctrl+p,meta+k');
    expect(mac.blank).toBe('b');
    expect(defaultKeymap(false).project).toBe('f5,f2'); // Windows / Linux unchanged
  });

  it('«Повернути на екран» takes back «Очистити» with Ctrl+Z / ⌘Z, clashing with nothing (0.13.2)', () => {
    expect(defaultKeymap(false).restore).toBe('ctrl+z');
    expect(defaultKeymap(true).restore).toBe('ctrl+z,meta+z');
    for (const mac of [false, true]) {
      expect(conflictsForAction(defaultKeymap(mac), 'restore')).toEqual([]);
    }
    // a keymap saved before 0.13.2 gets the new action with its default
    expect(sanitizeKeymap({ clear: 'escape' }, false).restore).toBe('ctrl+z');
  });

  it('«Прев’ю: далі / назад» on Ctrl+arrows, ⌥ on a Mac, clashing with nothing (1.1.0)', () => {
    expect(defaultKeymap(false).previewNext).toBe('ctrl+right,ctrl+down');
    expect(defaultKeymap(false).previewPrev).toBe('ctrl+left,ctrl+up');
    // macOS takes ⌃+arrows for its desktops: ⌥ instead
    expect(defaultKeymap(true).previewNext).toBe('alt+right,alt+down');
    expect(defaultKeymap(true).previewPrev).toBe('alt+left,alt+up');
    for (const mac of [false, true]) {
      expect(conflictsForAction(defaultKeymap(mac), 'previewNext')).toEqual([]);
      expect(conflictsForAction(defaultKeymap(mac), 'previewPrev')).toEqual([]);
    }
    // a keymap saved before 1.1.0 gets them; one moved between a Mac and Windows takes the other's
    expect(sanitizeKeymap({ advanceNext: 'right' }, false).previewNext).toBe(
      'ctrl+right,ctrl+down',
    );
    expect(sanitizeKeymap({ previewNext: 'alt+right,alt+down' }, false).previewNext).toBe(
      'ctrl+right,ctrl+down',
    );
    expect(formatChord('ctrl+right', false)).toBe('Ctrl + →');
    expect(formatChord('alt+right', true)).toBe('⌥→');
  });

  it('a keymap saved before stays the user’s, but untouched old defaults get the ⌘ chords', () => {
    const km = sanitizeKeymap(
      { project: 'f5,f2', searchAll: 'f9', palette: 'ctrl+k,ctrl+p' },
      true,
    );
    expect(km.project).toBe('f5,f2,meta+enter'); // was the old default
    expect(km.searchAll).toBe('f9'); // changed by the user: kept
    expect(km.palette).toBe('ctrl+k,ctrl+p,meta+k');
    expect(sanitizeKeymap({ project: 'f5,f2' }, false).project).toBe('f5,f2');
  });

  it('a keymap saved on a Mac drops the ⌘ chords elsewhere (a portable copy moved to Windows)', () => {
    expect(sanitizeKeymap(defaultKeymap(true), false)).toEqual(defaultKeymap(false));
    // what the user set on the Mac stays theirs
    const km = sanitizeKeymap({ ...defaultKeymap(true), project: 'meta+enter,f9' }, false);
    expect(km.project).toBe('meta+enter,f9');
    expect(km.searchAll).toBe('f4');
    // and back on the Mac, the chords return
    expect(sanitizeKeymap(defaultKeymap(false), true)).toEqual(defaultKeymap(true));
  });

  it('shows chords the Mac way, modifiers in ⌃⌥⇧⌘ order', () => {
    expect(formatChord('meta+shift+f', true)).toBe('⇧⌘F'); // Apple's order: ⌃⌥⇧⌘
    expect(formatChord('meta+enter', true)).toBe('⌘↩');
    expect(formatChord('ctrl+k', true)).toBe('⌃K');
    expect(formatChord('pagedown', true)).toBe('PageDown');
    expect(formatChord('meta+shift+f', false)).toBe('Meta + Shift + F');
  });

  it('⌘↩ on a focused verse is left to «На екран» when bound there', () => {
    const e = evt('Enter', 'Enter', { metaKey: true });
    expect(matchesCombo(e, 'f5,f2,meta+enter')).toBe(true);
    expect(matchesCombo(e, 'f5,f2')).toBe(false);
    expect(matchesCombo(evt('Enter', 'Enter', { ctrlKey: true }), 'f5,f2,meta+enter')).toBe(false);
  });
});
