import { describe, expect, it } from 'vitest';
import type { ModulesInfo } from '../api';
import { inLibrary, langName } from './modules';

describe('modules', () => {
  it('tells what the library takes', () => {
    const info: ModulesInfo = {
      dir: 'modules',
      files: {
        bibles: ['kjv+.SQLite3', "UBIO'62.SQLite3"],
        dictionaries: ['S.dictionary.SQLite3'],
      },
      selection: {
        bibles: ["UBIO'62.SQLite3"],
        dictionaries: null,
        commentaries: [],
        crossreferences: [],
      },
    };
    expect(inLibrary(info, 'bibles', "ubio'62.sqlite3")).toBe(true);
    expect(inLibrary(info, 'bibles', 'kjv+.SQLite3')).toBe(false);
    expect(inLibrary(info, 'dictionaries', 'S.dictionary.SQLite3')).toBe(true); // «all»
    expect(inLibrary({ ...info, selection: null }, 'bibles', 'x.SQLite3')).toBe(true);
  });

  it('names languages, and keeps a code it cannot name', () => {
    expect(langName('uk', 'uk')).toBe('Українська');
    expect(langName('iw', 'en')).toBe('Hebrew');
    expect(langName('zh Simplified', 'en')).toBe('Chinese Simplified');
    expect(langName('1 x', 'en')).toBe('1 x'); // not a language tag
  });
});
