import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyHandoverFrame,
  claimForHandover,
  controlHello,
  handoverHello,
  rememberBrowser,
  rememberedBrowser,
  resetHandoverForTests,
  splitHandover,
  takeHandover,
} from './handover';

const TOKEN = 'Ab3_dEf-Gh5iJk7LmN9oPq1R';

/** A page loaded at `href`: its address bar and the storage of its browser. */
function page(href: string) {
  const store = new Map<string, string>();
  const replaced: string[] = [];
  vi.stubGlobal('window', {
    location: { href },
    history: {
      state: { idx: 0 },
      replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url),
    },
  });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
  return { replaced, store };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetHandoverForTests();
});

describe('a control window opened by «Відкрити в … зараз»', () => {
  it('takes the token out of the address, keeping the rest', () => {
    expect(splitHandover(`http://localhost:4747/?handover=${TOKEN}`)).toEqual({
      token: TOKEN,
      browser: null,
      rest: '/',
    });
    expect(splitHandover(`http://localhost:4747/?a=1&handover=${TOKEN}#x`)).toEqual({
      token: TOKEN,
      browser: null,
      rest: '/?a=1#x',
    });
    // something else there: no token, but out of the address all the same
    expect(splitHandover('http://localhost:4747/?handover=%3Cscript%3E')).toEqual({
      token: null,
      browser: null,
      rest: '/',
    });
    expect(splitHandover('http://localhost:4747/?handover=short')).toEqual({
      token: null,
      browser: null,
      rest: '/',
    });
    expect(splitHandover('http://localhost:4747/')).toEqual({
      token: null,
      browser: null,
      rest: null,
    });
    expect(splitHandover('not a url')).toEqual({ token: null, browser: null, rest: null });
  });

  it('and the start file’s browser mark (server/src/browsers.ts markBrowser)', () => {
    expect(splitHandover('http://localhost:4747/?browser=zen')).toEqual({
      token: null,
      browser: 'zen',
      rest: '/',
    });
    expect(splitHandover('http://localhost:4747/?browser=%3Cb%3E')).toEqual({
      token: null,
      browser: null,
      rest: '/',
    });
  });

  it('the address loses it at once; the first hello carries it, no later one', () => {
    const { replaced } = page(`http://localhost:4747/?handover=${TOKEN}`);
    expect(takeHandover()).toBe(TOKEN);
    expect(replaced).toEqual(['/']);
    expect(takeHandover()).toBe(TOKEN); // asked again (StrictMode, the effect): the same, once stripped
    expect(replaced).toEqual(['/']);
    expect(handoverHello()).toEqual({ handover: TOKEN });
    expect(handoverHello()).toEqual({}); // a reconnect: an ordinary hello
  });

  it('a page without one says an ordinary hello and touches no address', () => {
    const { replaced } = page('http://localhost:4747/');
    expect(takeHandover()).toBeNull();
    expect(handoverHello()).toEqual({});
    expect(replaced).toEqual([]);
  });

  it('the control hello: the token in the first one only', () => {
    page(`http://localhost:4747/?handover=${TOKEN}`);
    expect(controlHello()).toEqual({ role: 'control', handover: TOKEN });
    expect(controlHello()).toEqual({ role: 'control' }); // a reconnect
    resetHandoverForTests();
    page('http://localhost:4747/');
    expect(controlHello()).toEqual({ role: 'control' });
  });

  it('claims the lead in its browser only for a token still good', async () => {
    const claims: string[] = [];
    const claim = () => {
      claims.push('claim');
    };
    const asked: string[] = [];
    const check = (good: boolean) => async (t: string) => {
      asked.push(t);
      return { valid: good };
    };
    expect(await claimForHandover(TOKEN, check(true), claim)).toBe(true);
    expect(claims).toEqual(['claim']);
    expect(asked).toEqual([TOKEN]);
    // used or expired: nothing changes
    expect(await claimForHandover(TOKEN, check(false), claim)).toBe(false);
    // no token: the server isn't asked
    expect(await claimForHandover(null, check(true), claim)).toBe(false);
    expect(asked).toEqual([TOKEN, TOKEN]);
    // no server: no hub to hand over to
    const down = () => Promise.reject(new Error('offline'));
    expect(await claimForHandover(TOKEN, down, claim)).toBe(false);
    expect(claims).toEqual(['claim']);
  });

  it('a hub frame: where control moved, which browser this is', () => {
    const moved: (string | null)[] = [];
    const remembered: unknown[] = [];
    const apply = (f: { type: string } & Record<string, unknown>) =>
      applyHandoverFrame(
        f,
        (b) => moved.push(b),
        (id) => remembered.push(id),
      );
    apply({ type: 'hub', active: false, movedTo: 'Zen' }); // «Відкрити в Zen зараз» from here
    apply({ type: 'hub', active: false }); // another browser's window took over
    apply({ type: 'hub', active: true, movedTo: 'Zen' }); // «Слухати тут»: in charge again
    apply({ type: 'handover', browser: 'zen' }); // this window is the one opened in Zen
    apply({ type: 'viewers', count: 3 });
    expect(moved).toEqual(['Zen', null, null]);
    expect(remembered).toEqual(['zen']);
  });

  it('remembers which browser it is from the start file’s mark, out of the address at once', () => {
    const { replaced, store } = page('http://localhost:4747/?browser=zen');
    expect(takeHandover()).toBeNull();
    expect(replaced).toEqual(['/']);
    expect(store.get('vo:browser')).toBe('zen');
    expect(handoverHello()).toEqual({});
  });

  it('remembers which browser it is, when the hub says so', () => {
    const { store } = page('http://localhost:4747/');
    expect(rememberedBrowser()).toBeNull();
    rememberBrowser('zen');
    expect(rememberedBrowser()).toBe('zen');
    rememberBrowser('<b>');
    rememberBrowser(undefined);
    expect(store.get('vo:browser')).toBe('zen');
  });
});
