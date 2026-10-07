import { describe, it, expect } from 'vitest';
import {
  comboFromEvent,
  conflictsForAction,
  sanitizeKeymap,
  DEFAULT_KEYMAP,
  defaultKeymap,
  formatChord,
  matchesCombo,
  arrowScheme,
  withArrowScheme,
  stepDirection,
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

  it('«Заставка» on L everywhere, clashing with nothing (1.4.0)', () => {
    for (const mac of [false, true]) {
      expect(defaultKeymap(mac).cover).toBe('l');
      expect(conflictsForAction(defaultKeymap(mac), 'cover')).toEqual([]);
    }
    expect(sanitizeKeymap({ blank: 'b' }, false).cover).toBe('l');
    expect(matchesCombo(evt('д', 'KeyL'), 'l')).toBe(true); // «д» on a Ukrainian layout
  });

  it('«Відлік: пауза / далі» on T everywhere, clashing with nothing (1.8.1)', () => {
    for (const mac of [false, true]) {
      expect(defaultKeymap(mac).countdown).toBe('t');
      expect(conflictsForAction(defaultKeymap(mac), 'countdown')).toEqual([]);
    }
    expect(sanitizeKeymap({ blank: 'b' }, false).countdown).toBe('t');
    expect(matchesCombo(evt('е', 'KeyT'), 't')).toBe(true); // «е» on a Ukrainian layout
  });

  it('«До приспіву» on C everywhere, clashing with nothing (1.3.0)', () => {
    for (const mac of [false, true]) {
      expect(defaultKeymap(mac).chorus).toBe('c');
      expect(conflictsForAction(defaultKeymap(mac), 'chorus')).toEqual([]);
    }
    // a keymap saved before 1.3.0 gets it
    expect(sanitizeKeymap({ blank: 'b' }, false).chorus).toBe('c');
    expect(matchesCombo(evt('с', 'KeyC'), 'c')).toBe(true); // the Ukrainian layout's «с» key
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

describe('arrows (1.8.12-beta.6, F1005-06)', () => {
  const right = evt('ArrowRight', 'ArrowRight');
  const down = evt('ArrowDown', 'ArrowDown');
  const up = evt('ArrowUp', 'ArrowUp');
  const shiftPgDn = evt('PageDown', 'PageDown', { shiftKey: true });
  for (const mac of [false, true]) {
    it(`the defaults are «same», every scheme round-trips, none clashes (${mac ? 'Mac' : 'elsewhere'})`, () => {
      const d = defaultKeymap(mac);
      expect(arrowScheme(d, mac)).toBe('same');
      for (const s of ['same', 'screenPreview', 'versesItems'] as const) {
        const k = withArrowScheme(d, s, mac);
        expect(arrowScheme(k, mac)).toBe(s);
        for (const id of ['advanceNext', 'previewNext', 'playlistNext'] as const)
          expect(conflictsForAction(k, id)).toEqual([]);
        // a scheme only writes the arrows' actions
        expect(k.project).toBe(d.project);
        expect(sanitizeKeymap(k, mac)).toEqual(k);
      }
    });
  }
  it('«screenPreview»: → steps the screen, ↓ only the preview', () => {
    const k = withArrowScheme(DEFAULT_KEYMAP, 'screenPreview');
    expect(matchesCombo(right, k.advanceNext)).toBe(true);
    expect(matchesCombo(down, k.advanceNext)).toBe(false);
    expect(matchesCombo(down, k.previewNext)).toBe(true);
    expect(matchesCombo(up, k.previewPrev)).toBe(true);
  });
  it('«versesItems»: ↓ steps the verses, → the running order', () => {
    const k = withArrowScheme(DEFAULT_KEYMAP, 'versesItems');
    expect(matchesCombo(down, k.advanceNext)).toBe(true);
    expect(matchesCombo(right, k.playlistNext)).toBe(true);
    expect(matchesCombo(right, k.advanceNext)).toBe(false);
  });
  it('a binding changed by hand is the operator’s own scheme', () => {
    expect(arrowScheme({ ...DEFAULT_KEYMAP, advanceNext: 'space' })).toBeNull();
  });
  it('songs and albums step by the arrows, but leave the running order its keys', () => {
    expect(stepDirection(right, DEFAULT_KEYMAP)).toBe(1);
    expect(stepDirection(up, DEFAULT_KEYMAP)).toBe(-1);
    expect(stepDirection(shiftPgDn, DEFAULT_KEYMAP)).toBe(0);
    const items = withArrowScheme(DEFAULT_KEYMAP, 'versesItems');
    expect(stepDirection(right, items)).toBe(0);
    expect(stepDirection(down, items)).toBe(1);
    // ↓ is the preview's under «screenPreview» — a song has no preview step: it steps
    expect(stepDirection(down, withArrowScheme(DEFAULT_KEYMAP, 'screenPreview'))).toBe(1);
    expect(stepDirection(evt('ArrowDown', 'ArrowDown', { ctrlKey: true }), DEFAULT_KEYMAP)).toBe(0);
    expect(stepDirection(evt(' ', 'Space'), { ...DEFAULT_KEYMAP, advanceNext: 'space' })).toBe(1);
  });
});

describe('a keymap from the other platform, chords in any order (1.9.7, Mac check)', () => {
  it('an arrow scheme chosen on Windows comes to a Mac in its own keys', async () => {
    const { defaultKeymap, withArrowScheme, sanitizeKeymap, arrowScheme } =
      await import('./hotkeys');
    const fromWindows = withArrowScheme(defaultKeymap(false), 'screenPreview', false);
    const onMac = sanitizeKeymap(fromWindows, true);
    expect(arrowScheme(onMac, true)).toBe('screenPreview');
    expect(onMac.previewNext).not.toMatch(/ctrl\+/);
    // and back
    expect(arrowScheme(sanitizeKeymap(onMac, false), false)).toBe('screenPreview');
  });

  it('a recorded chord conflicts with the same chord spelt in another order', async () => {
    const { defaultKeymap, findConflicts, canonChord } = await import('./hotkeys');
    expect(canonChord('shift+meta+f')).toBe(canonChord('meta+shift+f'));
    const km = { ...defaultKeymap(true), searchAll: 'meta+shift+f' };
    expect(findConflicts(km, 'shift+meta+f', 'searchCurrent')).toContain('searchAll');
  });
});

describe('«/» on any layout (1.9.7, Mac check)', () => {
  it('the typed «/» counts while searchFocus keeps its key; not with ⌘ / Ctrl, not when rebound', async () => {
    const { defaultKeymap, slashTyped } = await import('./hotkeys');
    const km = defaultKeymap(false);
    const ev = (o: Partial<KeyboardEvent>) =>
      ({
        key: '/',
        code: 'Digit1',
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: true,
        ...o,
      }) as KeyboardEvent;
    expect(slashTyped(ev({}), km)).toBe(true); // ⇧ + another key types «/» (Ukrainian layout)
    expect(slashTyped(ev({ ctrlKey: true }), km)).toBe(false);
    expect(slashTyped(ev({}), { ...km, searchFocus: 'ctrl+l' })).toBe(false);
    expect(slashTyped(ev({ key: '.', code: 'Slash', shiftKey: false }), km)).toBe(false);
  });
});
