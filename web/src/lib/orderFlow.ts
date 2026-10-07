import { type SeqItem } from '../playlistStore';
import { type Slide } from '../presenterBus';
import { type Outcome } from './commands';

/**
 * «Після кінця пункту «Далі» відкриває наступний» (1.10.0-beta.1, the author's call: a switch, off by
 * default). Who asks: the verse steps (`slide` — a text, a picture, a video item on screen; `verses` — a
 * passage item at its last page / reveal step), a song at «Кінець» or its first stanza, an album at
 * its last / first photo. The answer: the next / previous item (a step taken), or null — the step
 * is the item's own as before.
 */
export type PastFrom =
  | { kind: 'slide' }
  /** the preview's selection and page — the step itself runs on them, not on the screen */
  | { kind: 'verses'; selected: number[]; page: number }
  | { kind: 'song'; songId: number }
  | { kind: 'album'; albumId: string };
export type PastItem = (delta: 1 | -1, from: PastFrom) => Outcome | null;

/** Does the screen still show this item — not something the operator put there since? */
export function belongsTo(it: SeqItem, slide: Slide): boolean {
  const src = slide.source;
  if (it.kind === 'passage')
    return (
      src?.kind === 'verses' &&
      src.bookNumber === it.bookNumber &&
      src.chapter === it.chapter &&
      src.verses.length > 0 &&
      src.verses.every((v) => it.verses.includes(v))
    );
  if (it.kind === 'song') return src?.kind === 'song' && src.songId === it.songId;
  if (it.kind === 'album') return src?.kind === 'album' && src.albumId === it.albumId;
  if (it.kind === 'video') return src?.kind === 'video' && src.videoId === it.videoId;
  if (it.kind === 'image') return !!slide.picture && slide.picture.src === it.src;
  if (it.kind === 'text')
    return (
      !src &&
      !slide.picture &&
      !slide.video &&
      slide.lines[0]?.text === it.body &&
      slide.reference === it.title.trim()
    );
  return false;
}

/** At the item's edge that way? A passage by the verses on screen against the item's own. */
export function atItemEdge(it: SeqItem, slide: Slide, delta: 1 | -1): boolean {
  if (it.kind !== 'passage') return true;
  const src = slide.source;
  if (src?.kind !== 'verses' || src.verses.length === 0) return false;
  // a page of a long selection: the page's own verses
  const [first, last] = src.shown ?? [Math.min(...src.verses), Math.max(...src.verses)];
  return delta > 0 ? last >= Math.max(...it.verses) : first <= Math.min(...it.verses);
}

/**
 * The screen still shows the item the caller is at: a passage — and the preview agrees (live-follow
 * off, a held screen: the step runs on the preview's verses and page); a song — its stanza or the
 * empty «Кінець» after it; an album — its photo (1.10.0-beta.1 review).
 */
export function stillThere(it: SeqItem, slide: Slide, from: PastFrom): boolean {
  if (from.kind === 'song') {
    if (slide.source?.kind === 'song') return slide.source.songId === from.songId;
    return !slide.source && slide.lines.length === 0 && !slide.picture && !slide.video;
  }
  if (!belongsTo(it, slide)) return false;
  if (from.kind !== 'verses' || it.kind !== 'passage') return true;
  const src = slide.source;
  return (
    src?.kind === 'verses' &&
    src.page === from.page &&
    from.selected.length > 0 &&
    from.selected.every((v) => it.verses.includes(v))
  );
}

/** Which callers may hand which kinds on: each kind has one place where its steps end. */
export function asksFor(it: SeqItem, from: PastFrom): boolean {
  if (from.kind === 'slide')
    return it.kind === 'text' || it.kind === 'image' || it.kind === 'video';
  if (from.kind === 'verses') return it.kind === 'passage';
  if (from.kind === 'song') return it.kind === 'song' && it.songId === from.songId;
  return it.kind === 'album' && it.albumId === from.albumId;
}
