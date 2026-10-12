import { describe, expect, it } from 'vitest';
import { cpuInfo, jobThreads } from './embedding.js';

describe('«Ядра процесора»', () => {
  it('leaves one core free; «Авто» is half, or the fast cores less one on Apple Silicon', () => {
    // the PC: 8 threads
    expect(cpuInfo(8, null)).toEqual({ all: 8, max: 7, auto: 4, fast: null });
    // a MacBook Air M4: 4 fast + 6 efficiency
    expect(cpuInfo(10, 4)).toEqual({ all: 10, max: 9, auto: 3, fast: 4 });
    // small ones
    expect(cpuInfo(2, null)).toEqual({ all: 2, max: 1, auto: 1, fast: null });
    expect(cpuInfo(1, null)).toEqual({ all: 1, max: 1, auto: 1, fast: null });
    expect(cpuInfo(4, 2).auto).toBe(2);
  });

  it('takes the chosen number within the limit, «Авто» for none', () => {
    const cpu = cpuInfo(8, null);
    expect(jobThreads(null, cpu)).toBe(4);
    expect(jobThreads(6, cpu)).toBe(6);
    expect(jobThreads(64, cpu)).toBe(7);
    expect(jobThreads(0, cpu)).toBe(1);
  });
});
