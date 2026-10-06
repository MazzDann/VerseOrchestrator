import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getServerSettings,
  initServerSettings,
  sanitizeServerSettings,
  updateServerSettings,
} from './serverSettings';

describe('the browser choice in settings.json (2026-10-01)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    initServerSettings(null);
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('keeps a pin of two versions, drops anything else (1.6.3)', () => {
    expect(sanitizeServerSettings({}).updates).toEqual({ check: true });
    expect(
      sanitizeServerSettings({
        updates: { check: false, pin: { version: '1.6.3', skip: '1.7.0' } },
      }).updates,
    ).toEqual({ check: false, pin: { version: '1.6.3', skip: '1.7.0' } });
    for (const pin of [null, { version: '1.6.3' }, { version: 'latest', skip: '1.7.0' }, 'x'])
      expect(sanitizeServerSettings({ updates: { pin } }).updates.pin).toBeUndefined();
  });

  it('a pin set and cleared through a change keeps the switch', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-settings-'));
    dirs.push(dir);
    initServerSettings(path.join(dir, 'settings.json'));
    updateServerSettings({ updates: { check: false } });
    const pinned = updateServerSettings({ updates: { pin: { version: '1.6.3', skip: '1.7.0' } } });
    expect(pinned.updates).toEqual({ check: false, pin: { version: '1.6.3', skip: '1.7.0' } });
    expect(updateServerSettings({ updates: { pin: null } }).updates).toEqual({ check: false });
  });

  it('keeps a channel chosen (1.8.11), drops anything else, and a pin keeps it', () => {
    expect(sanitizeServerSettings({ updates: { channel: 'beta' } }).updates).toEqual({
      check: true,
      channel: 'beta',
    });
    for (const channel of ['preview', 'Beta', 1, null])
      expect(sanitizeServerSettings({ updates: { channel } }).updates.channel).toBeUndefined();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-settings-'));
    dirs.push(dir);
    initServerSettings(path.join(dir, 'settings.json'));
    updateServerSettings({ updates: { channel: 'beta' } });
    const pinned = updateServerSettings({
      updates: { pin: { version: '1.8.12-beta.1', skip: '1.8.12-beta.2' } },
    });
    expect(pinned.updates).toEqual({
      check: true,
      channel: 'beta',
      pin: { version: '1.8.12-beta.1', skip: '1.8.12-beta.2' },
    });
    expect(updateServerSettings({ updates: { channel: 'stable' } }).updates.channel).toBe('stable');
  });

  it('defaults to the system browser, as before', () => {
    expect(sanitizeServerSettings({}).launch).toEqual({ browser: 'system', appWindow: false });
    expect(
      sanitizeServerSettings({ launch: { browser: 'opera', appWindow: true } }).launch,
    ).toEqual({
      browser: 'opera',
      appWindow: true,
    });
    // a hand-edited file with a browser nobody knows: the system's
    expect(sanitizeServerSettings({ launch: { browser: 'mosaic' } }).launch.browser).toBe('system');
  });

  it('a change keeps the other half and the rest of the file, the builder’s part too', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-settings-'));
    dirs.push(dir);
    const file = path.join(dir, 'settings.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ standby: { port: 4750, idleMinutes: 30 }, library: { bibles: ['UKRK'] } }),
    );
    initServerSettings(file);
    expect(updateServerSettings({ launch: { browser: 'chrome' } }).launch).toEqual({
      browser: 'chrome',
      appWindow: false,
    });
    expect(updateServerSettings({ launch: { appWindow: true } }).launch).toEqual({
      browser: 'chrome',
      appWindow: true,
    });
    // not a browser: refused as the system's, the switch kept
    expect(updateServerSettings({ launch: { browser: '../../evil' } }).launch).toEqual({
      browser: 'system',
      appWindow: true,
    });
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(saved.launch).toEqual({ browser: 'system', appWindow: true });
    expect(saved.standby).toEqual({ port: 4750, idleMinutes: 30 });
    expect(saved.library).toBeDefined();
    expect(getServerSettings().launch).toEqual(saved.launch);
  });
});
