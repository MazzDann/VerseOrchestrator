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
import { api, type SongStyle, type Translation } from '../../api';
import { type Appearance } from '../../settingsStore';
import {
  type SeqImage,
  type SeqItem,
  type SeqLoop,
  type SeqLoopSlide,
  type SeqPassage,
  type SeqSong,
  stepIndex,
} from '../../playlistStore';
import {
  type Slide,
  type SlideCountdown,
  type SlideCover,
  type SlideLine,
  type SlidePicture,
  type SlideSource,
  type SlideStyle,
  type SlideTemplate,
} from '../../presenterBus';
import { findSong } from '../../lib/songLink';
import { tr } from '../../i18n';
import { joinVerses, redLetterSegments } from './slideText';
import { asksFor, atItemEdge, belongsTo, stillThere, type PastItem } from '../../lib/orderFlow';
import { coverOver } from '../../lib/slide';
import { itemCountdown, zeroIn } from '../../lib/countdownItem';
import { everyMs } from '../../lib/workerClock';
import { type Outcome } from '../../lib/commands';
import { ORDER_CURRENT_KEY } from '../../lib/stage';
import { type CountdownPlace } from '../../lib/countdown';

/**
 * The running order on screen («Послідовність показу»; out of usePlaylistActions and Control.tsx
 * before 1.10, where it leads the whole show): an item put on screen (a passage, a song's first
 * stanza, a text, a picture, an album's first photo, a video) and one step on or back —
 * `orderStep`, the one way the keys and a video's end take. No effects.
 */
export function useRunningOrder({
  setTranslations,
  selectBook,
  selectChapter,
  setSelectedVerses,
  setScrollTarget,
  queryClient,
  appearance,
  translations,
  slideStyle,
  slideTemplate,
  pushLive,
  setPreviewOverride,
  setLive,
  openSong,
  setSongsOpen,
  followItem,
  setSongsPanelStanza,
  playlistRelinkSong,
  projectText,
  projectPicture,
  pictureOf,
  startAlbum,
  startVideo,
  playlistSetCurrent,
  playlistItems,
  playlistCurrentId,
  playlistNextRef,
  liveSlideRef,
  orderFlow,
  pastItemRef,
  liveSlide,
  isLeader,
  leaderRef,
  countdownStartRef,
}: {
  setTranslations: (ids: number[]) => void;
  selectBook: (bookNumber: number) => void;
  selectChapter: (chapter: number) => void;
  setSelectedVerses: (verses: number[]) => void;
  setScrollTarget: (verse: number | null) => void;
  queryClient: QueryClient;
  appearance: Appearance;
  translations: Translation[];
  slideStyle: SlideStyle;
  slideTemplate: SlideTemplate | null;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
  setLive: (live: boolean) => void;
  openSong: (id: number | null) => void;
  setSongsOpen: (v: boolean | ((open: boolean) => boolean)) => void;
  /** the item's mode (1.8.12-beta.7): a passage — «Біблія», a text or a picture — «Медіа» */
  followItem: (kind: SeqItem['kind']) => void;
  setSongsPanelStanza: (stanza: number | null) => void;
  playlistRelinkSong: (oldId: number, label: string, newId: number, bundle?: string) => void;
  projectText: (
    text: string,
    reference: string,
    faithful?: SongStyle | null,
    source?: SlideSource,
    look?: SongStyle | null,
    quiet?: boolean,
  ) => Slide | undefined;
  projectPicture: (picture: SlidePicture, quiet?: boolean) => Slide;
  pictureOf: (it: SeqImage) => SlidePicture;
  startAlbum: (
    albumId: string,
    fit: SlidePicture['fit'],
    label: string,
  ) => Promise<{ slide: Slide } | { reason: string }>;
  startVideo: (
    videoId: string,
    fit: SlidePicture['fit'],
    label: string,
  ) => Promise<{ slide: Slide } | { reason: string }>;
  playlistSetCurrent: (id: string | null) => void;
  playlistItems: SeqItem[];
  playlistCurrentId: string | null;
  /** a video at its end goes on with the next item (useVideo: «Після кінця» → «Наступний елемент»); filled here */
  playlistNextRef: MutableRefObject<(() => boolean) | null>;
  /** what is on screen now (the leader's) */
  liveSlideRef: MutableRefObject<Slide>;
  /** «Після кінця пункту «Далі» відкриває наступний» (1.10.0-beta.1) */
  orderFlow: boolean;
  /** the verse steps, a song and an album ask here at their ends (lib/orderFlow.ts); filled here */
  pastItemRef: MutableRefObject<PastItem | null>;
  /** the screen now (a «Відлік» item's zero follows it) and whether this window leads */
  liveSlide: Slide;
  isLeader: boolean;
  leaderRef: MutableRefObject<boolean>;
  /** «Відлік» of useTimers (called later): a «Відлік» item starts through it */
  countdownStartRef: MutableRefObject<
    ((countdown: SlideCountdown, place?: CountdownPlace, onCover?: SlideCover) => void) | null
  >;
}) {
  // --- Presentation sequence (playlist) ---------------------------------------
  // Project a saved passage: set the selection (so the list/preview follow) and
  // push the slide directly from freshly-fetched verses (don't wait on the
  // selection-derived `slideLines`, which only updates on the next render/query).
  const activatePassage = async (it: SeqPassage) => {
    setTranslations(it.translationIds);
    selectBook(it.bookNumber);
    selectChapter(it.chapter);
    setSelectedVerses(it.verses);
    setScrollTarget(it.verses[0] ?? null);
    const lines: SlideLine[] = [];
    let total: number | undefined;
    for (const id of it.translationIds) {
      try {
        const verses = await queryClient.fetchQuery({
          queryKey: ['verses', id, it.bookNumber, it.chapter],
          queryFn: () => api.verses(id, it.bookNumber, it.chapter),
        });
        total ??= verses.length > 0 ? verses[verses.length - 1].verse : undefined;
        const text = joinVerses(verses, it.verses, appearance.showVerseNumbers);
        if (!text.trim()) continue;
        const t = translations.find((x) => x.id === id);
        const segments = redLetterSegments(verses, it.verses, appearance.showVerseNumbers);
        lines.push({ translationAbbr: t?.abbr ?? '', text, rtl: !!t?.rtl, segments });
      } catch {
        /* skip a translation that fails to load */
      }
    }
    if (lines.length === 0) {
      // Every translation failed to load (e.g. ids changed after a library rebuild).
      notifications.show({
        message: tr('Уривок недоступний — переклад змінився. Оновіть елемент показу.'),
        color: 'red',
        autoClose: 2500,
      });
      return;
    }
    pushLive({
      lines,
      reference: it.label,
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
      source: {
        kind: 'verses',
        translationIds: it.translationIds,
        bookNumber: it.bookNumber,
        chapter: it.chapter,
        verses: it.verses,
        page: 0,
        reveal: 1,
        // «вірш 16 з 36» on «Сцена» (1.9.0-beta.11): the first translation's last verse
        ...(total ? { total } : {}),
      },
    });
    setPreviewOverride(null);
    setLive(true);
  };

  // Open a saved song in the Songs panel and project its first stanza; further
  // stanzas are stepped with the arrows inside the panel (existing behaviour).
  const activateSong = async (it: SeqSong) => {
    openSong(it.songId);
    setSongsOpen(true);
    try {
      // by its id — or by its label when the id changed (song bundles, 0.10.0)
      const s = await findSong(it.songId, it.label, it.bundle, {
        song: (id) =>
          queryClient.fetchQuery({ queryKey: ['song', id], queryFn: () => api.song(id) }),
        search: (q) => api.songs(q),
      });
      if (!s) return;
      if (s.id !== it.songId) {
        playlistRelinkSong(it.songId, it.label, s.id, s.bundle);
        openSong(s.id);
      }
      if (s.slides.length > 0) {
        projectText(
          s.slides[0].text,
          `№${s.number ?? ''} ${s.title}`.trim(),
          it.faithful ? s.slides[0].style : null,
          { kind: 'song', songId: s.id, stanza: 0, total: s.slides.length },
          s.slides[0].style,
        );
        // Seed the panel's stanza highlight to 0 so the first arrow/clicker advances
        // to stanza 1 (not re-projects the title we just put on screen).
        setSongsPanelStanza(0);
      }
    } catch {
      /* ignore a song that fails to load */
    }
  };

  /**
   * One slide of a «Цикл» on screen (1.10.0-beta.4): a text, a picture or a cover, as their items are.
   * A tick of the loop's clock (`quiet`, 1.10.4 — the Mac's round) changes the screen and only a
   * preview that shows the loop: no preview pulled back, no «Наживо», no notice every few seconds.
   */
  const showLoopSlide = (x: SeqLoopSlide, quiet?: SeqLoop) => {
    let slide: Slide | undefined;
    if (x.kind === 'text')
      slide = projectText(x.body, x.title.trim(), null, undefined, null, !!quiet);
    else if (x.kind === 'image') slide = projectPicture(pictureOf(x), !!quiet);
    else {
      slide = coverOver(
        liveSlideRef.current,
        { text: x.text, image: x.image?.src ?? null },
        slideStyle,
        x.label,
      );
      pushLive(slide);
      if (!quiet) {
        setPreviewOverride(slide);
        setLive(true);
      }
    }
    const shown = slide;
    if (quiet && shown) setPreviewOverride((p) => (p && belongsTo(quiet, p) ? shown : p));
  };
  /** The loop's slide `delta` from the one on screen, round and round; its interval starts over. */
  const [loopRestart, setLoopRestart] = useState(0);
  // the slide shown last (review: two slides alike — the same picture twice — found the first one
  // again by the screen and stuck there); by the screen only when this no longer matches it
  const loopAt = useRef<{ loop: string; at: number } | null>(null);
  const showable = (x: SeqLoopSlide) => x.kind !== 'text' || !!x.body.trim(); // projectText skips empty
  const loopStep = (loop: SeqLoop, delta: 1 | -1, byHand = true) => {
    const n = loop.items.length;
    if (n === 0) return;
    const live = liveSlideRef.current;
    const kept = loopAt.current;
    let at =
      kept?.loop === loop.id && loop.items[kept.at] && belongsTo(loop.items[kept.at], live)
        ? kept.at
        : loop.items.findIndex((x) => belongsTo(x, live));
    for (let tries = 0; tries < n; tries++) {
      at = ((((at < 0 && delta < 0 ? 0 : at) + delta) % n) + n) % n;
      if (showable(loop.items[at])) break;
    }
    if (!showable(loop.items[at])) return;
    showLoopSlide(loop.items[at], byHand ? undefined : loop);
    loopAt.current = { loop: loop.id, at };
    if (byHand) setLoopRestart((k) => k + 1);
  };

  const activateItem = (it: SeqItem) => {
    // an item a newer version added (1.9.1): it stays in the list, nothing goes on screen
    if (it.kind === 'foreign') {
      notifications.show({
        message: tr(
          'Цей пункт додала новіша версія застосунку — оновіть застосунок, щоб показати його',
        ),
        color: 'gray',
        autoClose: 3000,
      });
      return;
    }
    playlistSetCurrent(it.id);
    followItem(it.kind);
    if (it.kind === 'passage') void activatePassage(it);
    else if (it.kind === 'text') projectText(it.body, it.title.trim());
    else if (it.kind === 'image') projectPicture(pictureOf(it));
    else if (it.kind === 'album') void startAlbum(it.albumId, it.fit, it.label);
    else if (it.kind === 'video') void startVideo(it.videoId, it.fit, it.label);
    else if (it.kind === 'song') void activateSong(it);
    else if (it.kind === 'countdown') {
      // its own length, words and zero, on the cover on screen (an item's) or the settings' one
      countdownStartRef.current?.(
        itemCountdown(it, Date.now()),
        'cover',
        liveSlideRef.current.cover ?? undefined,
      );
    } else if (it.kind === 'loop') {
      // its first slide; the window in charge turns them every `every` s (the effect below)
      const first = it.items.findIndex(showable);
      if (first >= 0) {
        showLoopSlide(it.items[first]);
        loopAt.current = { loop: it.id, at: first };
      }
      setLoopRestart((k) => k + 1);
    } else if (it.kind === 'cover') {
      // its own text and picture over what is on screen; «Заставка» (L) again gives that back
      const slide = coverOver(
        liveSlideRef.current,
        { text: it.text, image: it.image?.src ?? null },
        slideStyle,
        it.label,
      );
      pushLive(slide);
      setPreviewOverride(slide);
      setLive(true);
    }
  };

  // one item on (or back), over items of a newer version; at an end the edge item again
  const stepPlaylist = (delta: 1 | -1) => {
    const at = playlistItems.findIndex((i) => i.id === playlistCurrentId);
    const next = stepIndex(playlistItems, playlistCurrentId, delta) ?? (at >= 0 ? at : null);
    if (next != null) activateItem(playlistItems[next]);
  };

  /**
   * One item on or back over the playable ones (1.9.1). `key` (Shift+PageDown / PageUp,
   * 1.8.12-beta.6): at an end, or with nothing to show, says why nothing moved. `end` (a video's
   * end, 1.8.12-beta.3): only on from an item of the order, silently. Says whether it moved.
   */
  const orderStep = (delta: 1 | -1, why: 'key' | 'end'): boolean => {
    const at = playlistItems.findIndex((i) => i.id === playlistCurrentId);
    const to = stepIndex(playlistItems, playlistCurrentId, delta);
    if (why === 'end') {
      if (at < 0 || to == null) return false;
      stepPlaylist(delta);
      return true;
    }
    const say = (message: string) => {
      notifications.show({ message, color: 'gray', autoClose: 2000 });
      return false;
    };
    if (playlistItems.length === 0)
      return say(tr('Послідовність показу порожня — додавайте елементи кнопкою «+ у показ»'));
    // nothing further that can go on screen (items of a newer version are passed over, 1.9.1)
    if (to == null) {
      const beyond = at >= 0 && at + delta >= 0 && at + delta < playlistItems.length;
      return say(
        at < 0
          ? tr('У послідовності лише пункти новішої версії — оновіть застосунок, щоб показати їх')
          : beyond
            ? delta > 0
              ? tr('Далі лише пункти новішої версії — оновіть застосунок, щоб показати їх')
              : tr('Перед ним лише пункти новішої версії — оновіть застосунок, щоб показати їх')
            : delta > 0
              ? tr('Це останній елемент показу')
              : tr('Це перший елемент показу'),
      );
    }
    stepPlaylist(delta);
    return true;
  };
  const orderStepRef = useRef(orderStep);
  orderStepRef.current = orderStep;
  // the keys (useControlHotkeys freezes its callbacks) and a video's end (useVideo) read refs
  const playlistStepRef = useRef<(delta: 1 | -1) => void>(() => {});
  playlistStepRef.current = (delta) => void orderStep(delta, 'key');
  playlistNextRef.current = () => orderStep(1, 'end');
  // A «Відлік» item at zero with «наступний пункт» (1.10.0-beta.3): the window in charge keeps ONE
  // timer to the zero shown on screen — re-armed when it moves (a pause, ±1 хв, another window
  // taking over: armed from the slide) — not a chain of ticks, which a hidden or covered window
  // gets late (the Mac's round). A window that takes over with no item of its own takes the one
  // the last leader marked (lib/stage.ts ORDER_CURRENT_KEY) — before the mirror rewrites it.
  const cd = liveSlide.countdown;
  useEffect(() => {
    if (!isLeader) return;
    let currentId = playlistCurrentId;
    if (!currentId) {
      try {
        const marked = localStorage.getItem(ORDER_CURRENT_KEY);
        if (marked && playlistItems.some((i) => i.id === marked)) {
          playlistSetCurrent(marked);
          currentId = marked;
        }
      } catch {
        /* no storage: nothing to take over */
      }
    }
    const it = playlistItems.find((i) => i.id === currentId);
    if (it?.kind !== 'countdown') return;
    const ms = zeroIn(it, liveSlideRef.current, Date.now());
    if (ms == null) return;
    const t = window.setTimeout(() => {
      const now = liveSlideRef.current;
      if (!leaderRef.current || zeroIn(it, now, Date.now(), true) == null) return;
      orderStepRef.current(1, 'end');
    }, ms);
    return () => window.clearTimeout(t);
    // the zero is what matters: its time, its pause, its words, the item, the lead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeader, playlistCurrentId, playlistItems, cd?.until, cd?.pausedLeft, cd?.item]);

  // «Цикл оголошень» (1.10.0-beta.4): the window in charge turns the loop's slides every `every` s —
  // from a worker's clock (a covered window's own timers stall, the Mac's round). It waits while
  // the screen is hidden or black and does nothing once the screen shows something else.
  const loopNow = playlistItems.find((i) => i.id === playlistCurrentId);
  const loopEvery = loopNow?.kind === 'loop' ? loopNow.every : 0;
  const loopRef = useRef<SeqLoop | null>(null);
  loopRef.current = loopNow?.kind === 'loop' ? loopNow : null;
  const loopStepRef = useRef(loopStep);
  loopStepRef.current = loopStep;
  useEffect(() => {
    if (!isLeader || !loopEvery) return;
    return everyMs(loopEvery * 1000, () => {
      const loop = loopRef.current;
      const s = liveSlideRef.current;
      if (!loop || !leaderRef.current || !belongsTo(loop, s)) return;
      if (s.blank || s.forceBlack || !s.visible) return;
      loopStepRef.current(loop, 1, false);
    });
  }, [isLeader, loopEvery, playlistCurrentId, loopRestart, leaderRef, liveSlideRef]);

  // «Далі» past an item's last step (1.10.0-beta.1): the next item, while the switch is on and the
  // screen still shows the item (a song or an album asks at its own end — «Кінець», the last photo)
  // a key held down (its repeats) stops at the item's end, as at a chapter's: a new press goes on
  // (1.10.6, the Mac's round — a held → rode through the whole running order)
  const heldAtEdge = (delta: 1 | -1): Outcome => {
    const i = stepIndex(playlistItems, playlistCurrentId, delta);
    const item = i == null ? '' : playlistItems[i].label;
    return {
      ok: false,
      reason:
        delta > 0
          ? tr('Кінець пункту. Натисніть «Далі» ще раз — {item}', { item })
          : tr('Початок пункту. Натисніть «Назад» ще раз — {item}', { item }),
    };
  };
  pastItemRef.current = (delta, from, held = false) => {
    const it = playlistItems.find((i) => i.id === playlistCurrentId);
    // a «Цикл» on screen (1.10.0-beta.4): «Далі» leaves it with the switch on; without it the
    // arrows turn its slides by hand
    if (it?.kind === 'loop' && from.kind === 'slide' && belongsTo(it, liveSlideRef.current)) {
      if (orderFlow && stepIndex(playlistItems, playlistCurrentId, delta) != null) {
        if (held) return heldAtEdge(delta);
        return orderStep(delta, 'key') ? { ok: true } : { ok: false };
      }
      loopStep(it, delta);
      return { ok: true };
    }
    if (!orderFlow) return null;
    if (!it || !asksFor(it, from)) return null;
    const live = liveSlideRef.current;
    if (!stillThere(it, live, from)) return null;
    if ((from.kind === 'slide' || from.kind === 'verses') && !atItemEdge(it, live, delta))
      return null;
    // the last item (or the first, going back): the item's own step and words, as before
    if (stepIndex(playlistItems, playlistCurrentId, delta) == null) return null;
    if (held) return heldAtEdge(delta);
    return orderStep(delta, 'key') ? { ok: true } : { ok: false };
  };
  return { activatePassage, activateItem, stepPlaylist, orderStep, playlistStepRef };
}
