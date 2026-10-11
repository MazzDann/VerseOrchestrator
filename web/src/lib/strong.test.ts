import { describe, expect, it } from 'vitest';
import { parseStrongTokens } from './strong';

describe('parseStrongTokens', () => {
  it('attaches each Strong number to the word before it', () => {
    expect(parseStrongTokens('In<S>1722</S> the beginning<S>746</S>.')).toEqual([
      { text: 'In', strong: '1722' },
      { text: 'the beginning', strong: '746' },
      { text: '.', strong: null },
    ]);
  });

  it('gives a grammar code to the word its Strong number closed (1.16.0-beta.2)', () => {
    expect(
      parseStrongTokens('ἐγέννησεν<S>1080</S> <m>V-AAI-3S</m> τὸν<S>3588</S> <m>T-ASM</m>·'),
    ).toEqual([
      { text: 'ἐγέννησεν', strong: '1080', morph: 'V-AAI-3S' },
      { text: 'τὸν', strong: '3588', morph: 'T-ASM' },
      { text: '·', strong: null },
    ]);
  });

  it('keeps a word with a code but no number as its own word', () => {
    expect(
      parseStrongTokens(
        'αορατος <S>517</S> <m>A-NSM</m> και <S>2532</S> <m>CONJ</m> ακατασκευαστος <m>A-NSM</m> και <S>2532</S>',
      ),
    ).toEqual([
      { text: 'αορατος', strong: '517', morph: 'A-NSM' },
      { text: 'και', strong: '2532', morph: 'CONJ' },
      { text: 'ακατασκευαστος', strong: null, morph: 'A-NSM' },
      { text: 'και', strong: '2532' },
    ]);
  });

  it('a code before the number still leaves the number with the word', () => {
    expect(parseStrongTokens('λόγος <m>N-NSM</m><S>3056</S> καὶ')).toEqual([
      { text: 'λόγος', strong: '3056', morph: 'N-NSM' },
      { text: 'καὶ', strong: null },
    ]);
  });

  it('reads Hebrew with no spaces between the tags and drops other markup', () => {
    expect(
      parseStrongTokens(
        '<pb/>בְּ<S>9001</S><m>prep</m>רֵאשִׁ֖ית<S>7225</S><m>n.fs.a</m> <f>[1]</f>',
      ),
    ).toEqual([
      { text: 'בְּ', strong: '9001', morph: 'prep' },
      { text: 'רֵאשִׁ֖ית', strong: '7225', morph: 'n.fs.a' },
      { text: '[1]', strong: null },
    ]);
  });
});
