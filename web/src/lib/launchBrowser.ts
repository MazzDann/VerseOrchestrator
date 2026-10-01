import type { BrowserListing, LaunchSettings } from '../api';
import { tr } from '../i18n';

/**
 * «Відкривати вікно керування в…» without the component (2026-10-01): what the field lists and
 * what the «Окремим вікном» switch says — the choice itself is the launcher's
 * (server/src/browsers.ts, launcher.ts browserLaunch).
 */
export const SYSTEM_BROWSER = 'system';

/**
 * The field's choices: the system's browser, then those on this computer; the chosen one stays
 * when it is gone, marked, so the field still names it.
 */
export function browserOptions(
  launch: LaunchSettings,
  browsers: readonly BrowserListing[],
): { value: string; label: string }[] {
  return [
    { value: SYSTEM_BROWSER, label: tr('Браузер системи') },
    ...browsers
      .filter((b) => b.installed || b.id === launch.browser)
      .map((b) => ({
        value: b.id,
        label: b.installed ? b.name : tr('{browser} (не знайдено)', { browser: b.name }),
      })),
  ];
}

/**
 * Whether «Окремим вікном» can be on for the chosen browser, and its one line: Chromium's app
 * window; Firefox, Zen and Safari have none; «Браузер системи» is not known to be one.
 */
export function appWindowState(
  launch: LaunchSettings,
  browsers: readonly BrowserListing[],
): { can: boolean; hint: string } {
  const chosen = browsers.find((b) => b.id === launch.browser);
  if (launch.browser === SYSTEM_BROWSER || !chosen)
    return {
      can: false,
      hint: tr(
        'Окремим вікном відкривають браузери на основі Chromium: Chrome, Edge, Brave, Arc, Opera, Vivaldi. Виберіть один із них угорі.',
      ),
    };
  if (!chosen.installed)
    return {
      can: false,
      hint: tr(
        '{browser} на цьому комп’ютері не знайдено — файл запуску відкриє вікно керування, як із «Браузер системи».',
        {
          browser: chosen.name,
        },
      ),
    };
  if (!chosen.appWindow)
    return {
      can: false,
      hint: tr('У {browser} вікно керування відкривається звичайним вікном.', {
        browser: chosen.name,
      }),
    };
  return { can: true, hint: tr('Без вкладок і адресного рядка.') };
}

/** What a page can tell about its own browser (navigator; a test's own object). */
export interface NavigatorLike {
  userAgent: string;
  /** Chromium's client hints: «Google Chrome», «Microsoft Edge», «Brave», «Opera», «Chromium» */
  userAgentData?: { brands?: readonly { brand: string }[] };
  /** Brave only */
  brave?: unknown;
}

/**
 * A browser not on the list, in pageBrowsers: Floorp, Waterfox or Mullvad Browser look like
 * Firefox, Orion or DuckDuckGo like Safari, Opera GX like Opera, a Chromium fork like Chrome or
 * Chromium — never the chosen one (the list holds that), so where it may be, nothing is sure.
 */
export const UNLISTED = '?';

const GECKO = ['firefox', 'zen', 'librewolf', 'firefox-dev', UNLISTED];

/**
 * The browsers this page may be running in, by what it says about itself — with UNLISTED where a
 * browser not on the list says the same. Firefox, Zen, LibreWolf and Firefox Developer Edition
 * send one and the same User-Agent; Chrome, Arc and Chromium tell themselves apart only by the
 * client hints; Edge, Brave (`navigator.brave`) and a Vivaldi that names itself are sure.
 */
export function pageBrowsers(nav: NavigatorLike): string[] {
  const ua = nav.userAgent ?? '';
  const brands = (nav.userAgentData?.brands ?? []).map((b) => b.brand);
  if (/\b(Firefox|FxiOS)\//.test(ua)) return GECKO;
  if (/\b(Edg|EdgA|EdgiOS)\//.test(ua) || brands.includes('Microsoft Edge')) return ['edge'];
  if (/\bOPR\//.test(ua) || brands.includes('Opera')) return ['opera', UNLISTED];
  if (/\bVivaldi\//.test(ua)) return ['vivaldi'];
  if (/\b(Chrome|Chromium|CriOS)\//.test(ua)) {
    if (nav.brave !== undefined || brands.includes('Brave')) return ['brave'];
    // Arc is not known to name itself: wherever it may be
    if (brands.includes('Google Chrome')) return ['chrome', 'arc', UNLISTED];
    if (brands.length > 0) return ['chromium', 'vivaldi', 'arc', UNLISTED];
    return ['chrome', 'arc', 'chromium', 'vivaldi', UNLISTED];
  }
  if (/\bSafari\//.test(ua)) return ['safari', UNLISTED];
  return [];
}

/**
 * «Відкрити в {browser} зараз»: the chosen browser when the button is there — a browser, not
 * «Браузер системи», found on this computer, and not the one this page runs in as far as it can
 * tell: `candidates` (pageBrowsers) when they name it alone, or `remembered` — the browser the
 * app opened a control window in here (the start file's mark, the handover; lib/handover.ts).
 * Unsure, the button stays: a second window there does no harm, a missing button keeps the user
 * from the other browser.
 */
export function openNowTarget(
  launch: LaunchSettings,
  browsers: readonly BrowserListing[],
  candidates: readonly string[],
  remembered: string | null,
): BrowserListing | null {
  if (launch.browser === SYSTEM_BROWSER) return null;
  const chosen = browsers.find((b) => b.id === launch.browser && b.installed);
  if (!chosen) return null;
  const here = remembered && candidates.includes(remembered) ? [remembered] : candidates;
  return here.length === 1 && here[0] === chosen.id ? null : chosen;
}

/**
 * Ask first? The output windows opened from this browser can't follow the control window to the
 * other one (each browser has a window bus of its own): with any open, a word first.
 */
export const openNowAsks = (outputs: readonly unknown[]): boolean => outputs.length > 0;
