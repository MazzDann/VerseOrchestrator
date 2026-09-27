import { describe, expect, it } from 'vitest';
import type { Slide, SlideSource } from '../presenterBus';
import { planTakeover } from './takeover';

const verses: SlideSource = {
  kind: 'verses',
  translationIds: [3, 7],
  bookNumber: 500,
  chapter: 23,
  verses: [3],
  page: 0,
  reveal: 1,
};
const slide = (over: Partial<Slide> = {}): Slide => ({
  lines: [{ translationAbbr: 'UKR', text: '3 …', rtl: false }],
  reference: 'Івана 23:3',
  blank: false,
  visible: true,
  source: verses,
  ...over,
});

describe('planTakeover', () => {
  it('verses on screen: stand on them and keep projecting', () => {
    expect(planTakeover(slide())).toEqual({
      kind: 'verses',
      translationIds: [3, 7],
      bookNumber: 500,
      chapter: 23,
      verses: [3],
      page: 0,
      reveal: 1,
      live: true,
      override: null,
    });
  });

  it('keeps the page of a long passage and the reveal step', () => {
    const p = planTakeover(
      slide({ source: { ...verses, verses: [1, 2, 3, 4, 5, 6], page: 1, reveal: 2 } }),
    );
    expect(p).toMatchObject({ kind: 'verses', page: 1, reveal: 2 });
  });

  it('a darkened screen: stand on the verses, but not live', () => {
    expect(planTakeover(slide({ blank: true }))).toMatchObject({ kind: 'verses', live: false });
  });

  it('a Strong slide stays as it is until the next step', () => {
    const s = slide({ subline: 'λόγος — слово' });
    expect(planTakeover(s)).toMatchObject({ kind: 'verses', live: true, override: s });
  });

  it('a song stanza: open that song at that stanza', () => {
    const s = slide({ source: { kind: 'song', songId: 42, stanza: 2 } });
    expect(planTakeover(s)).toEqual({ kind: 'song', songId: 42, stanza: 2, override: s });
  });

  it('free text, black, empty, older slides without a source: nothing to stand on', () => {
    expect(planTakeover(slide({ source: undefined }))).toEqual({ kind: 'none' });
    expect(planTakeover(slide({ forceBlack: true, lines: [] }))).toEqual({ kind: 'none' });
    expect(planTakeover(slide({ visible: false, lines: [], source: undefined }))).toEqual({
      kind: 'none',
    });
    expect(
      planTakeover(slide({ blank: true, source: { kind: 'song', songId: 1, stanza: 0 } })),
    ).toEqual({ kind: 'none' });
  });
});
