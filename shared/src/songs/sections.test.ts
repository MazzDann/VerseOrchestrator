import { describe, expect, it } from 'vitest';
import { nextChorus, songParts } from './sections.js';

// Slides as the song panel gets them; «T» is the title slide.
const C = (words: string, label = 'Приспів:') => `${label}\n${words}`;

describe('the parts of a song (1.3.0)', () => {
  it('title, then verses counted among themselves; a chorus by its label', () => {
    const parts = songParts(['T', 'v one', C('la la'), 'v two', C('la la'), 'v three', C('la la')]);
    expect(parts).toEqual([
      { kind: 'title' },
      { kind: 'verse', verse: 1 },
      { kind: 'chorus', start: 2 },
      { kind: 'verse', verse: 2 },
      { kind: 'chorus', start: 4 },
      { kind: 'verse', verse: 3 },
      { kind: 'chorus', start: 6 },
    ]);
  });

  it('no chorus: every slide after the title is a verse', () => {
    expect(songParts(['T', 'a', 'b']).map((p) => p.kind)).toEqual(['title', 'verse', 'verse']);
    expect(nextChorus(songParts(['T', 'a', 'b']), 1)).toBeNull();
  });

  it('an unlabelled slide with a labelled chorus’s words is that chorus', () => {
    const parts = songParts(['T', 'v one', C('la la'), 'v two', 'la  la']);
    expect(parts[4]).toEqual({ kind: 'chorus', start: 4 });
  });

  it('different choruses are variants; a label that says more names it', () => {
    const parts = songParts([
      'T',
      'v one',
      C('first'),
      'v two',
      C('first'),
      'v three',
      C('last one', 'Приспів (до 5-го куплету):'),
    ]);
    expect(parts[2]).toEqual({ kind: 'chorus', start: 2, variant: 1 });
    expect(parts[4]).toEqual({ kind: 'chorus', start: 4, variant: 1 });
    expect(parts[6]).toEqual({
      kind: 'chorus',
      start: 6,
      variant: 2,
      name: 'Приспів (до 5-го куплету)',
    });
  });

  it('a chorus over two slides in a row is one chorus in parts', () => {
    const parts = songParts(['T', 'v one', C('a'), C('b'), 'v two', C('a'), C('b')]);
    expect(parts[2]).toEqual({ kind: 'chorus', start: 2, part: 1, parts: 2 });
    expect(parts[3]).toEqual({ kind: 'chorus', start: 2, part: 2, parts: 2 });
    expect(parts[6]).toEqual({ kind: 'chorus', start: 5, part: 2, parts: 2 });
    // from its second slide «До приспіву» goes past all of it
    expect(nextChorus(parts, 3)).toBe(5);
    expect(nextChorus(parts, 2)).toBe(5);
  });

  it('other languages’ labels, any case', () => {
    expect(songParts(['T', 'Chorus\nyes', 'REFRAIN:\nno', 'Припев:\nда'])[1].kind).toBe('chorus');
    expect(songParts(['T', 'Приспівуючи йшли', 'Choruses'])[1].kind).toBe('verse');
    expect(songParts(['T', 'Приспівуючи йшли', 'Choruses'])[2].kind).toBe('verse');
  });
});

describe('«До приспіву»', () => {
  const parts = songParts(['T', 'v one', C('la'), 'v two', C('la'), 'v three', C('la')]);

  it('goes to the next chorus', () => {
    expect(nextChorus(parts, null)).toBe(2);
    expect(nextChorus(parts, 0)).toBe(2);
    expect(nextChorus(parts, 1)).toBe(2);
    expect(nextChorus(parts, 2)).toBe(4);
    expect(nextChorus(parts, 5)).toBe(6);
  });

  it('the last chorus: nothing after it', () => {
    expect(nextChorus(parts, 6)).toBeNull();
    // past the end (the empty slide after the song): the last chorus
    expect(nextChorus(parts, 7)).toBe(6);
  });

  it('a chorus written once: from a later verse, back to it', () => {
    const once = songParts(['T', 'v one', C('la'), 'v two', 'v three']);
    expect(nextChorus(once, 3)).toBe(2);
    expect(nextChorus(once, 4)).toBe(2);
    expect(nextChorus(once, 2)).toBeNull();
  });

  it('the part of a chorus that isn’t its start, with none after: its start', () => {
    const two = songParts(['T', 'v one', C('a'), C('b')]);
    expect(nextChorus(two, 3)).toBe(2);
  });
});
