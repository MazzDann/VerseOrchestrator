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
import { joinVerses, strongHighlightSegments } from './slideText';
import { standbyNotice } from './standby';

/**
 * The steps of the show (vo-sync): the verse selection on screen («На екран», Enter on a verse,
 * a Strong slide), live-follow, and one step forward or back — reveal → page → verse → across a
 * chapter's or book's edge (two presses). Effects: E9 (a held screen let go when «Наживо»
 * switches), E11 (live-follow), E12 (the preview back to the verses on navigation), E16 (the
 * reveal back to its first step).
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
}) {
  /**
   * «Прев’ю: далі / назад» (Alt+arrows, 1.1.0): the preview walked ahead and the screen stays,
   * though «Наживо» is on — until «На екран», a plain step, or «Наживо» switched.
   */
  const [screenHeld, setScreenHeld] = useState(false);
  useEffect(() => setScreenHeld(false), [liveFollow]);

  const send = (overrides?: Partial<Slide>) => {
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
    setScreenHeld(false); // the screen shows the preview: it follows again
  };

  // Project the Strong-bearing (primary) translation only, with a "word — gloss"
  // subline. Used contextually from the Strong tab; normal navigation reverts it.
  // Scoped to the current page (like `send`/preview) so it stays WYSIWYG when a long
  // passage is split across slides.
  const projectStrong = (subline: string, strong: string) => {
    const t = translations.find((x) => x.id === primaryId);
    const pageStrongVerses = selectedPrimaryVerses.filter((v) => pageVerses.includes(v.verse));
    const text = joinVerses(pageStrongVerses, pageVerses, appearance.showVerseNumbers);
    if (!text.trim()) return;
    const segments = strongHighlightSegments(
      pageStrongVerses,
      pageVerses,
      appearance.showVerseNumbers,
      strong,
    );
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
      if (!o.ok && o.reason) {
        notifications.show({ message: o.reason, color: 'gray', autoClose: 2500 });
      }
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
    setScreenHeld(previewOnly && liveFollow && live);
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
    if (selectedVerses.includes(verseNum)) {
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
    send,
    sendAndNotify,
    projectStrong,
    projectVerseOnEnter,
    advanceAndSay,
    advance,
  };
}
