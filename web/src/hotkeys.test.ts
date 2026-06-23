import { describe, it, expect } from 'vitest';
import { comboFromEvent, sanitizeKeymap, DEFAULT_KEYMAP } from './hotkeys';

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
