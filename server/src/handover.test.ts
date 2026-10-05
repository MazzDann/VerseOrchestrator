import type * as ChildProcess from 'node:child_process';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * No test here may start a browser or any app: `open`, osascript, xdg-open, `cmd /c start` and
 * every browser's program throw instead (as in browsers.test.ts). The routes get a runner of
 * their own; only spawnBrowser's own test starts something — this Node, with `-e`.
 */
const FORBIDDEN =
  /^(open|osascript|plutil|xdg-open|cmd(\.exe)?|powershell(\.exe)?|google[ -]chrome(-stable)?|chrome(\.exe)?|chromium(-browser)?|msedge(\.exe)?|microsoft[ -]edge(-stable)?|firefox(-developer-edition)?(\.exe)?|safari|zen(-browser)?(\.exe)?|brave([ -]browser)?(\.exe)?|arc|opera(\.exe)?|vivaldi(-stable)?(\.exe)?|librewolf(\.exe)?)$/i;
const guard = (cmd: unknown) => {
  const name = String(cmd).split(/[/\\]/).pop() ?? '';
  if (FORBIDDEN.test(name)) throw new Error(`a test ran ${String(cmd)}`);
};
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof ChildProcess>();
  const wrap =
    <F extends (...args: never[]) => unknown>(f: F) =>
    (...args: Parameters<F>) => {
      guard(args[0]);
      return f(...args);
    };
  return {
    ...real,
    spawn: wrap(real.spawn),
    spawnSync: wrap(real.spawnSync),
    execFile: wrap(real.execFile),
    execFileSync: wrap(real.execFileSync),
    exec: () => {
      throw new Error('a test ran a shell command');
    },
    execSync: () => {
      throw new Error('a test ran a shell command');
    },
  };
});
import {
  controlUrl,
  createHandovers,
  handoverRoutes,
  HANDOVER_TTL_MS,
  openControlWindow,
  spawnBrowser,
  type BrowserRunner,
  type OpenDeps,
} from './handover';
import type { InstalledBrowser, LaunchSettings } from './browsers';

const zenMac: InstalledBrowser = {
  id: 'zen',
  name: 'Zen',
  appWindow: false,
  bundleId: 'app.zen-browser.zen',
  program: '/Applications/Zen.app/Contents/MacOS/zen',
};
const chromeMac: InstalledBrowser = {
  id: 'chrome',
  name: 'Google Chrome',
  appWindow: true,
  bundleId: 'com.google.Chrome',
  program: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
};
const chromeWin: InstalledBrowser = {
  id: 'chrome',
  name: 'Google Chrome',
  appWindow: true,
  bundleId: null,
  program: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
};
const own = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '::1';

/** A runner that records what it would start, and answers `answer`. */
function recorder(answer: string | null = null) {
  const ran: [string, string[]][] = [];
  const run: BrowserRunner = async (cmd, args) => {
    ran.push([cmd, args]);
    return answer;
  };
  return { ran, run };
}

function deps(over: Partial<OpenDeps> = {}): OpenDeps {
  return {
    platform: 'darwin',
    env: {},
    launch: { browser: 'zen', appWindow: false },
    find: (id) => [zenMac, chromeMac].find((b) => b.id === id),
    own,
    run: recorder().run,
    tokens: createHandovers(),
    ...over,
  };
}

const tokenOf = (url: string) => new URL(url).searchParams.get('handover')!;

describe('handover tokens (one use, a minute, in memory)', () => {
  it('a token is good once: peek leaves it, consume uses it up', () => {
    const t = createHandovers();
    const token = t.issue({ id: 'zen', name: 'Zen' });
    expect(token).toMatch(/^[\w-]{24}$/);
    expect(t.peek(token)).toEqual({ id: 'zen', name: 'Zen' });
    expect(t.peek(token)).toEqual({ id: 'zen', name: 'Zen' });
    expect(t.consume(token)).toEqual({ id: 'zen', name: 'Zen' });
    expect(t.consume(token)).toBeNull();
    expect(t.peek(token)).toBeNull();
  });

  it('a wrong token, or none, is nothing', () => {
    const t = createHandovers();
    const token = t.issue({ id: 'zen', name: 'Zen' });
    for (const wrong of [token.slice(1), token.toUpperCase(), '', undefined, null, 42, {}]) {
      expect(t.consume(wrong)).toBeNull();
    }
    expect(t.consume(token)).not.toBeNull(); // the wrong ones left the real one be
  });

  it('expires after a minute, unused; nothing else changes', () => {
    let now = 1_000_000;
    const t = createHandovers({ now: () => now });
    const old = t.issue({ id: 'zen', name: 'Zen' });
    now += HANDOVER_TTL_MS - 1;
    const fresh = t.issue({ id: 'chrome', name: 'Google Chrome' });
    expect(t.size()).toBe(2);
    now += 1;
    expect(t.consume(old)).toBeNull();
    expect(t.size()).toBe(1);
    expect(t.consume(fresh)).toEqual({ id: 'chrome', name: 'Google Chrome' });
  });

  it('every token is new; revoke drops one', () => {
    const t = createHandovers();
    const tokens = new Set(Array.from({ length: 200 }, () => t.issue({ id: 'zen', name: 'Zen' })));
    expect(tokens.size).toBe(200);
    const one = [...tokens][7];
    t.revoke(one);
    expect(t.peek(one)).toBeNull();
    expect(t.size()).toBe(199);
  });
});

describe('the control window address it opens', () => {
  it('this page’s origin on this computer, plus the token — nothing else', () => {
    expect(controlUrl('http://localhost:4747', 'abc', own)).toBe(
      'http://localhost:4747/?handover=abc',
    );
    expect(controlUrl('http://127.0.0.1:5173', 'a-b_c', own)).toBe(
      'http://127.0.0.1:5173/?handover=a-b_c',
    );
    expect(controlUrl('http://[::1]:4747', 'abc', own)).toBe('http://[::1]:4747/?handover=abc');
    for (const bad of [
      'http://example.com:4747', // not this computer
      'http://localhost:4747/presenter', // an origin, no path
      'http://localhost:4747/?x=1',
      'http://user:pw@localhost:4747',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'localhost:4747',
      '',
      undefined,
      42,
    ]) {
      expect(controlUrl(bad, 'abc', own)).toBeNull();
    }
  });
});

describe('«Відкрити в {browser} зараз»: the command', () => {
  it('macOS: `open -b` with the bundle id and the address with a token the hub will take', async () => {
    const { ran, run } = recorder();
    const tokens = createHandovers();
    const r = await openControlWindow('http://localhost:4747', deps({ run, tokens }));
    expect(r).toEqual({ ok: true, browser: 'Zen' });
    expect(ran).toHaveLength(1);
    const [cmd, args] = ran[0];
    expect([cmd, args.slice(0, 2)]).toEqual(['open', ['-b', 'app.zen-browser.zen']]);
    expect(args[2]).toMatch(/^http:\/\/localhost:4747\/\?handover=[\w-]{24}$/);
    expect(tokens.consume(tokenOf(args[2]))).toEqual({ id: 'zen', name: 'Zen' });
  });

  it('«Окремим вікном» where the browser can: its program with --app, as the launcher does', async () => {
    const { ran, run } = recorder();
    const launch: LaunchSettings = { browser: 'chrome', appWindow: true };
    await openControlWindow('http://localhost:4747', deps({ run, launch }));
    expect(ran[0][0]).toBe(chromeMac.program);
    expect(ran[0][1]).toEqual([
      expect.stringMatching(/^--app=http:\/\/localhost:4747\/\?handover=/),
    ]);
    // switched off: a page in Chrome's window
    const plain = recorder();
    await openControlWindow(
      'http://localhost:4747',
      deps({ run: plain.run, launch: { browser: 'chrome', appWindow: false } }),
    );
    expect(plain.ran[0].slice(0, 1)).toEqual(['open']);
    expect(plain.ran[0][1].slice(0, 2)).toEqual(['-b', 'com.google.Chrome']);
    // Windows: the program with the address
    const win = recorder();
    await openControlWindow(
      'http://localhost:4747',
      deps({
        platform: 'win32',
        run: win.run,
        launch: { browser: 'chrome', appWindow: false },
        find: () => chromeWin,
      }),
    );
    expect(win.ran[0][0]).toBe(chromeWin.program);
    expect(win.ran[0][1]).toEqual([expect.stringMatching(/^http:\/\/localhost:4747\/\?handover=/)]);
  });

  it('the browser gone, «Браузер системи», a bad address: refused, nothing started', async () => {
    const { ran, run } = recorder();
    const tokens = createHandovers();
    expect(
      await openControlWindow(
        'http://localhost:4747',
        deps({ run, tokens, find: () => undefined }),
      ),
    ).toEqual({
      ok: false,
      status: 404,
      key: '{browser} на цьому комп’ютері більше немає — виберіть інший браузер.',
      vars: { browser: 'Zen' },
    });
    expect(
      await openControlWindow(
        'http://localhost:4747',
        deps({ run, tokens, launch: { browser: 'system', appWindow: false } }),
      ),
    ).toMatchObject({ ok: false, status: 400 });
    expect(await openControlWindow('http://evil.example', deps({ run, tokens }))).toMatchObject({
      ok: false,
      status: 400,
      key: 'Неправильна адреса вікна керування',
    });
    expect(ran).toEqual([]);
    expect(tokens.size()).toBe(0);
  });

  it('the command fails: says how, and its token goes', async () => {
    const { ran, run } = recorder('exit 1');
    const tokens = createHandovers();
    expect(await openControlWindow('http://localhost:4747', deps({ run, tokens }))).toEqual({
      ok: false,
      status: 500,
      key: 'Не вдалося відкрити {browser}: {error}',
      vars: { browser: 'Zen', error: 'exit 1' },
    });
    expect(ran).toHaveLength(1);
    expect(tokens.size()).toBe(0);
    // Linux without a screen: nothing to start
    const none = recorder();
    const linux: InstalledBrowser = { ...zenMac, bundleId: null, program: '/usr/bin/zen' };
    expect(
      await openControlWindow(
        'http://localhost:4747',
        deps({ platform: 'linux', env: {}, run: none.run, tokens, find: () => linux }),
      ),
    ).toMatchObject({ ok: false, status: 500, key: 'Не вдалося відкрити {browser}.' });
    expect(none.ran).toEqual([]);
    expect(tokens.size()).toBe(0);
  });
});

describe('the routes (local only, with the control window’s header)', () => {
  let server: Server;
  let base: string;
  const rec = recorder();
  const tokens = createHandovers();
  let launch: LaunchSettings = { browser: 'zen', appWindow: false };

  beforeAll(async () => {
    const app = express();
    app.use(
      handoverRoutes({
        platform: 'darwin',
        env: {},
        launch: () => launch,
        find: (id) => [zenMac, chromeMac].find((b) => b.id === id),
        own,
        run: rec.run,
        tokens,
      }),
    );
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const post = (path: string, body: object, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vo-control': '1', ...headers },
      body: JSON.stringify(body),
    });

  it('without the header, or from another machine, nothing opens', async () => {
    const plain = await fetch(`${base}/api/control-window/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin: 'http://localhost:4747' }),
    });
    expect(plain.status).toBe(403);
    // through a proxy that names a phone on the network as the client (access.ts)
    const phone = await post(
      '/api/control-window/open',
      { origin: 'http://localhost:4747' },
      { 'x-forwarded-for': '192.0.2.7' },
    );
    expect(phone.status).toBe(403);
    expect(
      (await post('/api/control-window/handover', { token: 'x' }, { 'x-vo-control': '0' })).status,
    ).toBe(403);
    expect(rec.ran).toEqual([]);
  });

  it('opens the control window there; the page can ask whether its token is still good', async () => {
    const res = await post('/api/control-window/open', { origin: 'http://localhost:4747' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, browser: 'Zen' });
    expect(rec.ran).toHaveLength(1);
    const token = tokenOf(rec.ran[0][1][2]);
    const ask = async (t: unknown) =>
      (await (await post('/api/control-window/handover', { token: t })).json()) as object;
    expect(await ask(token)).toEqual({ valid: true });
    expect(await ask(token)).toEqual({ valid: true }); // asking doesn't use it up
    expect(await ask('wrong-token-wrong-token')).toEqual({ valid: false });
    expect(await ask(undefined)).toEqual({ valid: false });
    tokens.consume(token); // the hub took it
    expect(await ask(token)).toEqual({ valid: false });
  });

  it('a refusal comes as a key the page shows in its own language', async () => {
    launch = { browser: 'firefox', appWindow: false };
    const res = await post('/api/control-window/open', { origin: 'http://localhost:4747' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: 'Firefox на цьому комп’ютері більше немає — виберіть інший браузер.',
      key: '{browser} на цьому комп’ютері більше немає — виберіть інший браузер.',
      vars: { browser: 'Firefox' },
    });
    launch = { browser: 'zen', appWindow: false };
  });
});

describe('spawnBrowser (the real runner)', () => {
  // this Node with -e stands in for a browser: nothing appears on any screen
  const node = process.execPath;

  it('a command that exits cleanly, or runs on, is on its way', async () => {
    expect(await spawnBrowser(node, ['-e', ''])).toBeNull();
    const t0 = Date.now();
    expect(await spawnBrowser(node, ['-e', 'setTimeout(() => {}, 2500)'])).toBeNull();
    expect(Date.now() - t0).toBeLessThan(2400); // didn't wait for it to end
  });

  it('a command that fails says how', async () => {
    expect(await spawnBrowser(node, ['-e', 'process.exit(3)'])).toBe('exit 3');
    expect(await spawnBrowser('/no/such/browser', [])).toMatch(/ENOENT/);
  });

  it('starts it from the home folder, never from app/ (1.8.8: a browser there kept app/ in use)', async () => {
    const home = JSON.stringify(os.homedir());
    // exits 0 only when its working folder is the home folder
    const check = `process.exit(require('node:path').relative(process.cwd(), ${home}) === '' ? 0 : 7)`;
    expect(await spawnBrowser(node, ['-e', check])).toBeNull();
  });
});
