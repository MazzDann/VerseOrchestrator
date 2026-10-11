import { describe, expect, it } from 'vitest';
import { explainMorphology, morphologyKeys, type MorphologyCandidate } from './morphology';
import { readMorphology } from './module';

const row = (indication: string, meaning: string, applicableTo = '', dictionary = 'Strong') =>
  ({ dictionary, indication, applicableTo, meaning }) satisfies MorphologyCandidate;

describe('grammar codes (1.16.0-beta.2)', () => {
  it('looks up the code, its Hebrew form, the head and each part', () => {
    expect(morphologyKeys('V-AAI-3S')).toEqual(['V-AAI-3S', 'HV-AAI-3S', 'V', '-AAI', '-3S']);
    expect(morphologyKeys('CONJ')).toEqual(['CONJ', 'HCONJ']);
  });

  it('a whole code first, else the head and its parts; a part for this head over one for any', () => {
    const rows = [
      row('N-PRI', 'Indeclinable Proper Name'),
      row('N', 'Noun'),
      row('V', 'Verb'),
      row('-AAI', 'Aor Act Ind', 'V'),
      row('-3S', '3rd Sing'),
      row('-3S', '3 person sing (verb)', 'V'),
      row('V', 'глаг.', '', 'Strong-pl'),
    ];
    expect(explainMorphology('N-PRI', rows)).toEqual([
      { dictionary: 'Strong', meaning: 'Indeclinable Proper Name' },
    ]);
    expect(explainMorphology('V-AAI-3S', rows)).toEqual([
      { dictionary: 'Strong', meaning: 'Verb · Aor Act Ind · 3 person sing (verb)' },
      { dictionary: 'Strong-pl', meaning: 'глаг. · AAI · 3S' },
    ]);
    // «-AAI» is for verbs only: a noun keeps the part as written
    expect(explainMorphology('N-AAI', rows)).toEqual([
      { dictionary: 'Strong', meaning: 'Noun · AAI' },
    ]);
    expect(explainMorphology('HVqp3ms', [row('HVqp3ms', 'Hebrew: Verb')])).toEqual([
      { dictionary: 'Strong', meaning: 'Hebrew: Verb' },
    ]);
    expect(explainMorphology('Vqp3ms', [row('HVqp3ms', 'Hebrew: Verb')])).toEqual([
      { dictionary: 'Strong', meaning: 'Hebrew: Verb' },
    ]);
    expect(explainMorphology('n.fs.a', rows)).toEqual([]);
  });

  it('reads a dictionary’s table: markup stripped, empty and repeated rows left out, a broken table skipped', () => {
    const rows = [
      { indication: 'V', applicable_to: null, meaning: '<b>Verb</b>' },
      { indication: 'V', applicable_to: '', meaning: 'again' },
      { indication: '-AAI', applicable_to: 'V', meaning: 'Aor Act Ind' },
      { indication: '', applicable_to: null, meaning: 'no code' },
      { indication: 'X', applicable_to: null, meaning: '  ' },
    ];
    expect(readMorphology(() => rows, ['dictionary', 'morphology_indications'])).toEqual([
      { indication: 'V', applicableTo: '', meaning: 'Verb' },
      { indication: '-AAI', applicableTo: 'V', meaning: 'Aor Act Ind' },
    ]);
    expect(readMorphology(() => rows, ['dictionary'])).toEqual([]);
    expect(
      readMorphology(() => {
        throw new Error('no such column');
      }, ['morphology_indications']),
    ).toEqual([]);
  });
});
