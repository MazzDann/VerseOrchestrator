import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NO_LIBRARY } from '@vo/shared';
import { api, ApiFailure } from '../../api';
import { type Appearance } from '../../settingsStore';
import {
  type QrStyle,
  type Slide,
  type SlideLine,
  type SlideReveal,
  type SlideSource,
  type SlideStyle,
  type SlideTemplate,
} from '../../presenterBus';
import { type DataSource } from '../../dataSourceStore';
import { type LibraryGap } from '../../components/NoLibrary';
import { formatReference } from '../../lib/reference';
import { useServer } from '../../serverStore';
import { useStore } from '../../store';
import { numbersOn } from './slideText';
import { alignedLine } from '../../lib/passageLines';
import { useAlignedVerses } from '../../lib/useAlignedVerses';

const EMPTY_ARRAY: never[] = [];

/**
 * The verses of the control window: the page and reveal step, the library's queries
 * (translations, books, chapters, the open chapter in every selected translation) and what they
 * give — the reference, the pages of a long passage, the slide's lines and look, the preview and
 * what one step would show («Далі» on «Сцена»). Effects: the queries' subscriptions, then E6 (back
 * to the first page). `nextSlideRef` is assigned during render, beside `nextSlide`.
 */
export function useVerseDeck({
  selectedIds,
  primaryId,
  bookNumber,
  chapter,
  selectedVerses,
  appearance,
  effectiveSource,
  followAlong,
  followQrCorner,
  followUrl,
  followQrStyle,
  slideTemplate,
  previewOverride,
}: {
  selectedIds: number[];
  primaryId: number | null;
  bookNumber: number | null;
  chapter: number | null;
  selectedVerses: number[];
  appearance: Appearance;
  effectiveSource: DataSource;
  followAlong: boolean;
  followQrCorner: boolean;
  followUrl: string;
  followQrStyle: QrStyle;
  slideTemplate: SlideTemplate | null;
  previewOverride: Slide | null;
}) {
  // Active page when a long passage is split across multiple slides.
  const [pageIndex, setPageIndex] = useState(0);
  // How many verses are revealed so far in progressive-reveal mode (1-based).
  const [revealCount, setRevealCount] = useState(1);

  const translationsQuery = useQuery({
    queryKey: ['translations'],
    queryFn: api.translations,
    // no library on the server: say so at once, not after three retries (0.13.1)
    retry: (n, e) => !(e instanceof ApiFailure && e.key === NO_LIBRARY) && n < 3,
  });
  const translations = translationsQuery.data ?? EMPTY_ARRAY;
  /** Nothing to read, and why (0.13.1) — the centre then says what to do. */
  const libraryGap: LibraryGap | null =
    translationsQuery.error instanceof ApiFailure && translationsQuery.error.key === NO_LIBRARY
      ? 'missing'
      : translationsQuery.isSuccess && translations.length === 0
        ? effectiveSource === 'local'
          ? 'local'
          : 'empty'
        : null;
  // A translation the library no longer has leaves the selection, as on the desk (1.10.11, the Mac's
  // round: ids are import order — after a rescan or with a smaller library a gone PRIMARY id said
  // «У цьому перекладі немає книг» and couldn't be unticked). Only against a list that has
  // translations: an empty or missing library keeps the choice for when it is back — and so does
  // the minute the server is awaited (1.12.5: no list is the server's then). After it the
  // browser's library is the one in use, and trims as before (review: kept untrimmed for the
  // whole session, a gone id stuck as the main one again — the 1.10.11 symptom)
  const awaitingServer = useServer((s) => s.lost && s.available === null);
  useEffect(() => {
    if (awaitingServer || !translationsQuery.isSuccess || translations.length === 0) return;
    const known = selectedIds.filter((id) => translations.some((t) => t.id === id));
    if (known.length !== selectedIds.length) useStore.getState().setTranslations(known);
  }, [awaitingServer, translationsQuery.isSuccess, translations, selectedIds]);

  const booksQuery = useQuery({
    queryKey: ['books', primaryId],
    queryFn: () => api.books(primaryId!),
    enabled: primaryId != null,
  });
  const books = booksQuery.data ?? EMPTY_ARRAY;

  const chaptersQuery = useQuery({
    queryKey: ['chapters', primaryId, bookNumber],
    queryFn: () => api.chapters(primaryId!, bookNumber!),
    enabled: primaryId != null && bookNumber != null,
  });
  const chapters = chaptersQuery.data ?? EMPTY_ARRAY;

  // parallel translations in their own numbering (1.13.0-beta.2, lib/useAlignedVerses.ts)
  const {
    versesById: versesByTranslation,
    alignments,
    ready: alignReady,
    queries: verseQueries,
  } = useAlignedVerses(selectedIds, bookNumber, chapter);
  const primaryVerses = useMemo(
    () =>
      primaryId != null
        ? (versesByTranslation.get(primaryId) ?? []).filter((v) => v.chapter === chapter)
        : [],
    [primaryId, versesByTranslation, chapter],
  );
  /** The open chapter's verses still on their way: the list says nothing about them yet. */
  const versesLoading =
    bookNumber != null && chapter != null && (!!verseQueries[0]?.isPending || !alignReady);

  const currentBook = books.find((b) => b.bookNumber === bookNumber) ?? null;
  const reference = useMemo(
    () => formatReference(currentBook, chapter, selectedVerses),
    [currentBook, chapter, selectedVerses],
  );
  const referenceShort = useMemo(
    () => formatReference(currentBook, chapter, selectedVerses, true),
    [currentBook, chapter, selectedVerses],
  );
  const primaryHasStrong = translations.find((t) => t.id === primaryId)?.hasStrong ?? false;
  const selectedPrimaryVerses = useMemo(
    () => primaryVerses.filter((v) => selectedVerses.includes(v.verse)),
    [primaryVerses, selectedVerses],
  );

  // --- Long-passage pagination -------------------------------------------------
  // Split the selection into pages of `versesPerSlide` verses; the projected slide
  // shows one page and PageDown/arrows step pages. 0 (or a selection that fits) →
  // a single page = the whole selection (current behaviour, zero regression).
  const versesPerSlide = appearance.versesPerSlide ?? 0;
  const pages = useMemo<number[][]>(() => {
    if (selectedVerses.length === 0) return [];
    if (!versesPerSlide || versesPerSlide < 1 || selectedVerses.length <= versesPerSlide) {
      return [selectedVerses];
    }
    const out: number[][] = [];
    for (let i = 0; i < selectedVerses.length; i += versesPerSlide) {
      out.push(selectedVerses.slice(i, i + versesPerSlide));
    }
    return out;
  }, [selectedVerses, versesPerSlide]);
  const pageCount = pages.length;
  const safePageIndex = Math.min(pageIndex, Math.max(0, pageCount - 1));
  const pageVerses = pages[safePageIndex] ?? selectedVerses;
  const pageReference = useMemo(
    () => formatReference(currentBook, chapter, pageVerses),
    [currentBook, chapter, pageVerses],
  );

  // Back to the first page whenever the selection or the page size changes.
  useEffect(() => {
    setPageIndex(0);
  }, [selectedVerses, versesPerSlide]);

  // Build slide lines for an arbitrary set of verse numbers in the current chapter
  // (shared by the live slide and the stage "next" preview).
  const buildLines = useCallback(
    (verseNums: number[]): SlideLine[] => {
      if (verseNums.length === 0 || chapter == null || !alignReady) return [];
      const num = numbersOn(appearance.verseNumbers, verseNums.length);
      return selectedIds
        .map((id) =>
          alignedLine(
            translations.find((x) => x.id === id),
            versesByTranslation.get(id) ?? [],
            chapter,
            verseNums,
            alignments.get(id) ?? null,
            num,
          ),
        )
        .filter((x): x is SlideLine => x !== null);
    },
    [
      selectedIds,
      versesByTranslation,
      translations,
      appearance.verseNumbers,
      chapter,
      alignReady,
      alignments,
    ],
  );
  const slideLines = useMemo(() => buildLines(pageVerses), [buildLines, pageVerses]);

  const slideStyle: SlideStyle = useMemo(
    () => ({
      font: appearance.scriptureFont,
      color: appearance.textColor,
      align: appearance.textAlign,
      bgColor: appearance.bgColor,
      bgImage: appearance.bgImage,
      // the bus field of 0.x; no window reads it (the numbers are in the text)
      showVerseNumbers: appearance.verseNumbers === 'always',
      padTop: appearance.padTop,
      padRight: appearance.padRight,
      padBottom: appearance.padBottom,
      padLeft: appearance.padLeft,
      padUnit: appearance.padUnit,
      redLetter: appearance.redLetter,
      jesusColor: appearance.jesusColor,
      highlightColor: appearance.highlightColor,
      transition: appearance.transition,
      // the viewers' QR in a corner (0.6.16) — only while the relay is on to read from
      qrCorner: followAlong && followQrCorner ? followUrl : null,
      qrStyle: followQrStyle,
    }),
    [appearance, followAlong, followQrCorner, followUrl, followQrStyle],
  );

  // --- Progressive reveal --------------------------------------------------------
  // Units = the current page's verses (primary translation), revealed one per step.
  const revealUnits = useMemo<string[] | null>(() => {
    if (!appearance.reveal) return null;
    const verses = primaryId != null ? (versesByTranslation.get(primaryId) ?? []) : [];
    const byNum = new Map(verses.map((v) => [v.verse, v]));
    const units: string[] = [];
    const num = numbersOn(appearance.verseNumbers, pageVerses.length);
    for (const n of pageVerses) {
      const t = (byNum.get(n)?.text ?? '').trim();
      if (t) units.push(`${num ? `${n} ` : ''}${t}`);
    }
    return units.length ? units : null;
  }, [appearance.reveal, appearance.verseNumbers, primaryId, versesByTranslation, pageVerses]);

  const revealForSlide: SlideReveal | undefined =
    appearance.reveal && revealUnits
      ? {
          units: revealUnits,
          count: Math.min(Math.max(1, revealCount), revealUnits.length),
          mode: appearance.revealSpotlight ? 'spotlight' : 'accumulate',
          placeholders: appearance.revealPlaceholders,
          ...(numbersOn(appearance.verseNumbers, pageVerses.length) ? { numbered: true } : {}),
        }
      : undefined;

  /** The page on screen of a selection that has pages, as its first and last verse. */
  const shownOf = (verses: number[], page: number): { shown?: [number, number] } => {
    const pv = verses === selectedVerses && pages.length > 1 ? pages[page] : undefined;
    return pv && pv.length > 0 ? { shown: [pv[0], pv[pv.length - 1]] } : {};
  };
  /** Where a verse slide comes from (0.5.10, SlideSource): the selection, page, reveal step. */
  const verseSource = (
    verses: number[] = selectedVerses,
    page: number = safePageIndex,
    reveal: number = revealCount,
  ): SlideSource | undefined =>
    bookNumber != null && chapter != null && verses.length > 0
      ? {
          kind: 'verses',
          translationIds: selectedIds,
          bookNumber,
          chapter,
          verses,
          page,
          reveal,
          // «вірші 1–5» of a selection with pages: the page on screen (review of 1.9.0-beta.11)
          ...shownOf(verses, page),
          // «вірш 16 з 36» on «Сцена» (1.9.0-beta.11): the chapter's last verse
          ...(primaryVerses.length > 0
            ? { total: primaryVerses[primaryVerses.length - 1].verse }
            : {}),
        }
      : undefined;

  // WYSIWYG of the current page — what would be projected for the verse selection.
  const versePreview: Slide = {
    lines: slideLines,
    reference: pageReference,
    blank: false,
    visible: slideLines.length > 0,
    style: slideStyle,
    template: slideTemplate,
    reveal: revealForSlide,
  };
  // Show the last song/text/Strong projection while one is active; otherwise the
  // verse selection. The override is cleared on navigation (E12, useShowSteps).
  const previewSlide: Slide = previewOverride ?? versePreview;

  // What advancing once would project — fed to the stage display's "next" pane.
  // Only meaningful for verse/page navigation; null while an override owns the screen.
  const nextSlide = useMemo<Slide | null>(() => {
    if (previewOverride || selectedVerses.length === 0) return null;
    // Mid-reveal, the next press reveals one more verse of the CURRENT slide — show
    // that on the stage "next" pane, not the following page/verse.
    if (
      appearance.reveal &&
      revealUnits &&
      revealUnits.length > 1 &&
      revealCount < revealUnits.length
    ) {
      return {
        lines: slideLines,
        reference: pageReference,
        blank: false,
        visible: true,
        style: slideStyle,
        template: slideTemplate,
        reveal: {
          units: revealUnits,
          count: revealCount + 1,
          mode: appearance.revealSpotlight ? 'spotlight' : 'accumulate',
          placeholders: appearance.revealPlaceholders,
        },
      };
    }
    let nextVerses: number[] | null = null;
    if (pageCount > 1 && safePageIndex < pageCount - 1) {
      nextVerses = pages[safePageIndex + 1];
    } else if (pageCount <= 1) {
      const all = primaryVerses.map((v) => v.verse);
      const last = selectedVerses[selectedVerses.length - 1];
      const idx = all.indexOf(last);
      if (idx >= 0 && idx < all.length - 1) nextVerses = [all[idx + 1]];
    }
    if (!nextVerses) return null;
    const lines = buildLines(nextVerses);
    if (lines.length === 0) return null;
    return {
      lines,
      reference: formatReference(currentBook, chapter, nextVerses),
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
    };
  }, [
    previewOverride,
    selectedVerses,
    pageCount,
    safePageIndex,
    pages,
    primaryVerses,
    buildLines,
    currentBook,
    chapter,
    slideStyle,
    slideTemplate,
    appearance.reveal,
    appearance.revealSpotlight,
    appearance.revealPlaceholders,
    revealUnits,
    revealCount,
    slideLines,
    pageReference,
  ]);
  // read by handlers and effects only, never during render (moved up beside nextSlide)
  const nextSlideRef = useRef(nextSlide);
  nextSlideRef.current = nextSlide;

  return {
    pageIndex,
    setPageIndex,
    revealCount,
    setRevealCount,
    translations,
    libraryGap,
    books,
    chapters,
    verseQueries,
    primaryVerses,
    versesLoading,
    currentBook,
    reference,
    referenceShort,
    primaryHasStrong,
    selectedPrimaryVerses,
    pageCount,
    safePageIndex,
    pageVerses,
    pageReference,
    buildLines,
    slideLines,
    slideStyle,
    revealUnits,
    revealForSlide,
    verseSource,
    versePreview,
    previewSlide,
    nextSlide,
    nextSlideRef,
  };
}
