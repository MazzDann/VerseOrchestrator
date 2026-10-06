import type { Slide } from '../presenterBus';

/**
 * What a control window does with the screen it takes over (0.5.10). Before, the new
 * leader kept its own old selection: the screen showed Ів 23:3 (led by the other window),
 * «Далі» + «На екран» here gave 23:6 — this window's stale selection plus one. Now it
 * stands on what is on screen, so the show continues from there.
 */
export type Takeover =
  | {
      kind: 'verses';
      translationIds: number[];
      bookNumber: number;
      chapter: number;
      verses: number[];
      page: number;
      reveal: number;
      /** projecting (live-follow continues); false for a darkened screen */
      live: boolean;
      /** a slide the verses don't rebuild (a Strong subline) stays until the next step */
      override: Slide | null;
    }
  | { kind: 'song'; songId: number; stanza: number; override: Slide }
  /** an album's photo (1.8.12): open that album at that photo; the slideshow's timer stays off */
  | { kind: 'album'; albumId: string; index: number; name: string; override: Slide }
  /** a video (1.8.12-beta.3): its controls open; it plays on by its clock, the sound moves here */
  | { kind: 'video'; videoId: string; override: Slide }
  /** free text / black / empty: nothing to stand on — keep the selection */
  | { kind: 'none' };

export function planTakeover(screen: Slide): Takeover {
  // the viewers' QR or «Заставка» over verses (1.4.2): stand on the verses it covers, but
  // not live — the screen stays as it is until «Прибрати QR» / L gives them back, and the
  // show goes on from there (a song under it: nothing to stand on, as before)
  if ((screen.qr || screen.cover) && screen.returnTo) {
    const under = planTakeover(screen.returnTo);
    return under.kind === 'verses' ? { ...under, live: false, override: null } : { kind: 'none' };
  }
  const src = screen.source;
  const showing = screen.visible && !screen.blank && !screen.forceBlack && screen.lines.length > 0;
  if (src?.kind === 'verses' && src.verses.length > 0 && !screen.forceBlack) {
    return {
      kind: 'verses',
      translationIds: src.translationIds,
      bookNumber: src.bookNumber,
      chapter: src.chapter,
      verses: src.verses,
      page: Math.max(0, src.page),
      reveal: Math.max(1, src.reveal),
      live: showing,
      override: showing && screen.subline ? screen : null,
    };
  }
  if (src?.kind === 'song' && showing) {
    return { kind: 'song', songId: src.songId, stanza: src.stanza, override: screen };
  }
  // a photo has no lines: on screen = visible, not hidden, not black (a window of another
  // version may send anything as the place: only a real one is taken)
  if (
    src?.kind === 'album' &&
    screen.picture &&
    screen.visible &&
    !screen.blank &&
    !screen.forceBlack &&
    typeof src.albumId === 'string' &&
    Number.isInteger(src.index) &&
    src.index >= 0
  ) {
    return {
      kind: 'album',
      albumId: src.albumId,
      index: src.index,
      name: typeof src.name === 'string' ? src.name : '',
      override: screen,
    };
  }
  if (src?.kind === 'video' && screen.video && typeof src.videoId === 'string') {
    return { kind: 'video', videoId: src.videoId, override: screen };
  }
  return { kind: 'none' };
}
