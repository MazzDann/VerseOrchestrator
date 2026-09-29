import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getUiState, initUiState, isUiKey, saveUiEntry } from './uiState';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('UI state in data/ (0.7.4)', () => {
  it('keeps the latest save of each key, in one file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-ui-'));
    dirs.push(dir);
    const file = path.join(dir, 'data', 'ui-state.json');
    initUiState(file);
    expect(getUiState()).toEqual({}); // nothing saved yet
    expect(saveUiEntry('vo:settings', '{"a":1}', 1000)).toEqual({
      saved: true,
      entry: { value: '{"a":1}', at: 1000 },
    });
    saveUiEntry('vo:playlist', '{"items":[]}', 1100);
    // a save that happened earlier elsewhere doesn't overwrite a later one
    expect(saveUiEntry('vo:settings', '{"a":0}', 900)).toEqual({
      saved: false,
      entry: { value: '{"a":1}', at: 1000 },
    });
    expect(saveUiEntry('vo:settings', '{"a":2}', 1200).saved).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
      'vo:settings': { value: '{"a":2}', at: 1200 },
      'vo:playlist': { value: '{"items":[]}', at: 1100 },
    });
  });

  it('accepts only the stores it keeps', () => {
    expect(isUiKey('vo:settings')).toBe(true);
    expect(isUiKey('vo:selection')).toBe(false); // navigation stays per window
    expect(isUiKey(undefined)).toBe(false);
  });
});
