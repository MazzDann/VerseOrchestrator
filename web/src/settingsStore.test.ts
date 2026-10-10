import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Settings from './settingsStore';

// The store takes `window.localStorage` as it is created, on import: stub it first.
const local = new Map<string, string>();
let store: typeof Settings;

beforeAll(async () => {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => void local.set(k, v),
      removeItem: (k: string) => void local.delete(k),
    },
  });
  vi.stubGlobal('navigator', { languages: ['uk'], platform: 'Win32' });
  store = await import('./settingsStore');
});

describe('«Заставка» and presets (1.4.0)', () => {
  it('a preset carries neither the cover’s text nor its image', () => {
    const p = store.coercePreset({
      $type: 'verseorchestrator-preset',
      name: 'Світлий',
      appearance: { textColor: '#111111', coverText: 'Чуже зібрання', coverImage: 'data:x' },
    })!;
    expect(p.appearance.textColor).toBe('#111111');
    expect(p.appearance.coverText).toBe('');
    expect(p.appearance.coverImage).toBeNull();
  });

  it('saving and applying a preset keeps the operator’s own cover', () => {
    const s = store.useSettings;
    s.getState().setAppearance({ coverText: 'Недільне зібрання', coverImage: 'data:logo' });
    s.getState().savePreset('Мій');
    const saved = s.getState().presets.find((p) => p.name === 'Мій')!;
    expect(saved.appearance.coverText).toBe('');
    expect(saved.appearance.coverImage).toBeNull();
    s.getState().setAppearance({ coverText: 'Інше', coverImage: null });
    s.getState().applyPreset('Мій');
    expect(s.getState().appearance.coverText).toBe('Інше');
    s.getState().applyPresetData({
      name: 'x',
      appearance: { ...store.DEFAULT_APPEARANCE, textColor: '#222222' },
      template: null,
    });
    expect(s.getState().appearance).toMatchObject({ textColor: '#222222', coverText: 'Інше' });
  });
});

describe('«Відлік» colours (1.8.2)', () => {
  it('a preset carries them; a bad one falls back to the defaults', () => {
    const { presetToFile, coercePreset, DEFAULT_APPEARANCE } = store;
    const file = JSON.parse(
      JSON.stringify(
        presetToFile({
          name: 'Таймер',
          appearance: {
            ...DEFAULT_APPEARANCE,
            countdownWarnMinutes: 5,
            countdownWarnColor: '#ffd43b',
            countdownOverOn: false,
          },
          template: null,
        }),
      ),
    );
    const back = coercePreset(file);
    expect(back?.appearance.countdownWarnMinutes).toBe(5);
    expect(back?.appearance.countdownWarnColor).toBe('#ffd43b');
    expect(back?.appearance.countdownOverOn).toBe(false);
    const bad = coercePreset({
      ...file,
      appearance: { countdownWarnMinutes: 7, countdownWarnColor: 3 },
    });
    expect(bad?.appearance.countdownWarnMinutes).toBe(DEFAULT_APPEARANCE.countdownWarnMinutes);
    expect(bad?.appearance.countdownWarnColor).toBe(DEFAULT_APPEARANCE.countdownWarnColor);
    expect(bad?.appearance.countdownOverOn).toBe(true);
  });
});

describe('the speaker timer’s look (1.8.6)', () => {
  it('a preset neither carries nor resets it', () => {
    const { presetToFile, coercePreset, DEFAULT_APPEARANCE } = store;
    const file = JSON.parse(
      JSON.stringify(
        presetToFile({
          name: 'Сцена',
          appearance: { ...DEFAULT_APPEARANCE, stageTimerFont: 'mono', stageTimerWarnMinutes: 5 },
          template: null,
        }),
      ),
    );
    const back = coercePreset(file);
    expect(back?.appearance.stageTimerFont).toBe(DEFAULT_APPEARANCE.stageTimerFont);
    expect(back?.appearance.stageTimerWarnMinutes).toBe(DEFAULT_APPEARANCE.stageTimerWarnMinutes);
  });
});

describe('the display panel below the centre (1.4.6)', () => {
  it('a layout saved before it gets the default height', () => {
    expect(store.clampLayout({ navWidth: 300, asideWidth: 640, recentHeight: 170 })).toEqual({
      navWidth: 300,
      asideWidth: 640,
      recentHeight: 170,
      bottomHeight: store.DEFAULT_LAYOUT.bottomHeight,
    });
  });

  it('its height is kept within the limits', () => {
    const [min, max] = store.LAYOUT_LIMITS.bottomHeight;
    expect(store.clampLayout({ bottomHeight: 20 }).bottomHeight).toBe(min);
    expect(store.clampLayout({ bottomHeight: 5000 }).bottomHeight).toBe(max);
    expect(store.clampLayout({ bottomHeight: 333.4 }).bottomHeight).toBe(333);
    expect(store.clampLayout({ bottomHeight: 'tall' }).bottomHeight).toBe(
      store.DEFAULT_LAYOUT.bottomHeight,
    );
  });
});

describe('«Простий вигляд» (1.8.12-beta.7)', () => {
  it('is off unless saved as true, and the setter keeps a boolean', () => {
    const merge = store.useSettings.persist.getOptions().merge!;
    const current = store.useSettings.getState();
    expect(current.simpleView).toBe(false);
    expect(merge({}, current).simpleView).toBe(false);
    expect(merge({ simpleView: 'yes' }, current).simpleView).toBe(false);
    expect(merge({ simpleView: true }, current).simpleView).toBe(true);
    store.useSettings.getState().setSimpleView(true);
    expect(store.useSettings.getState().simpleView).toBe(true);
    store.useSettings.getState().setSimpleView(false);
  });
});

describe('history and bookmarks keep the whole pick (1.12.6)', () => {
  const place = { ref: 'Ів 3:16–18', translationId: 1, bookNumber: 500, chapter: 3, verse: 16 };

  it('the verses a place picks: its list sorted and once each, or its one verse', () => {
    expect(store.refVerses({ verse: 16 })).toEqual([16]);
    expect(store.refVerses({ verse: 16, verses: [18, 16, 17, 17] })).toEqual([16, 17, 18]);
    expect(store.refVerses({ verse: 16, verses: [] })).toEqual([16]);
  });

  it('the key stays the first verse: one pick of 3:16 and one of 3:16–18 are one entry', () => {
    expect(store.refKey({ ...place, verses: [16, 17, 18] })).toBe(store.refKey(place));
  });

  it('an imported list keeps good verse lists and drops damaged ones', () => {
    store.useSettings.setState({ bookmarks: [] });
    store.useSettings.getState().importBookmarks([
      { ...place, verses: [16, 17, 18] },
      { ...place, chapter: 4, verse: 1, verses: ['x', 2] as never },
      { ...place, chapter: 5, verse: 1, verses: [1] },
    ]);
    const kept = store.useSettings.getState().bookmarks;
    expect(kept.map((b) => b.verses)).toEqual([[16, 17, 18], undefined, undefined]);
    expect(kept[1]).not.toHaveProperty('verses');
  });
});

describe('«Номери віршів на екрані» (1.13.0-beta.1, F1010-04)', () => {
  const preset = (appearance: Record<string, unknown>) =>
    store.coercePreset({ $type: 'verseorchestrator-preset', name: 'x', appearance })!.appearance;

  it('the old switch on becomes «Завжди»; off or none takes «Коли віршів кілька»', () => {
    expect(preset({ showVerseNumbers: true }).verseNumbers).toBe('always');
    expect(preset({ showVerseNumbers: false }).verseNumbers).toBe('multi');
    expect(preset({}).verseNumbers).toBe('multi');
  });

  it('a stored value wins, a strange one falls back', () => {
    expect(preset({ verseNumbers: 'off', showVerseNumbers: true }).verseNumbers).toBe('off');
    expect(preset({ verseNumbers: 'loud' }).verseNumbers).toBe('multi');
  });

  it('«Наплив» is a transition of its own; presets leave the transition alone', () => {
    expect(preset({ transition: 'rise' }).transition).toBe('rise');
  });
});
