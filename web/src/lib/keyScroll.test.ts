import { describe, expect, it } from 'vitest';
import { inOverlay, isResizeKey, isTextEntry, resizeKeyStep } from './keyScroll';

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe('a focused resize control’s arrow keys (1.4.6)', () => {
  it('a height handle takes ↑ and ↓, a width handle ← and →, the grip all four', () => {
    expect(resizeKeyStep('y', key('ArrowUp'))).toEqual({ dx: 0, dy: -16 });
    expect(resizeKeyStep('y', key('ArrowDown'))).toEqual({ dx: 0, dy: 16 });
    expect(resizeKeyStep('x', key('ArrowLeft'))).toEqual({ dx: -16, dy: 0 });
    expect(resizeKeyStep('x', key('ArrowRight'))).toEqual({ dx: 16, dy: 0 });
    expect(resizeKeyStep('xy', key('ArrowRight'))).toEqual({ dx: 16, dy: 0 });
    expect(resizeKeyStep('xy', key('ArrowUp'))).toEqual({ dx: 0, dy: -16 });
  });

  it('the other axis, other keys and chords stay the show’s («Далі», the preview’s step)', () => {
    expect(resizeKeyStep('y', key('ArrowRight'))).toBeNull();
    expect(resizeKeyStep('x', key('ArrowDown'))).toBeNull();
    expect(resizeKeyStep('xy', key('PageDown'))).toBeNull();
    expect(resizeKeyStep('y', key('ArrowDown', { ctrlKey: true }))).toBeNull();
    expect(resizeKeyStep('y', key('ArrowDown', { altKey: true }))).toBeNull();
    expect(resizeKeyStep('xy', key('ArrowLeft', { metaKey: true }))).toBeNull();
    expect(resizeKeyStep(null, key('ArrowDown'))).toBeNull();
  });

  it('read from the focused element: only a resize control owns its arrows', () => {
    const on = (attr: string | null, k: string) =>
      isResizeKey({
        ...key(k),
        target: { getAttribute: (n: string) => (n === 'data-resize-keys' ? attr : null) },
      } as unknown as KeyboardEvent);
    expect(on('y', 'ArrowDown')).toBe(true);
    expect(on('x', 'ArrowDown')).toBe(false);
    expect(on(null, 'ArrowDown')).toBe(false);
    expect(isResizeKey({ ...key('ArrowDown'), target: null } as unknown as KeyboardEvent)).toBe(
      false,
    );
  });
});

describe('isTextEntry (1.8.12-beta.7: the song search beside the song)', () => {
  const el = (tagName: string, more: Record<string, unknown> = {}) =>
    ({
      tagName,
      isContentEditable: false,
      readOnly: false,
      type: 'text',
      ...more,
    }) as unknown as EventTarget;
  it('a text input or area keeps its caret keys', () => {
    expect(isTextEntry(el('INPUT'))).toBe(true);
    expect(isTextEntry(el('INPUT', { type: 'search' }))).toBe(true);
    expect(isTextEntry(el('TEXTAREA'))).toBe(true);
    expect(isTextEntry(el('DIV', { isContentEditable: true }))).toBe(true);
  });
  it('a radio, a checkbox, a Select’s read-only input or a button does not', () => {
    expect(isTextEntry(el('INPUT', { type: 'radio' }))).toBe(false);
    expect(isTextEntry(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isTextEntry(el('INPUT', { readOnly: true }))).toBe(false);
    expect(isTextEntry(el('BUTTON'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe('inOverlay (1.10.5: a menu’s or a list’s arrows are its own, not the song’s)', () => {
  const el = (attrs: Record<string, string>, inside: string | null = null) =>
    ({
      getAttribute: (n: string) => attrs[n] ?? null,
      hasAttribute: (n: string) => n in attrs,
      closest: (sel: string) => (inside && sel.includes(inside) ? {} : null),
    }) as unknown as EventTarget;
  it('a menu item, an option, anything in a pop-up editor, an open Select or menu button', () => {
    expect(inOverlay(el({}, '[role="menu"]'))).toBe(true);
    expect(inOverlay(el({}, '[role="listbox"]'))).toBe(true);
    expect(inOverlay(el({}, '.mantine-Popover-dropdown'))).toBe(true);
    expect(inOverlay(el({ 'data-expanded': 'true', 'aria-haspopup': 'listbox' }))).toBe(true);
    expect(inOverlay(el({ 'aria-expanded': 'true', 'aria-haspopup': 'menu' }))).toBe(true);
  });
  it('not a closed Select, an open accordion, a floating panel’s button, or nothing', () => {
    expect(inOverlay(el({ 'aria-haspopup': 'listbox' }))).toBe(false);
    expect(inOverlay(el({ 'aria-expanded': 'false', 'aria-haspopup': 'menu' }))).toBe(false);
    expect(inOverlay(el({ 'aria-expanded': 'true' }))).toBe(false);
    expect(inOverlay(el({}, '[role="dialog"]'))).toBe(false);
    expect(inOverlay(null)).toBe(false);
  });
});
