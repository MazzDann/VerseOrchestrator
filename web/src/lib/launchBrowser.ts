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
