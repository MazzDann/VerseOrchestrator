import { afterEach, describe, expect, it } from 'vitest';
import type { BrowserListing } from '../api';
import { useSettings } from '../settingsStore';
import { appWindowState, browserOptions } from './launchBrowser';

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
