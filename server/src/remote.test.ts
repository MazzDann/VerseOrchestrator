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
  sanitizeAllowed,
  sanitizeCountdown,
  sanitizeTimer,
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

describe('a control window on another computer (1.9.0-beta.10)', () => {
  it('a pairing keeps its kind; an older file (no kind) and junk read as a phone', () => {
    initRemoteStore({ file: secrets, persist: true });
    const desk = createPairing('Ноутбук', undefined, 'desk');
    const phone = createPairing('Телефон', undefined, 'tablet');
    expect(desk.kind).toBe('desk');
    expect(phone.kind).toBe('phone');
    const file = JSON.parse(fs.readFileSync(secrets, 'utf8'));
    delete file.remotes[1].kind; // as 1.8.12-beta.9 wrote it
    fs.writeFileSync(secrets, JSON.stringify(file));
    initRemoteStore({ file: secrets, persist: true }); // "restart"
    expect(listPairings(() => false).map((p) => [p.name, p.kind])).toEqual([
      ['Ноутбук', 'desk'],
      ['Телефон', 'phone'],
    ]);
    expect(findByToken(desk.token)?.kind).toBe('desk');
  });

  it('one name per pairing: a desk knows its own slide by it', () => {
    initRemoteStore({ file: null, persist: false });
    expect(createPairing('Пульт 2').name).toBe('Пульт 2');
    expect(createPairing('Пульт 2').name).toBe('Пульт 2 (2)');
    expect(createPairing('Пульт 2').name).toBe('Пульт 2 (3)');
    const long = 'Д'.repeat(40);
    expect(createPairing(long).name).toBe(long);
    expect(createPairing(long).name).toBe(`${'Д'.repeat(36)} (2)`);
  });

  it('«Заставка», «Відлік» and (1.11.0-beta.2) the timer are permissions of their own, off by default', () => {
    expect(sanitizeAllowed(undefined)).toEqual(['next', 'prev', 'blank']);
    expect(sanitizeAllowed(['cover', 'countdown', 'timer', 'reboot'])).toEqual([
      'cover',
      'countdown',
      'timer',
    ]);
  });

  it('a timer request (1.11.0-beta.2): start (≤ 12 h), pause, ±1…60 min, stop — nothing else', () => {
    expect(sanitizeTimer({ op: 'start' })).toEqual({ op: 'start' });
    expect(sanitizeTimer({ op: 'start', minutes: 20 })).toEqual({ op: 'start', minutes: 20 });
    expect(sanitizeTimer({ op: 'start', minutes: 721 })).toBeNull();
    expect(sanitizeTimer({ op: 'start', minutes: 1.5 })).toBeNull();
    expect(sanitizeTimer({ op: 'pause' })).toEqual({ op: 'pause' });
    expect(sanitizeTimer({ op: 'pause', minutes: 3 })).toBeNull();
    expect(sanitizeTimer({ op: 'shift', minutes: -1 })).toEqual({ op: 'shift', minutes: -1 });
    expect(sanitizeTimer({ op: 'shift', minutes: 0 })).toBeNull();
    expect(sanitizeTimer({ op: 'shift', minutes: 61 })).toBeNull();
    expect(sanitizeTimer({ op: 'shift' })).toBeNull();
    expect(sanitizeTimer({ op: 'stop' })).toEqual({ op: 'stop' });
    expect(sanitizeTimer({ op: 'reset' })).toBeNull();
    expect(sanitizeTimer(null)).toBeNull();
  });

  it('a countdown request: start (of any length up to 12 h), pause, stop — nothing else', () => {
    expect(sanitizeCountdown({ op: 'start' })).toEqual({ op: 'start' });
    expect(sanitizeCountdown({ op: 'start', seconds: 450 })).toEqual({ op: 'start', seconds: 450 });
    expect(sanitizeCountdown({ op: 'pause' })).toEqual({ op: 'pause' });
    expect(sanitizeCountdown({ op: 'stop' })).toEqual({ op: 'stop' });
    for (const bad of [
      undefined,
      {},
      { op: 'reset' },
      { op: 'start', seconds: 0 },
      { op: 'start', seconds: 1.5 },
      { op: 'start', seconds: 12 * 3600 + 1 },
      { op: 'start', seconds: '300' },
      { op: 'pause', seconds: 60 },
    ])
      expect(sanitizeCountdown(bad)).toBeNull();
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

describe('secrets.json held at start (1.9.3 review)', () => {
  it('is read again once it can be; a pairing that could not be saved is not listed', () => {
    initRemoteStore({ file: secrets, persist: true });
    const kept = createPairing('Доповідач');
    fs.renameSync(secrets, `${secrets}.real`);
    fs.mkdirSync(secrets); // read fails (EISDIR), as a held file would
    initRemoteStore({ file: secrets, persist: true }); // a restart while it is held
    expect(() => createPairing('Новий')).toThrow(/not written over/);
    expect(listPairings(() => false)).toEqual([]);
    fs.rmdirSync(secrets);
    fs.renameSync(`${secrets}.real`, secrets);
    expect(findByToken(kept.token)?.id).toBe(kept.id); // read now
    const next = createPairing('Новий');
    const ids = JSON.parse(fs.readFileSync(secrets, 'utf8')).remotes.map(
      (r: { id: string }) => r.id,
    );
    expect(ids).toEqual([kept.id, next.id]);
  });
});
