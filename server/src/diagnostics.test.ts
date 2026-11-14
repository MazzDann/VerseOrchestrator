import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { diagnosticsName, diagnosticsZip, tailOf } from './diagnostics.js';
import { unzip } from './zip.js';

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-diag-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('«Діагностика для відгуку» (1.22.0-beta.5, F1107-05)', () => {
  it('takes a log’s end from a line’s start', () => {
    const d = tmp();
    const f = path.join(d, 'a.log');
    fs.writeFileSync(f, ['one', 'two', 'three', 'four'].join('\n') + '\n');
    expect(tailOf(f, 1000)?.toString()).toBe('one\ntwo\nthree\nfour\n');
    expect(tailOf(f, 12)?.toString()).toBe('three\nfour\n');
    expect(tailOf(f, 6)?.toString()).toBe('four\n');
    expect(tailOf(path.join(d, 'none.log'))).toBeNull();
  });

  it('zips what the app is, the server options, the control window’s part and the logs', async () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, 'standby.log'), '2026-11-14 waiter up\n');
    fs.writeFileSync(path.join(d, 'secrets.json'), '{"tokens":["x"]}');
    const buf = await diagnosticsZip({
      dataDir: d,
      version: '1.22.0-beta.5',
      label: 'main · abc1234',
      release: false,
      settings: { standby: { port: 4747 } },
      client: { notices: ['На екрані: Ів 3:16'] },
      now: new Date(2026, 10, 14),
    });
    const files = new Map((await unzip(buf)).map((e) => [e.name, e.data.toString('utf8')]));
    expect([...files.keys()].sort()).toEqual([
      'README.txt',
      'about.json',
      'control-window.json',
      'server-settings.json',
      'standby.log',
    ]);
    expect(JSON.parse(files.get('about.json')!)).toMatchObject({
      version: '1.22.0-beta.5',
      copy: 'clone',
    });
    expect(files.get('standby.log')).toBe('2026-11-14 waiter up\n');
    expect(JSON.parse(files.get('control-window.json')!).notices).toEqual(['На екрані: Ів 3:16']);
    // the secrets file is never read
    expect([...files.values()].some((v) => v.includes('tokens'))).toBe(false);
    expect(diagnosticsName('1.22.0', new Date('2026-11-14T10:00:00Z'))).toBe(
      'VerseOrchestrator-diagnostics-1.22.0-2026-11-14.zip',
    );
  });
});
