import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPeekGuardPoke, PEEK_GUARD_DELAY_MS, type PeekGuardAnswer } from './peekGuard';
import { outputTitle } from './outputs';

afterEach(() => {
  vi.useRealTimers();
});

describe('output windows and Windows «Peek» (F1005-05)', () => {
  it('an output window takes the title the server looks for, in either language', () => {
    // server/src/peekGuard.ts OUTPUT_TITLES holds exactly these
    expect(outputTitle('presenter', 'uk')).toBe('VerseOrchestrator — Показ');
    expect(outputTitle('stage', 'uk')).toBe('VerseOrchestrator — Сцена');
    expect(outputTitle('presenter', 'en')).toBe('VerseOrchestrator — Presentation');
    expect(outputTitle('stage', 'en')).toBe('VerseOrchestrator — Stage');
  });

  it('a drag across the screen is one request — the position poll pokes once a second', async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (): Promise<PeekGuardAnswer> => 'queued');
    const p = createPeekGuardPoke(request);
    expect(PEEK_GUARD_DELAY_MS).toBeGreaterThan(1000);
    for (let i = 0; i < 5; i++) {
      p.poke(); // what lib/outputs.ts's 1 s poll does while the window moves
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PEEK_GUARD_DELAY_MS);
    expect(request).toHaveBeenCalledTimes(1);
    p.poke();
    await vi.advanceTimersByTimeAsync(PEEK_GUARD_DELAY_MS + 100);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('a closed window asks no more; a failed request is asked again at the next change', async () => {
    vi.useFakeTimers();
    const request = vi.fn(() => Promise.reject(new Error('no server')));
    const p = createPeekGuardPoke(request, 800);
    p.poke();
    await vi.advanceTimersByTimeAsync(900);
    expect(request).toHaveBeenCalledTimes(1); // rejected — and swallowed
    p.poke();
    await vi.advanceTimersByTimeAsync(900);
    expect(request).toHaveBeenCalledTimes(2);
    p.poke();
    p.stop();
    p.poke();
    await vi.advanceTimersByTimeAsync(2000);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('a server that says «off» or doesn’t know the request is not asked again', async () => {
    vi.useFakeTimers();
    for (const answer of ['off', 'gone'] as const) {
      const request = vi.fn(async (): Promise<PeekGuardAnswer> => answer);
      const p = createPeekGuardPoke(request, 800);
      p.poke();
      await vi.advanceTimersByTimeAsync(900);
      p.poke();
      await vi.advanceTimersByTimeAsync(900);
      expect(request).toHaveBeenCalledTimes(1);
    }
    // «retry» (no answer, a restart) keeps asking
    const request = vi.fn(async (): Promise<PeekGuardAnswer> => 'retry');
    const p = createPeekGuardPoke(request, 800);
    p.poke();
    await vi.advanceTimersByTimeAsync(900);
    p.poke();
    await vi.advanceTimersByTimeAsync(900);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
