import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { type QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type Book, type Translation, type Verse } from '../../api';
import { type Appearance } from '../../settingsStore';
import { type SeqPassage } from '../../playlistStore';
import {
  type Slide,
  type SlideLine,
  type SlideReveal,
  type SlideSource,
  type SlideStyle,
  type SlideTemplate,
} from '../../presenterBus';
import { formatReference } from '../../lib/reference';
import {
  chapterName,
  crossTarget,
  edgeNotice,
  landingVerse,
  pressAtEdge,
  translationEdge,
  type CrossArm,
} from '../../lib/chapterCross';
import { type Outcome } from '../../lib/commands';
import { tr } from '../../i18n';
import { joinVerses, numbersOn, strongHighlightSegments } from './slideText';
import { standbyNotice } from './standby';
import { type PastItem } from '../../lib/orderFlow';
import { noticeOnce } from '../../lib/noticeOnce';
import { type PickWalk, walkStep } from '../../lib/pickWalk';

/**
 * The steps of the show (vo-sync): the verse selection on screen («На екран», Enter on a verse,
 * a Strong slide), live-follow, and one step forward or back — reveal → page → verse → across a
 * chapter's or book's edge (two presses). A pick collected with Ctrl / ⌘ / Shift waits in the
 * preview for Enter (1.13.0-beta.1) and «Далі» walks it. Effects: E9 (a held screen let go when
 * «Наживо» switches), E11 (live-follow), E12 (the preview back to the verses on navigation), E16
 * (the reveal back to its first step).
 */
export function useShowSteps({
  liveFollow,
  live,
  adopting,
  slideLines,
  pageReference,
  slideStyle,
  slideTemplate,
  revealForSlide,
  verseSource,
  pushLive,
  setLive,
  setPreviewOverride,
  translations,
  primaryId,
  selectedPrimaryVerses,
  pageVerses,
  appearance,
  reference,
  previewOverride,
  revealCount,
  selectedVerses,
  bookNumber,
  chapter,
  primaryVerses,
  setSelectedVerses,
  toggleVerse,
  pickBeforeEnter,
  chapters,
  books,
  queryClient,
  currentBook,
  activatePassage,
  selectedIds,
  selectBook,
  selectChapter,
  setScrollTarget,
  revealUnits,
  setRevealCount,
  pageCount,
  safePageIndex,
  setPageIndex,
  leaderRef,
  buildLines,
  pastItemRef,
}: {
  liveFollow: boolean;
  live: boolean;
  adopting: MutableRefObject<{
    key: string;
    page: number;
    reveal: number;
    override: Slide | null;
  } | null>;
  slideLines: SlideLine[];
  pageReference: string;
  slideStyle: SlideStyle;
  slideTemplate: SlideTemplate | null;
  revealForSlide: SlideReveal | undefined;
  verseSource: (verses?: number[], page?: number, reveal?: number) => SlideSource | undefined;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
  setLive: (live: boolean) => void;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
  translations: Translation[];
  primaryId: number | null;
  selectedPrimaryVerses: Verse[];
  pageVerses: number[];
  appearance: Appearance;
  reference: string;
  previewOverride: Slide | null;
  revealCount: number;
  selectedVerses: number[];
  bookNumber: number | null;
  chapter: number | null;
  primaryVerses: Verse[];
  setSelectedVerses: (verses: number[]) => void;
  toggleVerse: (verse: number) => void;
  /** «Кілька віршів — на екран після Enter» (1.13.0-beta.1) */
  pickBeforeEnter: boolean;
  chapters: number[];
  books: Book[];
  queryClient: QueryClient;
  currentBook: Book | null;
  activatePassage: (it: SeqPassage) => Promise<void>;
  selectedIds: number[];
  selectBook: (bookNumber: number) => void;
  selectChapter: (chapter: number) => void;
  setScrollTarget: (verse: number | null) => void;
  revealUnits: string[] | null;
  setRevealCount: Dispatch<SetStateAction<number>>;
  pageCount: number;
  safePageIndex: number;
  setPageIndex: Dispatch<SetStateAction<number>>;
  leaderRef: MutableRefObject<boolean>;
  buildLines: (verseNums: number[]) => SlideLine[];
  /** the running order's answer past an item's end (useRunningOrder, 1.10.0-beta.1) */
  pastItemRef: MutableRefObject<PastItem | null>;
}) {
  /**
   * «Прев’ю: далі / назад» (Alt+arrows, 1.1.0): the preview walked ahead and the screen stays,
   * though «Наживо» is on — until «На екран», a plain step, or «Наживо» switched.
   */
  /**
   * …and a pick being collected (1.13.0-beta.1, users' report F1010-05: «перед тим ще ентер
   * натиснути»): verses added with Ctrl / ⌘ / Shift gather in the preview until Enter, «На екран»
   * or «Далі» shows them together.
   */
  const walkKey = `${primaryId}:${bookNumber}:${chapter}`;
  // a pick belongs to its chapter: another chapter, book or main translation lets it go (review)
  const [held, setHeld] = useState<{ kind: 'preview' | 'pick'; key: string } | null>(null);
  const hold = held && (held.kind === 'preview' || held.key === walkKey) ? held.kind : null;
  const setHold = (kind: 'preview' | 'pick' | null) =>
    setHeld(kind ? { kind, key: walkKey } : null);
  const screenHeld = hold !== null;
  useEffect(() => setHeld(null), [liveFollow]);
  /**
   * The pick collected last (Ctrl / ⌘ / Shift) and the one «Далі» walks once it is on screen: all
   * together, one by one, then on after the last (1.13.0-beta.1).
   */
  const picked = useRef<PickWalk | null>(null);
  const walk = useRef<PickWalk | null>(null);
  const isPicked = (verses: number[]) => {
    const p = picked.current;
    return (
      !!p &&
      p.key === walkKey &&
      verses.length > 1 &&
      p.verses.length === verses.length &&
      p.verses.every((v, i) => v === verses[i])
    );
  };

  const send = (overrides?: Partial<Slide>) => {
    // a collected pick goes on screen: «Далі» walks it from here
    if (!overrides && isPicked(selectedVerses)) {
      walk.current = { key: walkKey, verses: selectedVerses };
    }
    const slide: Slide = {
      lines: slideLines,
      reference: pageReference,
      blank: false,
      visible: slideLines.length > 0,
      style: slideStyle,
      template: slideTemplate,
      reveal: revealForSlide,
      source: verseSource(),
      ...overrides,
    };
    pushLive(slide);
    setLive(slide.visible && !slide.blank);
    // Projecting the verse selection ends any song/text/Strong override, so the
    // preview and live-follow track the verses again (no preview/screen desync).
    setPreviewOverride(null);
    setHold(null); // the screen shows the preview: it follows again
  };

  /** Ctrl / ⌘ + a verse: in or out of the pick — held in the preview while the screen follows. */
  const pickVerse = (verse: number) => {
    holdPick();
    walk.current = null;
    const next = selectedVerses.includes(verse)
      ? selectedVerses.filter((v) => v !== verse)
      : [...selectedVerses, verse].sort((a, b) => a - b);
    picked.current = { key: walkKey, verses: next };
    toggleVerse(verse);
  };
  /** Shift + a verse: the pick becomes this range (or grows by it with Ctrl too). */
  const pickVerses = (verses: number[]) => {
    holdPick();
    walk.current = null;
    const next = [...new Set(verses)].sort((a, b) => a - b);
    picked.current = { key: walkKey, verses: next };
    setSelectedVerses(next);
  };
  /** A plain click: one verse, and the screen follows it again. */
  const selectVerses = (verses: number[]) => {
    if (hold === 'pick') setHold(null);
    // a plain click starts afresh: no walk through an earlier pick (review)
    picked.current = null;
    walk.current = null;
    setSelectedVerses(verses);
  };
  const holdPick = () => {
    if (!pickBeforeEnter || !liveFollow || !live || hold === 'pick') return;
    setHold('pick');
    notifications.show({
      id: 'screen-held',
      message: tr('Вірші збираються в прев’ю. Показати — Enter або «На екран».'),
      color: 'cue',
      autoClose: 3000,
    });
  };

  // Project the Strong-bearing (primary) translation only, with a "word — gloss"
  // subline. Used contextually from the Strong tab; normal navigation reverts it.
  // Scoped to the current page (like `send`/preview) so it stays WYSIWYG when a long
  // passage is split across slides.
  const projectStrong = (subline: string, strong: string) => {
    const t = translations.find((x) => x.id === primaryId);
    const pageStrongVerses = selectedPrimaryVerses.filter((v) => pageVerses.includes(v.verse));
    const num = numbersOn(appearance.verseNumbers, pageVerses.length);
    const text = joinVerses(pageStrongVerses, pageVerses, num);
    if (!text.trim()) return;
    const segments = strongHighlightSegments(pageStrongVerses, pageVerses, num, strong);
    const slide: Slide = {
      lines: [{ translationAbbr: t?.abbr ?? '', text, rtl: !!t?.rtl, segments }],
      reference: pageReference,
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
      subline,
      source: verseSource(),
    };
    pushLive(slide);
    setPreviewOverride(slide);
    setLive(true);
    notifications.show({
      message: tr('На екрані зі Стронгом: {ref}', { ref: pageReference }),
      color: 'live',
      autoClose: 1500,
    });
  };

  // While following live, republish when the selection, reference, or appearance
  // changes. With follow off, navigation only updates the preview — push with F5/F2.
  // Skip while a song/text/Strong projection (`previewOverride`) owns the screen, or
  // live-follow would clobber it back to the verse selection on the next render
  // (slideLines gets a fresh identity every render via useQueries). Navigating the
  // verses clears the override, after which live-follow resumes.
  useEffect(() => {
    if (adopting.current) return; // taking over: the screen stays until page/reveal are set
    if (liveFollow && live && !screenHeld && slideLines.length > 0 && !previewOverride) send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slideLines,
    reference,
    slideStyle,
    slideTemplate,
    liveFollow,
    screenHeld,
    previewOverride,
    revealCount,
    appearance.reveal,
    appearance.revealSpotlight,
    appearance.revealPlaceholders,
  ]);

  // A song/text/Strong projection takes over the preview; navigating the verse
  // selection reverts the preview to the verses.
  useEffect(() => {
    setPreviewOverride(null);
    // deps as they were in Control, where the rule knew the setter as stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVerses, bookNumber, chapter, primaryId]);

  const stepVerse = (
    delta: number,
    previewOnly = false,
    held = false,
  ): Outcome | Promise<Outcome> => {
    if (primaryVerses.length === 0) return { ok: false, reason: tr('Спершу виберіть розділ') };
    // a pick shown together: its verses one by one, then on after the last (1.13.0-beta.1)
    const w = walk.current;
    const inWalk = w && w.key === walkKey ? walkStep(w, selectedVerses, delta) : null;
    if (inWalk) {
      crossArm.current = null;
      setSelectedVerses(inWalk);
      return { ok: true };
    }
    walk.current = null;
    const all = primaryVerses.map((v) => v.verse);
    const current = selectedVerses.length ? selectedVerses[selectedVerses.length - 1] : all[0] - 1;
    const idx = all.indexOf(current);
    const next = all[Math.min(all.length - 1, Math.max(0, idx + delta))];
    if (next == null || next === current) return crossChapter(delta, previewOnly, held);
    crossArm.current = null;
    setSelectedVerses([next]);
    return { ok: true };
  };

  // At the chapter's edge (0.6.23): the first press says where a second one goes; pressed
  // again within 5 s it opens the next chapter's first verse (the previous one's last going
  // back) — on screen too when the screen follows the selection. At a book's edge the same
  // two presses open the next book (1.4.0).
  const crossArm = useRef<CrossArm | null>(null);
  const crossChapter = async (
    delta: number,
    previewOnly = false,
    held = false,
  ): Promise<Outcome> => {
    if (primaryId == null || bookNumber == null || chapter == null) {
      return { ok: false, reason: tr('Спершу виберіть розділ') };
    }
    const tid = primaryId;
    const book = bookNumber;
    // armed before anything loads, so a quick second press still counts as the second
    const key = `${tid}:${book}:${chapter}:${delta > 0 ? 1 : -1}`;
    const press = pressAtEdge(crossArm.current, key, Date.now(), held);
    crossArm.current = press.arm;
    const onScreen = !previewOnly && liveFollow && live && !previewOverride;
    const target = await crossTarget(
      { book, chapter },
      chapters,
      books.map((b) => b.bookNumber),
      delta,
      (b) =>
        queryClient.fetchQuery({
          queryKey: ['chapters', tid, b],
          queryFn: () => api.chapters(tid, b),
        }),
    );
    if (!target) {
      crossArm.current = null;
      return { ok: false, reason: translationEdge(delta) };
    }
    const to = target.chapter;
    const toBook = books.find((b) => b.bookNumber === target.book) ?? currentBook;
    if (!press.cross) {
      return {
        ok: false,
        reason: edgeNotice(delta, chapterName(toBook, to), target.newBook),
      };
    }
    const verses = await queryClient.fetchQuery({
      queryKey: ['verses', tid, target.book, to],
      queryFn: () => api.verses(tid, target.book, to),
    });
    const v = landingVerse(
      verses.map((x) => x.verse),
      delta,
    );
    if (v == null) return { ok: false, reason: tr('У цьому розділі немає віршів') };
    const label = formatReference(toBook, to, [v]);
    if (onScreen) {
      await activatePassage({
        kind: 'passage',
        id: `cross-${target.book}-${to}-${v}`,
        label,
        translationIds: selectedIds,
        bookNumber: target.book,
        chapter: to,
        verses: [v],
      });
    } else {
      if (target.newBook) selectBook(target.book);
      selectChapter(to);
      setSelectedVerses([v]);
      setScrollTarget(v);
    }
    return { ok: true, reason: label };
  };
  /** Keys and buttons: say why the show didn't move (at a chapter's edge: what's next). */
  const advanceAndSay = (delta: number, previewOnly = false, held = false) => {
    // the first preview-only step while the screen follows: say that the screen stays
    if (previewOnly && liveFollow && live && !screenHeld) {
      notifications.show({
        id: 'screen-held',
        message: tr('Екран стоїть, прев’ю йде далі. Показати прев’ю — «На екран».'),
        color: 'cue',
        autoClose: 3000,
      });
    }
    void Promise.resolve(advance(delta, previewOnly, held)).then((o) => {
      // one notice for the edge, however long the key is held (1.10.6: ~11 piled up)
      if (!o.ok && o.reason) noticeOnce('show-edge', o.reason);
    });
  };

  // "Next/previous": with a long passage split across pages, step pages; otherwise
  // step the single verse. Drives arrows, the PageDown/PageUp clicker keys, and the
  // preview's page arrows — so the same gesture always means "advance the screen".
  /**
   * One step of the show (reveal → page → verse); says whether anything moved. `previewOnly`
   * (Alt+arrows): the screen stays while «Наживо» is on; a plain step lets it follow again.
   */
  const advance = (
    delta: number,
    previewOnly = false,
    /** a key held down (its repeats): steps on, never across a chapter's edge (1.9.5) */
    held = false,
  ): Outcome | Promise<Outcome> => {
    // «Далі» while a pick is collected: first the pick, all together (the user, 2026-10-11)
    if (hold === 'pick' && delta > 0 && !previewOnly) {
      send();
      return { ok: true };
    }
    setHold(previewOnly && liveFollow && live ? 'preview' : null);
    const sign: 1 | -1 = delta > 0 ? 1 : -1;
    // a text, a picture or a video of the running order: one step past it is the next item, when
    // «Після кінця пункту…» is on (1.10.0-beta.1)
    if (!previewOnly) {
      const o = pastItemRef.current?.(sign, { kind: 'slide' }, held);
      if (o) return o;
    }
    // Progressive reveal first: step through the verses of the current slide before
    // moving on. Only while projecting the verse selection (no song/text override).
    if (appearance.reveal && revealUnits && revealUnits.length > 1 && !previewOverride) {
      if (delta > 0 && revealCount < revealUnits.length) {
        setRevealCount((c) => Math.min(revealUnits.length, c + 1));
        return { ok: true };
      }
      if (delta < 0 && revealCount > 1) {
        setRevealCount((c) => Math.max(1, c - 1));
        return { ok: true };
      }
      // Exhausted in this direction → fall through to step the page/verse.
    }
    if (pageCount > 1) {
      const target = Math.min(pageCount - 1, Math.max(0, safePageIndex + delta));
      if (target === safePageIndex) {
        // a passage of the running order at its last / first page: the next / previous item
        const o = previewOnly
          ? null
          : pastItemRef.current?.(
              sign,
              { kind: 'verses', selected: selectedVerses, page: safePageIndex },
              held,
            );
        if (o) return o;
        return {
          ok: false,
          reason: delta > 0 ? tr('Це остання сторінка') : tr('Це перша сторінка'),
        };
      }
      // Moving to a new page: start its reveal fresh in THIS batched update (not via the
      // post-commit reset effect) so live-follow doesn't push the new content at the old
      // reveal count for a frame. Paging also ends any projection override, so
      // live-follow pushes the new page (the page alone doesn't touch the selection).
      setRevealCount(1);
      setPreviewOverride(null);
      setPageIndex(target);
      return { ok: true };
    }
    // a passage of the running order at its last / first verse: the next / previous item
    const past = previewOnly
      ? null
      : pastItemRef.current?.(
          sign,
          { kind: 'verses', selected: selectedVerses, page: safePageIndex },
          held,
        );
    if (past) return past;
    const moved = stepVerse(delta, previewOnly, held);
    if (!(moved instanceof Promise) && moved.ok) setRevealCount(1); // same batch as the verse
    return moved;
  };

  // Reset the reveal to the first verse whenever the projected content changes.
  useEffect(() => {
    setRevealCount(1);
    // deps as they were in Control, where the rule knew the setter as stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVerses, safePageIndex, primaryId]);

  const sendAndNotify = () => {
    if (!leaderRef.current) return standbyNotice();
    send();
    if (slideLines.length > 0) {
      notifications.show({
        message: tr('На екрані: {ref}', { ref: pageReference }),
        color: 'live',
        autoClose: 1500,
      });
    }
  };

  // Enter on a verse projects it straight away (no need to enable live-follow / press
  // F5). If it's already part of the selection, project the whole selection; otherwise
  // select just this verse and push it directly (built from the loaded chapter, so we
  // don't wait for the selection-derived slideLines to recompute).
  const projectVerseOnEnter = (verseNum: number) => {
    if (!leaderRef.current) return standbyNotice();
    // a collected pick goes on screen whole, whichever row has the focus (1.13.0-beta.1)
    if (hold === 'pick' || selectedVerses.includes(verseNum)) {
      sendAndNotify();
      return;
    }
    setSelectedVerses([verseNum]);
    const lines = buildLines([verseNum]);
    if (lines.length === 0) return;
    pushLive({
      lines,
      reference: formatReference(currentBook, chapter, [verseNum]),
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
      source: verseSource([verseNum], 0, 1),
    });
    setLive(true);
    setPreviewOverride(null);
    notifications.show({
      message: tr('На екрані: {ref}', {
        ref: formatReference(currentBook, chapter, [verseNum], true),
      }),
      color: 'live',
      autoClose: 1500,
    });
  };

  return {
    screenHeld,
    /** a pick waits in the preview for Enter (1.13.0-beta.1) */
    pickHeld: hold === 'pick',
    pickVerse,
    pickVerses,
    selectVerses,
    send,
    sendAndNotify,
    projectStrong,
    projectVerseOnEnter,
    advanceAndSay,
    advance,
  };
}
