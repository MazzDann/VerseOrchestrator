import { describe, expect, it } from 'vitest';
import type { CatalogRow, ModulesInfo } from '../api';
import { filterRows, langName, languagesOf, moduleFileName, moduleState, percent } from './catalog';

const row = (fil: string, kind: CatalogRow['kind'], lang: string, title = fil): CatalogRow => ({
  fil,
  abbr: fil.replace(/\..*$/, ''),
  kind,
  lang,
  title,
  size: 1,
  updated: '',
});

const ROWS = [
  row("UBIO'62", 'bibles', 'uk', 'Біблія в пер. Івана Огієнка'),
  row('KJV+', 'bibles', 'en', 'King James Version'),
  row('NIV', 'bibles', 'en', 'New International Version'),
  row('Strong.dictionary', 'dictionaries', 'en', 'Strong'),
];

describe('the module catalog', () => {
  it('names files as the server keeps them', () => {
    expect(moduleFileName('KJV+', 'bibles')).toBe('KJV+.SQLite3');
    expect(moduleFileName('Strong.dictionary', 'dictionaries')).toBe('Strong.dictionary.SQLite3');
  });

  it('tells what is in the library, in the folder, or not here', () => {
    const info: ModulesInfo = {
      dir: 'modules',
      files: {
        bibles: ['kjv+.SQLite3', "UBIO'62.SQLite3"],
        dictionaries: ['Strong.dictionary.SQLite3'],
      },
      selection: {
        bibles: ["UBIO'62.SQLite3"],
        dictionaries: null,
        commentaries: [],
        crossreferences: [],
      },
    };
    expect(ROWS.map((r) => moduleState(r, info))).toEqual(['library', 'folder', 'none', 'library']);
    expect(moduleState(ROWS[0], undefined)).toBe('none');
  });

  it('filters by kind, language and every word', () => {
    expect(filterRows(ROWS, { kind: 'bibles', lang: '', query: '' }).map((r) => r.fil)).toEqual([
      'KJV+',
      'NIV',
      "UBIO'62",
    ]);
    expect(
      filterRows(ROWS, { kind: 'bibles', lang: 'en', query: 'version king' }).map((r) => r.fil),
    ).toEqual(['KJV+']);
    expect(filterRows(ROWS, { kind: 'bibles', lang: '', query: 'огієнка' })).toHaveLength(1);
  });

  it('lists languages with the interface one first', () => {
    expect(languagesOf(ROWS, 'bibles', 'uk')).toEqual([
      { code: 'uk', n: 1 },
      { code: 'en', n: 2 },
    ]);
    expect(languagesOf(ROWS, 'bibles', 'de')[0]).toEqual({ code: 'en', n: 2 });
  });

  it('names languages, and keeps a code it cannot name', () => {
    expect(langName('uk', 'uk')).toBe('Українська');
    expect(langName('iw', 'en')).toBe('Hebrew');
    expect(langName('zh Simplified', 'en')).toBe('Chinese Simplified');
    expect(langName('1 x', 'en')).toBe('1 x'); // not a language tag
  });

  it('counts a download in percent', () => {
    expect(percent({ fil: 'a', abbr: 'a', phase: 'downloading', got: 50, total: 200 })).toBe(25);
    expect(percent({ fil: 'a', abbr: 'a', phase: 'downloading', got: 5, total: 0 })).toBe(0);
  });
});
