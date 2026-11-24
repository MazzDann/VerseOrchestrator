import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { placeShell, SHELL_ID, SHELL_TRIAL, shellWork, waitingShell } from './shellSwap';

describe('a new desktop shell put in place (1.26.0-beta.3)', () => {
  let top = '';
  beforeEach(() => {
    top = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-shell-'));
  });
  afterEach(() => fs.rmSync(top, { recursive: true, force: true }));
  const put = (dir: string, body: string, id?: string) => {
    fs.mkdirSync(path.join(top, dir));
    fs.writeFileSync(path.join(top, dir, 'exe'), body);
    if (id) fs.writeFileSync(path.join(top, dir, SHELL_ID), JSON.stringify({ hash: id }));
  };
  const body = (dir: string) => {
    try {
      return fs.readFileSync(path.join(top, dir, 'exe'), 'utf8');
    } catch {
      return null;
    }
  };
  const opened = () => fs.rmSync(path.join(top, 'shell', SHELL_TRIAL), { force: true });
  const trial = () =>
    JSON.parse(fs.readFileSync(path.join(top, 'shell', SHELL_TRIAL), 'utf8')) as { starts: number };

  it('nothing waits: nothing is done', () => {
    put('shell', 'old');
    expect(shellWork(top)).toBe(false);
    expect(placeShell(top, { starting: true })).toBe('nothing');
    // a copy cut short has no name yet: not whole, never taken
    put('shell.next', 'half');
    expect(waitingShell(top)).toBeNull();
    expect(placeShell(top, { starting: true })).toBe('nothing');
    expect(body('shell')).toBe('old');
  });

  it('takes the place at the quit; opened, it stays', () => {
    put('shell', 'old');
    put('shell.next', 'new', 'N');
    expect(shellWork(top)).toBe(true);
    expect(placeShell(top)).toBe('placed');
    expect([body('shell'), body('shell.previous'), body('shell.next')]).toEqual([
      'new',
      'old',
      null,
    ]);
    expect(trial().starts).toBe(0);
    expect(placeShell(top)).toBe('nothing'); // another quit counts nothing
    expect(placeShell(top, { starting: true })).toBe('trial');
    expect(trial().starts).toBe(1);
    opened();
    expect(shellWork(top)).toBe(false);
    expect(placeShell(top, { starting: true })).toBe('nothing');
    expect(fs.existsSync(path.join(top, 'shell.lock'))).toBe(false);
  });

  it('started twice and never opened: the one before comes back, its name is kept', () => {
    put('shell', 'old');
    put('shell.next', 'new', 'N');
    const t = 1_000_000;
    expect(placeShell(top, { starting: true, now: t })).toBe('placed');
    // a second click while it opens is no second start
    expect(placeShell(top, { starting: true, now: t + 5_000 })).toBe('trial');
    expect(trial().starts).toBe(1);
    expect(placeShell(top, { starting: true, now: t + 90_000 })).toBe('trial');
    expect(trial().starts).toBe(2);
    expect(placeShell(top, { starting: true, now: t + 200_000 })).toBe('back');
    expect(body('shell')).toBe('old');
    expect(body('shell.previous')).toBeNull();
    expect(body('shell.failed')).toBeNull();
    expect(JSON.parse(fs.readFileSync(path.join(top, 'shell.failed', SHELL_ID), 'utf8'))).toEqual({
      hash: 'N',
    });
    expect(shellWork(top)).toBe(false);
  });

  it('with nothing to go back to, a shell on trial is left', () => {
    put('shell', 'new', 'N');
    fs.writeFileSync(path.join(top, 'shell', SHELL_TRIAL), '{"starts":9,"at":1}');
    expect(placeShell(top, { starting: true })).toBe('trial');
    expect(body('shell')).toBe('new');
  });

  it('cut short between the renames: the whole new one, else the one before', () => {
    put('shell.previous', 'old');
    put('shell.next', 'new', 'N');
    expect(shellWork(top)).toBe(true);
    expect(placeShell(top, { starting: true })).toBe('placed');
    expect(body('shell')).toBe('new');
    fs.renameSync(path.join(top, 'shell'), path.join(top, 'gone'));
    expect(placeShell(top, { starting: true })).toBe('back');
    expect(body('shell')).toBe('old');
  });

  it('a broken trial note, another one at work', () => {
    put('shell', 'new', 'N');
    put('shell.previous', 'old');
    fs.writeFileSync(path.join(top, 'shell', SHELL_TRIAL), '{');
    expect(placeShell(top, { starting: true })).toBe('trial'); // a torn note counts from the start
    opened();
    put('shell.next', 'newer', 'M');
    fs.mkdirSync(path.join(top, 'shell.lock'));
    expect(placeShell(top, { starting: true })).toBe('locked');
    expect(body('shell')).toBe('new');
    // a lock left by a crash
    const old = new Date(Date.now() - 120_000);
    fs.utimesSync(path.join(top, 'shell.lock'), old, old);
    expect(placeShell(top, { starting: true })).toBe('placed');
    expect([body('shell'), body('shell.previous')]).toEqual(['newer', 'new']);
  });
});
