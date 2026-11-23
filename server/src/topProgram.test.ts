import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bringTopFiles } from './topProgram.js';

describe('the program beside app/ after an update in parts (1.25.3)', () => {
  let top = '';
  afterEach(() => {
    if (top) fs.rmSync(top, { recursive: true, force: true });
  });

  it('is put there when missing or older, left alone when it is the same', () => {
    top = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-top-'));
    const app = path.join(top, 'app');
    fs.mkdirSync(path.join(app, 'top'), { recursive: true });
    expect(bringTopFiles(app)).toEqual([]);
    fs.writeFileSync(path.join(app, 'top', 'VerseOrchestrator.exe'), 'new');
    expect(bringTopFiles(app)).toEqual(['VerseOrchestrator.exe']);
    const at = path.join(top, 'VerseOrchestrator.exe');
    expect(fs.readFileSync(at, 'utf8')).toBe('new');
    expect(bringTopFiles(app)).toEqual([]);
    fs.writeFileSync(at, 'old');
    expect(bringTopFiles(app)).toEqual(['VerseOrchestrator.exe']);
    expect(fs.readdirSync(top).sort()).toEqual(['VerseOrchestrator.exe', 'app']);
    // a copy of another system carries none
    fs.rmSync(path.join(app, 'top'), { recursive: true });
    expect(bringTopFiles(app)).toEqual([]);
  });
});
