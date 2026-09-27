import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createPairing,
  findByToken,
  initRemoteStore,
  listPairings,
  reissuePairing,
  revokePairing,
  setRemotePersistence,
} from './remote';
import { initServerSettings, sanitizeServerSettings, updateServerSettings } from './serverSettings';

let dir: string;
let secrets: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-remote-'));
  secrets = path.join(dir, 'secrets.json');
});
afterEach(() => {
  initRemoteStore({ file: null, persist: false }); // leave the module clean for other suites
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('remote pairings on disk', () => {
  it('survives a restart when persistence is on, storing only a hash of the token', () => {
    initRemoteStore({ file: secrets, persist: true });
    const p = createPairing('Доповідач', ['next', 'prev']);

    const onDisk = fs.readFileSync(secrets, 'utf8');
    expect(onDisk).not.toContain(p.token);
    expect(JSON.parse(onDisk).remotes[0]).toMatchObject({ id: p.id, name: 'Доповідач' });

    initRemoteStore({ file: secrets, persist: true }); // "restart"
    expect(findByToken(p.token)?.id).toBe(p.id);
    expect(listPairings(() => false)[0]).toMatchObject({
      name: 'Доповідач',
      allowed: ['next', 'prev'],
    });
  });

  it('forgets pairings on restart when persistence is off', () => {
    initRemoteStore({ file: secrets, persist: false });
    const p = createPairing('Тимчасовий');
    initRemoteStore({ file: secrets, persist: false });
    expect(findByToken(p.token)).toBeNull();
  });

  it('switching persistence off wipes stored remotes from the secrets file', () => {
    initRemoteStore({ file: secrets, persist: true });
    createPairing('A');
    setRemotePersistence(false);
    expect(JSON.parse(fs.readFileSync(secrets, 'utf8')).remotes).toEqual([]);
  });

  it('reissue invalidates the old code and persists the new one', () => {
    initRemoteStore({ file: secrets, persist: true });
    const p = createPairing('Доповідач');
    const r = reissuePairing(p.id)!;
    expect(r.token).not.toBe(p.token);
    expect(findByToken(p.token)).toBeNull();
    expect(findByToken(r.token)?.id).toBe(p.id);
    initRemoteStore({ file: secrets, persist: true });
    expect(findByToken(r.token)?.id).toBe(p.id);
    expect(reissuePairing('missing')).toBeNull();
  });

  it('revoke removes it from disk too', () => {
    initRemoteStore({ file: secrets, persist: true });
    const p = createPairing('X');
    revokePairing(p.id);
    initRemoteStore({ file: secrets, persist: true });
    expect(findByToken(p.token)).toBeNull();
  });

  it('ignores malformed entries in a hand-edited secrets file', () => {
    fs.writeFileSync(
      secrets,
      JSON.stringify({ version: 1, remotes: [{ id: 'a', tokenHash: 'nothex' }, null, 5] }),
    );
    initRemoteStore({ file: secrets, persist: true });
    expect(listPairings(() => false)).toEqual([]);
  });
});

describe('server settings file', () => {
  it('defaults, materialises the file, and sanitises updates', () => {
    const file = path.join(dir, 'settings.json');
    expect(initServerSettings(file).remotes.persist).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).remotes.persist).toBe(true);
    expect(updateServerSettings({ remotes: { persist: false } }).remotes.persist).toBe(false);
    expect(initServerSettings(file).remotes.persist).toBe(false); // reloaded from disk
    expect(sanitizeServerSettings({ remotes: { persist: 'yes' } }).remotes.persist).toBe(true);
    initServerSettings(null);
  });
});
