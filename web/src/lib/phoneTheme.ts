import { useCallback, useState } from 'react';
import { tr } from '../i18n';

/**
 * The phone pages' theme (1.8.12-beta.8, F1005-04 — the author's call): «Як у телефоні» (the
 * phone's own light or dark, as before), «Світла» or «Темна». Kept on that phone only
 * (localStorage), the same for /follow and /remote; the page's root takes `data-theme`
 * (styles.css `.vo-follow`).
 */
export type PhoneTheme = 'auto' | 'light' | 'dark';

export const PHONE_THEMES: readonly PhoneTheme[] = ['auto', 'light', 'dark'];

const KEY = 'vo:phoneTheme';

export function loadPhoneTheme(): PhoneTheme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto'; // private mode / blocked storage: the phone's own, as before
  }
}

export function savePhoneTheme(t: PhoneTheme): void {
  try {
    if (t === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* not saved — it still applies until the page is closed */
  }
}

/** The next one for a single button that goes round them (the remote's header). */
export const nextPhoneTheme = (t: PhoneTheme): PhoneTheme =>
  PHONE_THEMES[(PHONE_THEMES.indexOf(t) + 1) % PHONE_THEMES.length];

/** The root's `data-theme`: none for the phone's own. */
export const themeAttr = (t: PhoneTheme): 'light' | 'dark' | undefined =>
  t === 'auto' ? undefined : t;

export function usePhoneTheme(): [PhoneTheme, (t: PhoneTheme) => void] {
  const [theme, setTheme] = useState<PhoneTheme>(loadPhoneTheme);
  const set = useCallback((t: PhoneTheme) => {
    setTheme(t);
    savePhoneTheme(t);
  }, []);
  return [theme, set];
}

/** A theme's name on the phone pages. */
export function themeLabel(t: PhoneTheme): string {
  return t === 'light' ? tr('Світла') : t === 'dark' ? tr('Темна') : tr('Як у телефоні');
}
