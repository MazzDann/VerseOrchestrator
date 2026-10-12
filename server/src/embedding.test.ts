import { describe, expect, it } from 'vitest';
import { coreLimit, cpuInfo } from './embedding.js';

describe('«Ядра процесора»', () => {
  it('leaves one core free', () => {
    expect(cpuInfo(8)).toEqual({ all: 8, max: 7 });
    expect(cpuInfo(10)).toEqual({ all: 10, max: 9 });
    expect(cpuInfo(1)).toEqual({ all: 1, max: 1 });
  });

  it('a limit within this computer’s, all it may take for none', () => {
    const cpu = cpuInfo(8);
    expect(coreLimit(null, cpu)).toBe(7);
    expect(coreLimit(3, cpu)).toBe(3);
    expect(coreLimit(64, cpu)).toBe(7);
    expect(coreLimit(0, cpu)).toBe(1);
  });
});
