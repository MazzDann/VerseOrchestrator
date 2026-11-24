import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearRunning, readRunning, runningElsewhere, writeRunning } from './runningFile';
import { createStandby } from './standby';

describe('one running app of a folder (1.26.0-beta.1)', () => {
  let data = '';
  const open: ReturnType<typeof createStandby>[] = [];
  beforeEach(() => {
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-run-'));
  });
  afterEach(async () => {
    for (const s of open.splice(0)) await s.close();
    fs.rmSync(data, { recursive: true, force: true });
  });
  const waiter = async (root: string, dataDir: string) => {
    const s = createStandby({
      port: 0,
      host: '127.0.0.1',
      idleMs: 60_000,
      startApp: () => Promise.reject(new Error('not asked')),
      root,
      dataDir,
    });
    open.push(s);
    return { s, port: await s.listen() };
  };

  it('a waiter notes its address, and the note goes with it', async () => {
    const root = path.join(data, 'app');
    const { s, port } = await waiter(root, data);
    expect(readRunning(data)).toEqual({ port, pid: process.pid, root });
    expect(await runningElsewhere(data, root, port + 1)).toBe(port);
    // the same port: the ordinary «already running», not another one
    expect(await runningElsewhere(data, root, port)).toBeNull();
    // another copy's folder with this data (moved, a test's): not this app
    expect(await runningElsewhere(data, path.join(data, 'other'), port + 1)).toBeNull();
    open.length = 0;
    await s.close();
    expect(readRunning(data)).toBeNull();
    expect(await runningElsewhere(data, root, port + 1)).toBeNull();
  });

  it('a note left by a crash, garbage, or another copy at its port counts for nothing', async () => {
    const root = path.join(data, 'app');
    writeRunning(data, { port: 9, pid: 1, root });
    expect(await runningElsewhere(data, root, 4747)).toBeNull();
    const elsewhere = path.join(data, 'their');
    const { port } = await waiter(elsewhere, path.join(data));
    writeRunning(data, { port, pid: 1, root });
    expect(await runningElsewhere(data, root, port + 1)).toBeNull();
    // another waiter's note stays when this one closes
    clearRunning(data, process.pid, port);
    expect(readRunning(data)?.pid).toBe(1);
    for (const bad of ['', '{', 'null', '[]', '{"port":"4747","pid":1,"root":"x"}']) {
      fs.writeFileSync(path.join(data, 'running.json'), bad);
      expect(readRunning(data)).toBeNull();
      expect(await runningElsewhere(data, root, 4747)).toBeNull();
    }
  });
});
