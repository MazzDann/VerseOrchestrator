import { describe, expect, it } from 'vitest';
import { outputKeyAction, type OutputKey } from './outputKeys';

const press = (key: string, code: string, more: Partial<OutputKey> = {}): OutputKey => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  ...more,
});

describe('the keys of an output window (1.4.1)', () => {
  it('passes «Заставка» (L) and «Сховати текст» (B) on, as the control window has them', () => {
    expect(outputKeyAction(press('l', 'KeyL'))).toBe('cover');
    expect(outputKeyAction(press('b', 'KeyB'))).toBe('blank');
    expect(outputKeyAction(press('.', 'Period'))).toBe('black');
    expect(outputKeyAction(press('f', 'KeyF'))).toBe('fullscreen');
  });

  it('goes by the physical key: the Ukrainian layout (macOS Ukrainian-PC) works the same', () => {
    // UCKeyTranslate on the Mac: KeyL → «д», KeyB → «и», KeyF → «а», Period → «ю», Slash → «.»
    expect(outputKeyAction(press('д', 'KeyL'))).toBe('cover');
    expect(outputKeyAction(press('и', 'KeyB'))).toBe('blank');
    expect(outputKeyAction(press('а', 'KeyF'))).toBe('fullscreen');
    expect(outputKeyAction(press('ю', 'Period'))).toBe('black');
    // the key that types «.» there is not the period key — nor in the control window
    expect(outputKeyAction(press('.', 'Slash'))).toBeNull();
  });

  it('steps with the arrows and a clicker’s PageUp / PageDown', () => {
    for (const k of ['ArrowRight', 'ArrowDown', 'PageDown'])
      expect(outputKeyAction(press(k, k))).toBe('next');
    for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp'])
      expect(outputKeyAction(press(k, k))).toBe('prev');
    // held down it keeps stepping; a held toggle doesn't flicker
    expect(outputKeyAction(press('PageDown', 'PageDown', { repeat: true }))).toBe('next');
    expect(outputKeyAction(press('l', 'KeyL', { repeat: true }))).toBeNull();
    expect(outputKeyAction(press('.', 'Period', { repeat: true }))).toBeNull();
  });

  it('leaves chords to the browser (⌘L, Ctrl+F, ⌥.) and ignores other keys', () => {
    expect(outputKeyAction(press('l', 'KeyL', { metaKey: true }))).toBeNull();
    expect(outputKeyAction(press('f', 'KeyF', { ctrlKey: true }))).toBeNull();
    expect(outputKeyAction(press('…', 'Period', { altKey: true }))).toBeNull();
    expect(outputKeyAction(press('Escape', 'Escape'))).toBeNull();
    expect(outputKeyAction(press('k', 'KeyK'))).toBeNull();
    // Shift is no chord here: F and L still act
    expect(outputKeyAction(press('L', 'KeyL'))).toBe('cover');
  });

  it('falls back to the character when a browser gives no key code', () => {
    expect(outputKeyAction(press('L', ''))).toBe('cover');
    expect(outputKeyAction(press('.', ''))).toBe('black');
    expect(outputKeyAction(press('ArrowRight', ''))).toBe('next');
    expect(outputKeyAction(press('д', ''))).toBeNull();
  });
});
