import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPhoneTheme, nextPhoneTheme, savePhoneTheme, themeAttr } from './phoneTheme';

const local = new Map<string, string>();
beforeEach(() => {
  local.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => void local.set(k, v),
    removeItem: (k: string) => void local.delete(k),
  });
});

describe('the phone pages’ theme (1.8.12-beta.8, F1005-04)', () => {
  it('is the phone’s own until one is chosen; a strange value is the phone’s own', () => {
    expect(loadPhoneTheme()).toBe('auto');
    local.set('vo:phoneTheme', 'sepia');
    expect(loadPhoneTheme()).toBe('auto');
  });
  it('keeps «Світла» / «Темна» and forgets «Як у телефоні»', () => {
    savePhoneTheme('dark');
    expect(loadPhoneTheme()).toBe('dark');
    savePhoneTheme('auto');
    expect(local.has('vo:phoneTheme')).toBe(false);
  });
  it('goes round the three; only a chosen one marks the page', () => {
    expect(nextPhoneTheme('auto')).toBe('light');
    expect(nextPhoneTheme('light')).toBe('dark');
    expect(nextPhoneTheme('dark')).toBe('auto');
    expect(themeAttr('auto')).toBeUndefined();
    expect(themeAttr('light')).toBe('light');
  });
  it('blocked storage: the phone’s own, and saving does not throw', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadPhoneTheme()).toBe('auto');
    expect(() => savePhoneTheme('light')).not.toThrow();
  });
});
