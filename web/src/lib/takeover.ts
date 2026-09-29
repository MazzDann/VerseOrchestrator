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
  /** free text / black / empty: nothing to stand on — keep the selection */
  | { kind: 'none' };

export function planTakeover(screen: Slide): Takeover {
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
  return { kind: 'none' };
}
