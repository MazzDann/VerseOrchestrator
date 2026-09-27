import { describe, expect, it } from 'vitest';
import { createDispatcher, DEDUPE_MS, PRIORITY, type ShowCommand } from './commands';

const remote = { kind: 'remote' as const, name: 'Пульт' };

describe('show command dispatcher', () => {
  it('asks handlers by priority; an open song takes next/prev before the verses', () => {
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

    expect(d.dispatch('1', 'next', remote)).toEqual({ ok: false, reason: 'Це остання строфа' });
    expect(d.dispatch('2', 'blank', remote)).toEqual({ ok: true });
    offSong(); // the song was closed
    d.dispatch('3', 'next', remote);
    expect(log).toEqual(['song:next', 'verses:blank', 'verses:next']);
  });

  it('applies an id once and answers a repeat with the first outcome', () => {
    let t = 0;
    const d = createDispatcher(() => t);
    let applied = 0;
    d.handle(() => ({ ok: ++applied === 1 }));
    expect(d.dispatch('a', 'next', remote)).toEqual({ ok: true });
    expect(d.dispatch('a', 'next', remote)).toEqual({ ok: true, duplicate: true });
    expect(applied).toBe(1);
    t += DEDUPE_MS + 1; // long forgotten: a new press may reuse nothing, but ids can expire
    expect(d.dispatch('a', 'next', remote).duplicate).toBeUndefined();
    expect(applied).toBe(2);
  });

  it('says so when nothing handles the command yet', () => {
    const d = createDispatcher();
    expect(d.dispatch('x', 'next', { kind: 'output' })).toMatchObject({ ok: false });
  });
});
