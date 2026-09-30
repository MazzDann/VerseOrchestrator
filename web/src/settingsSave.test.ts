import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Settings from './settingsStore';

/**
 * localStorage with a quota, as a browser has one: the whole origin's characters (keys and
 * values) — WebKit's 5 MB counted at 2 bytes a character is 2 621 440 (1.4.0 review, Mac).
 */
function quotaStorage(limit: number) {
  const data = new Map<string, string>();
  const used = () => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    data,
    used,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const others = used() - (data.has(k) ? k.length + data.get(k)!.length : 0);
      if (others + k.length + v.length > limit) {
        throw Object.assign(new Error('The quota has been exceeded.'), {
          name: 'QuotaExceededError',
        });
      }
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
}

const QUOTA = 2_621_440;
const storage = quotaStorage(QUOTA);
let store: typeof Settings;

beforeAll(async () => {
  // the store takes its storage as it is created, on import: stub it first
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
  vi.stubGlobal('navigator', { languages: ['uk'], platform: 'MacIntel' });
  store = await import('./settingsStore');
});

const image = (chars: number) => `data:image/jpeg;base64,${'A'.repeat(chars)}`;
const saved = () =>
  JSON.parse(storage.data.get('vo:settings') ?? '{}') as {
    state?: { appearance?: Settings.Appearance };
  };

describe('settings the browser refuses to store (1.4.1)', () => {
  it('a logo that does not fit is taken back, said so, and later changes still save', () => {
    const failed = vi.fn();
    const off = store.onSettingsSaveFailed(failed);
    // the review's case: another key holds the background once more (the window bus's asset)
    storage.setItem('vo:asset', image(737_000));
    expect(store.setAppearanceImage('bgImage', image(737_000))).toBe(true);
    expect(store.settingsSaved()).toBe(true);

    // a photo saved as an 800 px PNG by 1.4.0: 1.33 M characters — past the quota
    expect(store.setAppearanceImage('coverImage', image(1_330_000))).toBe(false);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(store.useSettings.getState().appearance.coverImage).toBeNull();
    expect(store.settingsSaved()).toBe(true); // the state without it stored again

    // 1.4.0 kept the refused logo in memory, and every later change failed with it
    store.useSettings.getState().setAppearance({ transition: 'fast' });
    expect(store.settingsSaved()).toBe(true);
    expect(saved().state?.appearance?.transition).toBe('fast');

    // the same logo as 1.4.1 stores it (JPEG, ≤ 400 K characters) fits
    expect(store.setAppearanceImage('coverImage', image(258_000))).toBe(true);
    expect(saved().state?.appearance?.coverImage).toHaveLength(image(258_000).length);
    off();
  });

  it('reports any refused write, not only an image’s', () => {
    const failed = vi.fn();
    const off = store.onSettingsSaveFailed(failed);
    // full to a few characters: the next change of the settings doesn't fit
    storage.setItem('vo:filler', 'x'.repeat(QUOTA - storage.used() - 'vo:filler'.length - 8));
    store.useSettings.getState().setAppearance({ coverText: 'Недільне зібрання' });
    expect(store.settingsSaved()).toBe(false);
    expect(failed).toHaveBeenCalledTimes(1);
    storage.removeItem('vo:filler');
    store.useSettings.getState().setAppearance({ coverText: 'Недільне зібрання!' });
    expect(store.settingsSaved()).toBe(true);
    off();
  });
});
