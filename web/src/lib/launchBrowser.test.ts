import { afterEach, describe, expect, it } from 'vitest';
import type { BrowserListing } from '../api';
import { useSettings } from '../settingsStore';
import {
  appWindowState,
  browserOptions,
  openNowAsks,
  openNowTarget,
  pageBrowsers,
  UNLISTED,
} from './launchBrowser';

const b = (id: string, name: string, installed: boolean, appWindow: boolean): BrowserListing => ({
  id,
  name,
  installed,
  appWindow,
});
const list = [
  b('chrome', 'Google Chrome', true, true),
  b('safari', 'Safari', true, false),
  b('firefox', 'Firefox', false, false),
  b('zen', 'Zen', true, false),
  b('vivaldi', 'Vivaldi', false, true),
];

describe('«Відкривати вікно керування в…» (2026-10-01)', () => {
  afterEach(() => useSettings.setState({ language: 'uk' }));

  it('lists the system browser, then the ones here; the chosen one stays when it is gone', () => {
    expect(browserOptions({ browser: 'system', appWindow: false }, list)).toEqual([
      { value: 'system', label: 'Браузер системи' },
      { value: 'chrome', label: 'Google Chrome' },
      { value: 'safari', label: 'Safari' },
      { value: 'zen', label: 'Zen' },
    ]);
    expect(browserOptions({ browser: 'vivaldi', appWindow: true }, list).at(-1)).toEqual({
      value: 'vivaldi',
      label: 'Vivaldi (не знайдено)',
    });
    useSettings.setState({ language: 'en' });
    expect(
      browserOptions({ browser: 'vivaldi', appWindow: true }, list).map((o) => o.label),
    ).toEqual(['System browser', 'Google Chrome', 'Safari', 'Zen', 'Vivaldi (not found)']);
  });

  it('«Окремим вікном» only where the browser can, with a line saying why not', () => {
    expect(appWindowState({ browser: 'chrome', appWindow: true }, list)).toEqual({
      can: true,
      hint: 'Без вкладок і адресного рядка.',
    });
    const zen = appWindowState({ browser: 'zen', appWindow: true }, list);
    expect(zen.can).toBe(false);
    expect(zen.hint).toBe('У Zen вікно керування відкривається звичайним вікном.');
    expect(appWindowState({ browser: 'safari', appWindow: false }, list).can).toBe(false);
    // the system's browser is not known to be one of them
    const system = appWindowState({ browser: 'system', appWindow: true }, list);
    expect(system.can).toBe(false);
    expect(system.hint).toContain('Chromium');
    // chosen, then gone
    const gone = appWindowState({ browser: 'vivaldi', appWindow: true }, list);
    expect(gone).toEqual({
      can: false,
      hint: 'Vivaldi на цьому комп’ютері не знайдено — файл запуску відкриє вікно керування, як із «Браузер системи».',
    });
    // the list not read yet: nothing to switch
    expect(appWindowState({ browser: 'chrome', appWindow: true }, []).can).toBe(false);
    useSettings.setState({ language: 'en' });
    expect(appWindowState({ browser: 'zen', appWindow: false }, list).hint).toBe(
      'In Zen the control window opens as a regular window.',
    );
  });
});

/** Real User-Agents (2026) and the client hints Chromium adds. */
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)';
const CHROMIUM_UA = `${MAC} Chrome/154.0.0.0 Safari/537.36`;
const brands = (...names: string[]) => ({
  brands: [...names, 'Not)A;Brand'].map((brand) => ({ brand, version: '154' })),
});
const NAV = {
  chrome: { userAgent: CHROMIUM_UA, userAgentData: brands('Google Chrome', 'Chromium') },
  brave: { userAgent: CHROMIUM_UA, userAgentData: brands('Brave', 'Chromium'), brave: {} },
  edge: {
    userAgent: `${CHROMIUM_UA} Edg/154.0.0.0`,
    userAgentData: brands('Microsoft Edge', 'Chromium'),
  },
  chromium: { userAgent: CHROMIUM_UA, userAgentData: brands('Chromium') },
  zen: {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0',
  },
  safari: {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15',
  },
};

describe('«Відкрити в {browser} зараз»: which browser this page is in', () => {
  it('tells what it can from the User-Agent and the client hints', () => {
    // UNLISTED: a browser not on the list may say the same (Floorp, Orion, Opera GX, a fork)
    expect(pageBrowsers(NAV.chrome)).toEqual(['chrome', 'arc', UNLISTED]);
    expect(pageBrowsers(NAV.brave)).toEqual(['brave']);
    expect(pageBrowsers(NAV.edge)).toEqual(['edge']);
    expect(pageBrowsers(NAV.chromium)).toEqual(['chromium', 'vivaldi', 'arc', UNLISTED]);
    expect(pageBrowsers(NAV.zen)).toEqual(['firefox', 'zen', 'librewolf', 'firefox-dev', UNLISTED]);
    expect(pageBrowsers(NAV.safari)).toEqual(['safari', UNLISTED]);
    expect(pageBrowsers({ userAgent: `${CHROMIUM_UA} OPR/120.0.0.0` })).toEqual([
      'opera',
      UNLISTED,
    ]);
    expect(pageBrowsers({ userAgent: `${CHROMIUM_UA} Vivaldi/7.5` })).toEqual(['vivaldi']);
    // no client hints (an older Chromium): Chrome's family, Brave aside (it has navigator.brave)
    expect(pageBrowsers({ userAgent: CHROMIUM_UA })).toEqual([
      'chrome',
      'arc',
      'chromium',
      'vivaldi',
      UNLISTED,
    ]);
    expect(pageBrowsers({ userAgent: 'curl/8' })).toEqual([]);
  });
});

describe('«Відкрити в {browser} зараз»: when the button is there', () => {
  // this Mac: Chrome, Brave, Safari, Firefox and Zen
  const mac = [
    b('chrome', 'Google Chrome', true, true),
    b('safari', 'Safari', true, false),
    b('firefox', 'Firefox', true, false),
    b('zen', 'Zen', true, false),
    b('brave', 'Brave', true, true),
    b('arc', 'Arc', false, true),
    b('vivaldi', 'Vivaldi', false, true),
  ];
  const zen = { browser: 'zen', appWindow: false };
  const chrome = { browser: 'chrome', appWindow: true };
  const target = (launch: typeof zen, nav: keyof typeof NAV, remembered: string | null = null) =>
    openNowTarget(launch, mac, pageBrowsers(NAV[nav]), remembered)?.id ?? null;

  it('the user’s case: work in Brave or Safari, the show in Zen or Chrome', () => {
    expect(target(zen, 'brave')).toBe('zen');
    expect(target(zen, 'safari')).toBe('zen');
    expect(target(chrome, 'brave')).toBe('chrome');
    expect(target(chrome, 'safari')).toBe('chrome');
  });

  it('not in the browser it would open', () => {
    // sure by itself: Brave (navigator.brave), Edge
    expect(target({ browser: 'brave', appWindow: true }, 'brave')).toBeNull();
    // the start file opened a control window here as the chosen browser (?browser=, remembered)
    expect(target(chrome, 'chrome', 'chrome')).toBeNull();
    expect(target({ browser: 'safari', appWindow: false }, 'safari', 'safari')).toBeNull();
    // not yet: a Chromium fork or Orion may say the same — a second window there does no harm
    expect(target(chrome, 'chrome')).toBe('chrome');
    expect(target({ browser: 'safari', appWindow: false }, 'safari')).toBe('safari');
    // a remembered browser this page can't be: not trusted
    expect(target(chrome, 'safari', 'chrome')).toBe('chrome');
  });

  it('Zen and Firefox look alike: there unless this browser is known to be the chosen one', () => {
    expect(target(zen, 'zen')).toBe('zen'); // could be Firefox
    expect(target(zen, 'zen', 'zen')).toBeNull(); // the app opened a control window here
    expect(target({ browser: 'firefox', appWindow: false }, 'zen', 'zen')).toBe('firefox');
    // only one of them here, and still there: Floorp, Waterfox or Mullvad Browser look the same
    const onlyFirefox = mac.map((x) => (x.id === 'zen' ? { ...x, installed: false } : x));
    const firefox = { browser: 'firefox', appWindow: false };
    expect(openNowTarget(firefox, onlyFirefox, pageBrowsers(NAV.zen), null)?.id).toBe('firefox');
    expect(openNowTarget(firefox, onlyFirefox, pageBrowsers(NAV.zen), 'firefox')).toBeNull();
  });

  it('never for «Браузер системи», a browser gone, or before the list is read', () => {
    expect(target({ browser: 'system', appWindow: false }, 'safari')).toBeNull();
    expect(target({ browser: 'vivaldi', appWindow: true }, 'safari')).toBeNull();
    expect(openNowTarget(zen, [], pageBrowsers(NAV.safari), null)).toBeNull();
  });

  it('asks first only with output windows of this browser open', () => {
    expect(openNowAsks([])).toBe(false);
    expect(openNowAsks([{ id: 'presenter-1' }])).toBe(true);
  });

  it('a page in a browser the app doesn’t know: there', () => {
    expect(openNowTarget(zen, mac, pageBrowsers({ userAgent: 'curl/8' }), null)?.id).toBe('zen');
    // Chromium's family, none of it on this Mac (an embedded browser, a preview pane): there
    expect(target(chrome, 'chromium')).toBe('chrome');
  });
});
