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
