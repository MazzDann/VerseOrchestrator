import { describe, expect, it } from 'vitest';
import {
  asCountdown,
  createDispatcher,
  DEDUPE_MS,
  PRIORITY,
  toggleOf,
  type ShowCommand,
} from './commands';
import { outputKeyAction } from './outputKeys';

const remote = { kind: 'remote' as const, name: 'Пульт' };

describe('show command dispatcher', () => {
  it('asks handlers by priority; an open song takes next/prev before the verses', async () => {
    const d = createDispatcher();
    const log: string[] = [];
    d.handle((cmd) => {
      log.push(`verses:${cmd}`);
      return { ok: true };
    }, PRIORITY.verses);
    const offSong = d.handle((cmd: ShowCommand) => {
      if (cmd !== 'next' && cmd !== 'prev') return null; // passes blank/black on
      log.push(`song:${cmd}`);
      return { ok: false, reason: 'Це остання строфа' };
    }, PRIORITY.song);

    expect(await d.dispatch('1', 'next', remote)).toEqual({
      ok: false,
      reason: 'Це остання строфа',
    });
    expect(await d.dispatch('2', 'blank', remote)).toEqual({ ok: true });
    offSong(); // the song was closed
    await d.dispatch('3', 'next', remote);
    expect(log).toEqual(['song:next', 'verses:blank', 'verses:next']);
  });

  it('applies an id once and answers a repeat with the first outcome', async () => {
    let t = 0;
    const d = createDispatcher(() => t);
    let applied = 0;
    d.handle(() => ({ ok: ++applied === 1 }));
    expect(await d.dispatch('a', 'next', remote)).toEqual({ ok: true });
    expect(await d.dispatch('a', 'next', remote)).toEqual({ ok: true, duplicate: true });
    expect(applied).toBe(1);
    t += DEDUPE_MS + 1; // long forgotten: a new press may reuse nothing, but ids can expire
    expect((await d.dispatch('a', 'next', remote)).duplicate).toBeUndefined();
    expect(applied).toBe(2);
  });

  it('says so when nothing handles the command yet', async () => {
    const d = createDispatcher();
    expect(await d.dispatch('x', 'next', { kind: 'output' })).toMatchObject({ ok: false });
  });

  it('waits for a handler that loads first; a retry meanwhile gets the same outcome', async () => {
    const d = createDispatcher();
    let applied = 0;
    let finish!: (o: { ok: boolean; reason?: string }) => void;
    d.handle((cmd, _src, args) => {
      if (cmd !== 'show' || !args.passage) return null;
      applied++;
      return new Promise((r) => (finish = r));
    });
    const passage = { translationIds: [1], bookNumber: 500, chapter: 3, verses: [16] };
    const first = d.dispatch('s', 'show', remote, { passage });
    const retry = d.dispatch('s', 'show', remote, { passage });
    finish({ ok: false, reason: 'Уривок недоступний' });
    expect(await first).toEqual({ ok: false, reason: 'Уривок недоступний' });
    expect(await retry).toEqual({ ok: false, reason: 'Уривок недоступний', duplicate: true });
    expect(applied).toBe(1);
  });

  it('a handler that throws answers «не вдалося» instead of never', async () => {
    const d = createDispatcher();
    d.handle(() => Promise.reject(new Error('мережа')));
    expect(await d.dispatch('e', 'pick', remote)).toEqual({ ok: false, reason: 'мережа' });
  });
});

describe('the switches a command flips (1.4.1)', () => {
  it('names each: B hides the text, «.» blacks out, L puts «Заставка» on', () => {
    expect(toggleOf('blank')).toBe('hide');
    expect(toggleOf('black')).toBe('black');
    expect(toggleOf('cover')).toBe('cover');
    for (const cmd of ['next', 'prev', 'show', 'pick', 'queue', 'countdown'] as const) {
      expect(toggleOf(cmd)).toBeNull();
    }
  });

  it("a remote's «Відлік» (1.9.0-beta.1) arrives as start / pause / stop, a length only with start", () => {
    expect(asCountdown({ op: 'start', seconds: 450 })).toEqual({ op: 'start', seconds: 450 });
    expect(asCountdown({ op: 'pause' })).toEqual({ op: 'pause' });
    expect(asCountdown({ op: 'stop', seconds: 'x' })).toEqual({ op: 'stop' });
    expect(asCountdown({ op: 'reset' })).toBeUndefined();
    expect(asCountdown(undefined)).toBeUndefined();
  });

  it('L pressed in the presentation window reaches «Заставка», not «Чорний екран»', () => {
    const key = (code: string) => {
      const action = outputKeyAction({
        key: '',
        code,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        repeat: false,
      });
      return action && action !== 'fullscreen' ? toggleOf(action) : null;
    };
    expect(key('KeyL')).toBe('cover');
    expect(key('KeyB')).toBe('hide');
    expect(key('Period')).toBe('black');
    expect(key('ArrowRight')).toBeNull();
  });
});
