import { describe, expect, it } from 'vitest';
import { setFor, setStem } from './subheadingSets';

const sets = [{ abbr: 'KJV-s' }, { abbr: 'RST-п' }, { abbr: 'Хом-д' }, { abbr: 'Геце-д(у)' }];

describe('which section titles a translation shows (1.16.0-beta.3)', () => {
  it('reads a set name without its tail', () => {
    expect(['KJV-s', 'RST-п', 'Геце-д(у)', 'NTLH-pt-s'].map(setStem)).toEqual([
      'kjv',
      'rst',
      'геце',
      'ntlh-pt',
    ]);
  });

  it('the pick first, else the set named after the translation, else its own', () => {
    expect(setFor('KJV', {}, sets)).toBe('KJV-s');
    expect(setFor('UBIO', {}, sets)).toBe('');
    expect(setFor('UBIO', { UBIO: 'Хом-д' }, sets)).toBe('Хом-д');
    expect(setFor('KJV', { KJV: '' }, sets)).toBe(''); // its own, on purpose
    expect(setFor('UBIO', { UBIO: 'Gone-s' }, sets)).toBe(''); // a set no longer there
    expect(setFor('constructor', {}, sets)).toBe('');
  });
});
