import { describe, expect, it } from 'vitest';
import { createPlaceNav } from './placeNav';

const p = (chapter: number, verse: number) => ({
  translationId: 1,
  bookNumber: 500,
  chapter,
  verse,
  ref: `Ів ${chapter}:${verse}`,
});

describe('back / forward through the places (1.24.0-beta.2)', () => {
  it('goes back and forward like a browser; a landing is not a new visit', () => {
    const nav = createPlaceNav();
    expect(nav.back()).toBeNull();
    nav.visit(p(3, 16));
    nav.visit(p(4, 6));
    nav.visit(p(5, 1));
    expect(nav.back()?.ref).toBe('Ів 4:6');
    nav.visit(p(4, 6)); // the jump back lands — the same place, nothing new
    expect(nav.back()?.ref).toBe('Ів 3:16');
    expect(nav.back()).toBeNull();
    expect(nav.forward()?.ref).toBe('Ів 4:6');
    expect(nav.forward()?.ref).toBe('Ів 5:1');
    expect(nav.forward()).toBeNull();
  });
  it('a new place after going back drops the ones ahead', () => {
    const nav = createPlaceNav();
    nav.visit(p(1, 1));
    nav.visit(p(2, 1));
    nav.back();
    nav.visit(p(9, 9));
    expect(nav.forward()).toBeNull();
    expect(nav.back()?.ref).toBe('Ів 1:1');
  });
});
