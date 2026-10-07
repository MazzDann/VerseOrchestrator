import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { publishNext, setPublishing, subscribeSlide, type Slide } from '../../presenterBus';
import { planTakeover } from '../../lib/takeover';

/** E8 (vo-sync): what one step would show goes to «Сцена» — from the leading window only. */
export function usePublishNext({
  isLeader,
  nextSlide,
}: {
  isLeader: boolean;
  nextSlide: Slide | null;
}) {
  // Mirror the next-slide preview to the stage window.
  useEffect(() => {
    if (isLeader) publishNext(nextSlide);
  }, [nextSlide, isLeader]);
}

/**
 * E17 (vo-sync): a window that took over (0.5.10) restores the page, the reveal step and a Strong
 * slide of what was on screen once its selection is in. Called after E12 and E16 (useShowSteps).
 */
export function useAdoptRestore({
  adopting,
  selectedIds,
  bookNumber,
  chapter,
  selectedVerses,
  safePageIndex,
  pageCount,
  setPageIndex,
  setRevealCount,
  setPreviewOverride,
}: {
  adopting: MutableRefObject<{
    key: string;
    page: number;
    reveal: number;
    override: Slide | null;
  } | null>;
  selectedIds: number[];
  bookNumber: number | null;
  chapter: number | null;
  selectedVerses: number[];
  safePageIndex: number;
  pageCount: number;
  setPageIndex: Dispatch<SetStateAction<number>>;
  setRevealCount: Dispatch<SetStateAction<number>>;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
}) {
  // Taking over (0.5.10): once the adopted selection is in, restore its page, then its
  // reveal step and a Strong slide — called after the steps' reset effects, so it runs
  // after them in the same commit and wins. Live-follow waits until this is done.
  useEffect(() => {
    const a = adopting.current;
    if (!a || JSON.stringify([selectedIds, bookNumber, chapter, selectedVerses]) !== a.key) return;
    const page = Math.min(a.page, Math.max(0, pageCount - 1));
    if (safePageIndex !== page) {
      setPageIndex(page);
      return;
    }
    setRevealCount(a.reveal);
    if (a.override) setPreviewOverride(a.override);
    adopting.current = null;
    // deps as they were in Control, where the rule knew the ref and the setters as stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, bookNumber, chapter, selectedVerses, safePageIndex, pageCount]);
}

/**
 * E24, E25 (vo-sync): leader ⇄ standby. A window on standby mirrors what the leader shows; one
 * that becomes leader takes the screen over as it is, publishes its «next» and, after another
 * window led, stands on what is on screen (`adoptScreen`). E24 lets «live» on once a taken-over
 * song's slide is the preview override. Called after useTimers (E19) and usePublishNext (E8),
 * and before useHub (E25 runs before E28, as it did in Control).
 */
export function useLeaderTakeover({
  adopting,
  setTranslations,
  selectBook,
  selectChapter,
  setSelectedVerses,
  setLive,
  setScrollTarget,
  openSong,
  setSongsPanelStanza,
  setSongsOpen,
  toBible,
  openAlbum,
  openVideosTab,
  setImagesOpen,
  setPreviewOverride,
  previewOverride,
  isLeader,
  setLiveSlide,
  lastPushed,
  pushLive,
  liveSlideRef,
  nextSlideRef,
}: {
  adopting: MutableRefObject<{
    key: string;
    page: number;
    reveal: number;
    override: Slide | null;
  } | null>;
  setTranslations: (ids: number[]) => void;
  selectBook: (bookNumber: number) => void;
  selectChapter: (chapter: number) => void;
  setSelectedVerses: (verses: number[]) => void;
  setLive: (live: boolean) => void;
  setScrollTarget: (verse: number | null) => void;
  openSong: (id: number | null) => void;
  setSongsPanelStanza: (stanza: number | null) => void;
  setSongsOpen: (v: boolean | ((open: boolean) => boolean)) => void;
  /** a passage taken over shows the Bible (1.8.12-beta.7) */
  toBible: () => void;
  openAlbum: (id: string | null, at?: { index: number; name?: string }) => void;
  openVideosTab: () => void;
  setImagesOpen: (v: boolean | ((open: boolean) => boolean)) => void;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
  previewOverride: Slide | null;
  isLeader: boolean;
  setLiveSlide: Dispatch<SetStateAction<Slide>>;
  lastPushed: MutableRefObject<Slide | null>;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
  liveSlideRef: MutableRefObject<Slide>;
  nextSlideRef: MutableRefObject<Slide | null>;
}) {
  // Leader ⇄ standby (0.4.4). Standby: publish nothing and mirror what the leader shows
  // (the «На екрані» monitor stays true). Becoming leader — at start, when the leading
  // window closes, or on «Взяти керування»: take the screen over as it is (republished
  // under this window's session, nothing visibly changes) and publish this window's «next».
  //
  // Taking over after another window led (0.5.10) — not at start, when nobody else did —
  // also stands this window on what is on screen (lib/takeover.ts): the selection, page
  // and reveal step, or the song and stanza, so its first «Далі» continues the show.
  const mirrored = useRef(false);
  /** A song taken over: «live» goes on only once its slide is the preview override. */
  const songTakeover = useRef<Slide | null>(null);
  const adoptScreen = (screen: Slide) => {
    const t = planTakeover(screen);
    if (t.kind === 'verses') {
      const a = {
        key: JSON.stringify([t.translationIds, t.bookNumber, t.chapter, t.verses]),
        page: t.page,
        reveal: t.reveal,
        override: t.override,
      };
      adopting.current = a;
      toBible();
      setTranslations(t.translationIds);
      selectBook(t.bookNumber);
      selectChapter(t.chapter);
      setSelectedVerses(t.verses);
      setLive(t.live);
      setScrollTarget(t.verses[0]);
      // never stuck: give up restoring page/reveal if the selection doesn't arrive
      window.setTimeout(() => {
        if (adopting.current === a) adopting.current = null;
      }, 2000);
    } else if (t.kind === 'song') {
      openSong(t.songId);
      setSongsPanelStanza(t.stanza);
      setSongsOpen(true);
      // «live» now would render before the override lands (the store updates first) and
      // live-follow would push this window's verses over the song for a moment
      songTakeover.current = t.override;
      setPreviewOverride(t.override);
    } else if (t.kind === 'album') {
      // an album's photo (1.8.12): that album at that photo, its timer off — the same wait for «live»
      openAlbum(t.albumId, { index: t.index, name: t.name });
      setImagesOpen(true);
      songTakeover.current = t.override;
      setPreviewOverride(t.override);
    } else if (t.kind === 'video') {
      // a video (1.8.12-beta.3) plays on by its clock; this window's sound takes it from here
      openVideosTab();
      setImagesOpen(true);
      songTakeover.current = t.override;
      setPreviewOverride(t.override);
    }
  };
  useEffect(() => {
    if (!songTakeover.current || previewOverride !== songTakeover.current) return;
    songTakeover.current = null;
    setLive(true);
  }, [previewOverride, setLive]);
  useEffect(() => {
    setPublishing(isLeader);
    if (!isLeader) {
      return subscribeSlide((s) => {
        mirrored.current = true; // another window leads and publishes
        setLiveSlide(s);
      });
    }
    lastPushed.current = null;
    pushLive(liveSlideRef.current);
    publishNext(nextSlideRef.current);
    if (mirrored.current) adoptScreen(liveSlideRef.current);
    mirrored.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeader]);
}
