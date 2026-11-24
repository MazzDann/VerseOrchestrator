import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { archiveIn, skipAsked } from './archive';
import { initUiState, operatorArchive, saveUiEntry } from './uiState';

describe('the archive as the server knows it (1.26.0-beta.2)', () => {
  it('reads it out of the settings kept in data/, again after a change', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-arch-'));
    try {
      initUiState(path.join(dir, 'ui-state.json'));
      expect(operatorArchive()).toEqual({ translations: [], bundles: [] });
      const save = (state: unknown, at: number) =>
        saveUiEntry('vo:settings', JSON.stringify({ state, version: 1 }), at);
      save({ archivedTranslations: ['KJV'], archivedBundles: ['Старе'] }, 1);
      expect(operatorArchive()).toEqual({ translations: ['KJV'], bundles: ['Старе'] });
      save({ archivedTranslations: [], archivedBundles: ['Старе', 'Ще'] }, 2);
      expect(operatorArchive()).toEqual({ translations: [], bundles: ['Старе', 'Ще'] });
    } finally {
      initUiState('');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('a broken or foreign state has none', () => {
    for (const bad of [
      undefined,
      '',
      '{',
      'null',
      '[]',
      '{"state":7}',
      '{"state":{"archivedBundles":"A"}}',
    ])
      expect(archiveIn(bad)).toEqual({ translations: [], bundles: [] });
    expect(archiveIn('{"state":{"archivedTranslations":["A",5,"",null]}}').translations).toEqual([
      'A',
    ]);
  });
  it('`skip` of a query: not said, none, some', () => {
    expect(skipAsked(undefined)).toBeNull();
    expect(skipAsked('')).toEqual([]);
    expect(skipAsked('[]')).toEqual([]);
    const many = Array.from({ length: 81 }, (_, n) => `T${n}'`);
    expect(skipAsked(JSON.stringify(many))).toEqual(many);
    expect(skipAsked(['KJV'])).toBeNull();
  });
});
