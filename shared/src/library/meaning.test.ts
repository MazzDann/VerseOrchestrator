import { describe, expect, it } from 'vitest';
import {
  blendVectors,
  capitalizeWords,
  closenessOf,
  inQueryLanguage,
  meaningStems,
} from './meaning';

describe('how «~ …» ranks (1.16.0-beta.4)', () => {
  it('capitalizes every word: a lowercase name is no name to the model', () => {
    expect(capitalizeWords('павло повертається з афін')).toBe('Павло Повертається З Афін');
    expect(capitalizeWords('«ісус» ходить-по воді')).toBe('«Ісус» Ходить-По Воді');
    expect(capitalizeWords('Already Done')).toBe('Already Done');
  });

  it('tells the query’s language by its letters', () => {
    const uk = inQueryLanguage('любіть своїх ворогів');
    expect([uk('uk'), uk('ru'), uk('en')]).toEqual([true, false, false]);
    const ru = inQueryLanguage('любите врагов ваших, ибо'); // no Ukrainian or Russian-only letter
    expect([ru('uk'), ru('ru'), ru('en')]).toEqual([true, true, false]);
    expect(inQueryLanguage('объятия')('ru')).toBe(true);
    const en = inQueryLanguage('do not worry');
    expect([en('en'), en('de'), en('uk'), en('grc'), en('')]).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(inQueryLanguage('λογος')('grc')).toBe(true);
    expect(inQueryLanguage('123')('en')).toBe(false);
  });

  it('cuts the words to stems as the index has them', () => {
    expect(meaningStems('Павло повертається з Афін')).toEqual(['павло', 'повер', 'афін']);
    expect(meaningStems('Павла і Павлові')).toEqual(['павла', 'павло']);
    expect(meaningStems('"x" a1')).toEqual([]);
  });

  it('averages two query vectors and normalizes again', () => {
    const a = Int8Array.from([127, 0, 0]);
    const b = Int8Array.from([0, 127, 0]);
    expect([...blendVectors(a, b)]).toEqual([90, 90, 0]);
  });

  it('grades by the distance from the best', () => {
    expect([0, 0.05, 0.08, 0.12, 0.2].map((g) => closenessOf(g))).toEqual([3, 3, 2, 2, 1]);
    // a model whose scores lie closer: its own cut (1.16.0-beta.5)
    expect([0.04, 0.05, 0.1, 0.11].map((g) => closenessOf(g, 0.17))).toEqual([3, 2, 2, 1]);
  });
});
