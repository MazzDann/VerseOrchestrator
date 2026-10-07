import { describe, expect, it } from 'vitest';
import { type SeqItem } from '../playlistStore';
import { type Slide } from '../presenterBus';
import { asksFor, atItemEdge, belongsTo, stillThere } from './orderFlow';

const slide = (o: Partial<Slide>): Slide =>
  ({ lines: [], reference: '', blank: false, visible: true, ...o }) as Slide;
const passage: SeqItem = {
  kind: 'passage',
  id: 'p',
  label: 'Ів 3:16-18',
  translationIds: [1],
  bookNumber: 500,
  chapter: 3,
  verses: [16, 17, 18],
};
const verses = (vs: number[], shown?: [number, number]) =>
  slide({
    source: {
      kind: 'verses',
      translationIds: [1],
      bookNumber: 500,
      chapter: 3,
      verses: vs,
      page: 0,
      reveal: 1,
      ...(shown ? { shown } : {}),
    },
  });

describe('«Далі» past a running-order item (1.10.0-beta.1)', () => {
  it('a passage belongs to the screen while its verses are there, and its edge is its last verse', () => {
    expect(belongsTo(passage, verses([16, 17, 18]))).toBe(true);
    expect(belongsTo(passage, verses([19]))).toBe(false); // the operator stepped on past it
    expect(atItemEdge(passage, verses([16, 17, 18]), 1)).toBe(true);
    expect(atItemEdge(passage, verses([16, 17, 18], [16, 17]), 1)).toBe(false); // a first page
    expect(atItemEdge(passage, verses([16, 17, 18], [16, 17]), -1)).toBe(true);
  });

  it('a text, a picture, a video are theirs by what the slide shows', () => {
    const text: SeqItem = { kind: 'text', id: 't', label: 'A', title: 'A ', body: 'Слово' };
    expect(
      belongsTo(
        text,
        slide({ lines: [{ translationAbbr: '', text: 'Слово', rtl: false }], reference: 'A' }),
      ),
    ).toBe(true);
    expect(
      belongsTo(
        text,
        slide({ lines: [{ translationAbbr: '', text: 'Інше', rtl: false }], reference: 'A' }),
      ),
    ).toBe(false);
    const image: SeqItem = {
      kind: 'image',
      id: 'i',
      label: 'i',
      imageId: 'x',
      src: '/a.jpg',
      small: '',
      fit: 'contain',
    };
    expect(
      belongsTo(image, slide({ picture: { src: '/a.jpg', small: '', name: 'i', fit: 'contain' } })),
    ).toBe(true);
  });

  it('each caller hands on only its own kind', () => {
    expect(asksFor(passage, { kind: 'verses', selected: [16], page: 0 })).toBe(true);
    expect(asksFor(passage, { kind: 'slide' })).toBe(false);
    const song: SeqItem = { kind: 'song', id: 's', label: '№1', songId: 7, faithful: true };
    expect(asksFor(song, { kind: 'song', songId: 7 })).toBe(true);
    expect(asksFor(song, { kind: 'song', songId: 8 })).toBe(false);
  });
});

describe('the step runs on what the operator sees (1.10.0-beta.1 review)', () => {
  it('a passage: the preview moved past it — not the item’s edge any more', () => {
    const live = verses([16, 17, 18]);
    expect(stillThere(passage, live, { kind: 'verses', selected: [16, 17, 18], page: 0 })).toBe(
      true,
    );
    expect(stillThere(passage, live, { kind: 'verses', selected: [20], page: 0 })).toBe(false);
    expect(stillThere(passage, live, { kind: 'verses', selected: [16, 17, 18], page: 1 })).toBe(
      false,
    );
  });
  it('a song: its stanza or the empty «Кінець»; something else on screen — not', () => {
    const song: SeqItem = { kind: 'song', id: 's', label: '№1', songId: 7, faithful: true };
    const from = { kind: 'song' as const, songId: 7 };
    expect(stillThere(song, slide({ source: { kind: 'song', songId: 7, stanza: 2 } }), from)).toBe(
      true,
    );
    expect(stillThere(song, slide({}), from)).toBe(true);
    expect(stillThere(song, verses([16]), from)).toBe(false);
  });
});
