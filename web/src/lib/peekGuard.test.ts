import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPeekGuardPoke } from './peekGuard';
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

  it('asks once a window has been quiet a moment: a drag across the screen is one request', async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => undefined);
    const p = createPeekGuardPoke(request, 800);
    for (let i = 0; i < 6; i++) {
      p.poke(); // the position poll, once a second while it moves… faster here
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(request).toHaveBeenCalledTimes(1);
    p.poke();
    await vi.advanceTimersByTimeAsync(900);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('a closed window asks no more; a failed request is nobody’s business', async () => {
    vi.useFakeTimers();
    const request = vi.fn(() => Promise.reject(new Error('no server')));
    const p = createPeekGuardPoke(request, 800);
    p.poke();
    await vi.advanceTimersByTimeAsync(900);
    expect(request).toHaveBeenCalledTimes(1); // rejected — and swallowed
    p.poke();
    p.stop();
    p.poke();
    await vi.advanceTimersByTimeAsync(2000);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
