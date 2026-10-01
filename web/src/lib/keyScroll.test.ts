import { describe, expect, it } from 'vitest';
import { isResizeKey, resizeKeyStep } from './keyScroll';

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
