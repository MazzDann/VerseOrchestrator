import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { type QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { markedText } from '@vo/shared';
import { api, type Translation } from '../../api';
import { type Appearance } from '../../settingsStore';
import { type NewSeqItem, type SeqImage, type SeqItem } from '../../playlistStore';
import {
  subscribeCommand,
  type Slide,
  type SlideCountdown,
  type SlideCover,
  type SlideLine,
  type SlidePicture,
  type SlideStyle,
  type SlideTemplate,
} from '../../presenterBus';
import { formatReference } from '../../lib/reference';
import {
  commands,
  PRIORITY,
  useCommandHandler,
  type Outcome,
  type RemoteCountdown,
  type RemotePassage,
  type RemoteSong,
  type RemoteTarget,
  type ShowToggle,
  toggleOf,
} from '../../lib/commands';
import { countdownOver, coverOver, pictureSlide, sameContent } from '../../lib/slide';
import { itemCountdown } from '../../lib/countdownItem';
import { timerLook, type CountdownPlace } from '../../lib/countdown';
import { useSettings } from '../../settingsStore';
import { albumSlide } from '../../lib/album';
import { videoSlide } from '../../lib/video';
import { tr } from '../../i18n';
import { unusable } from '../../lib/denied';
import { joinVerses, redLetterSegments } from './slideText';
import { withSecond } from './songSlides';
import { noticeOnce } from '../../lib/noticeOnce';

/**
 * Show commands from outside the operator's keyboard (vo-sync, vo-remote): the default handler
 * of lib/commands.ts (E22, the effect in useCommandHandler) — «Далі» / «Назад», a remote's «На
 * екран», pick and queue, the shared running order's items, the switches — and an output
 * window's forwarded keys (E23). No return: the speaker's own preview goes to `setRemoteView`.
 */
export function useShowCommands({
  advance,
  playlistItems,
  leaderRef,
  liveSlideRef,
  countdownStart,
  pushLive,
  setLive,
  playlistSetCurrent,
  setRemoteView,
  hideToggle,
  blackToggle,
  coverToggle,
  countdownRemote,
  queryClient,
  appearance,
  translations,
  slideStyle,
  slideTemplate,
  pictureOf,
  startAlbum,
  startVideo,
  playlistAdd,
  previewOverride,
  slideLines,
  liveSlide,
  versePreview,
  send,
  followItem,
}: {
  /** a remote's «Заставка», «Відлік» or «Цикл» item leaves «Пісні» / an album, as the operator's does (1.10.5) */
  followItem: (kind: SeqItem['kind']) => void;
  /** what is on screen now: a «Заставка» item covers it (1.10.0-beta.2) */
  liveSlideRef: MutableRefObject<Slide>;
  /** «Відлік» (useTimers): a remote's «Відлік» item starts through it */
  countdownStart: (countdown: SlideCountdown, place?: CountdownPlace, onCover?: SlideCover) => void;
  advance: (delta: number, previewOnly?: boolean, held?: boolean) => Outcome | Promise<Outcome>;
  playlistItems: SeqItem[];
  leaderRef: MutableRefObject<boolean>;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
  setLive: (live: boolean) => void;
  playlistSetCurrent: (id: string | null) => void;
  setRemoteView: Dispatch<
    SetStateAction<{
      name: string;
      target: RemoteTarget | null;
      slide: Slide;
    } | null>
  >;
  hideToggle: () => void;
  blackToggle: () => void;
  coverToggle: () => void;
  countdownRemote: (c: RemoteCountdown) => Outcome;
  queryClient: QueryClient;
  appearance: Appearance;
  translations: Translation[];
  slideStyle: SlideStyle;
  slideTemplate: SlideTemplate | null;
  pictureOf: (it: SeqImage) => SlidePicture;
  startAlbum: (
    albumId: string,
    fit: SlidePicture['fit'],
    label: string,
  ) => Promise<{ slide: Slide } | { reason: string }>;
  startVideo: (
    albumId: string,
    fit: SlidePicture['fit'],
    label: string,
  ) => Promise<{ slide: Slide } | { reason: string }>;
  playlistAdd: (item: NewSeqItem) => void;
  previewOverride: Slide | null;
  slideLines: SlideLine[];
  liveSlide: Slide;
  versePreview: Slide;
  send: (overrides?: Partial<Slide>) => void;
}) {
  // Show commands from outside the operator's keyboard — an output window's keys (a
  // clicker on the 2nd monitor) and speaker remotes — all go through one dispatcher
  // (lib/commands.ts). This is the default handler; an open song registers a
  // higher-priority one for next/prev (SongsPanel).
  useCommandHandler((cmd, _source, args) => {
    if (cmd === 'next') return advance(1, false, args.held);
    if (cmd === 'prev') return advance(-1, false, args.held);
    const by = _source.name ?? tr('Пульт');
    // an item of the shared running order (0.6.9)
    if (args.item && (cmd === 'show' || cmd === 'pick')) {
      // an item of a newer version (1.9.1) never reaches a remote; as if gone
      const it = playlistItems.find((i) => i.id === args.item && i.kind !== 'foreign');
      if (!it) return { ok: false, reason: tr('Цього елемента вже немає в послідовності') };
      // «Відлік» as an item (1.10.0-beta.3): started as the operator's own — the look, the corner
      // cleared, its zero armed (review)
      if (it.kind === 'countdown' && cmd === 'show') {
        if (!leaderRef.current)
          return { ok: false, reason: tr('Показом керує інше вікно керування') };
        countdownStart(
          itemCountdown(it, Date.now()),
          'cover',
          liveSlideRef.current.cover ?? undefined,
        );
        playlistSetCurrent(it.id);
        followItem(it.kind);
        setRemoteView({ name: by, target: null, slide: liveSlideRef.current });
        return { ok: true };
      }
      // an album (1.8.12) goes on as the operator's own: open here, so «Далі» steps its photos
      if ((it.kind === 'album' || it.kind === 'video') && cmd === 'show') {
        if (!leaderRef.current)
          return { ok: false, reason: tr('Показом керує інше вікно керування') };
        const started =
          it.kind === 'album'
            ? startAlbum(it.albumId, it.fit, it.label)
            : startVideo(it.videoId, it.fit, it.label);
        return started.then((r) => {
          if ('reason' in r) return { ok: false, reason: r.reason };
          playlistSetCurrent(it.id);
          setRemoteView({ name: by, target: null, slide: r.slide });
          return { ok: true };
        });
      }
      return playlistItemSlide(it, by).then((slide) => {
        if (cmd === 'show') {
          if (!leaderRef.current)
            return { ok: false, reason: tr('Показом керує інше вікно керування') };
          pushLive(slide);
          setLive(false);
          playlistSetCurrent(it.id);
          if (it.kind === 'cover' || it.kind === 'loop') followItem(it.kind);
        }
        setRemoteView({ name: by, target: itemTarget(it), slide });
        return { ok: true };
      });
    }
    if (cmd === 'queue') {
      return args.passage || args.song
        ? queueFromRemote(
            args.passage
              ? { kind: 'verses', passage: args.passage }
              : { kind: 'song', song: args.song! },
            by,
          )
        : { ok: false, reason: tr('Нічого додати') };
    }
    const target: RemoteTarget | null = args.passage
      ? { kind: 'verses', passage: args.passage }
      : args.song
        ? { kind: 'song', song: args.song }
        : null;
    if (cmd === 'show') return target ? showRemote(target, by) : showPreview();
    if (cmd === 'pick') {
      return target
        ? buildRemote(target, by).then((slide) => {
            setRemoteView({ name: by, target, slide });
            return { ok: true };
          })
        : { ok: false, reason: tr('Не вибрано вірш') };
    }
    // «Відлік» from a remote (1.9.0-beta.10): start, pause / go on, off
    if (cmd === 'countdown') {
      return args.countdown
        ? countdownRemote(args.countdown)
        : { ok: false, reason: tr('Неправильний відлік') };
    }
    // the switches: B, «.» and (1.4.1) L pressed in an output window, a remote's buttons —
    // each by name (lib/commands.ts toggleOf), none by default
    const toggle = toggleOf(cmd);
    if (!toggle) return null;
    const flip: Record<ShowToggle, () => void> = {
      hide: hideToggle,
      black: blackToggle,
      cover: coverToggle,
    };
    flip[toggle]();
    return { ok: true };
  }, PRIORITY.verses);

  /**
   * A passage chosen on a speaker's phone (0.6.1, the remote's own cursor) as a slide —
   * built here, in the operator's style, from the library; the operator's selection is
   * not touched. Throws «Уривок недоступний» when none of its translations has it.
   */
  async function remoteSlide(p: RemotePassage, by: string): Promise<Slide> {
    const lines: SlideLine[] = [];
    /** the first translation's last verse: «вірш 16 з 36» on «Сцена» (1.9.0-beta.11) */
    let total: number | undefined;
    for (const id of p.translationIds) {
      const verses = await queryClient.fetchQuery({
        queryKey: ['verses', id, p.bookNumber, p.chapter],
        queryFn: () => api.verses(id, p.bookNumber, p.chapter),
      });
      total ??= verses.length > 0 ? verses[verses.length - 1].verse : undefined;
      const text = joinVerses(verses, p.verses, appearance.showVerseNumbers);
      if (!text.trim()) continue;
      const t = translations.find((x) => x.id === id);
      const segments = redLetterSegments(verses, p.verses, appearance.showVerseNumbers);
      lines.push({ translationAbbr: t?.abbr ?? '', text, rtl: !!t?.rtl, segments });
    }
    if (lines.length === 0) throw new Error(tr('Уривок недоступний'));
    const first = p.translationIds[0];
    const bookList = await queryClient.fetchQuery({
      queryKey: ['books', first],
      queryFn: () => api.books(first),
    });
    return {
      lines,
      reference: formatReference(
        bookList.find((b) => b.bookNumber === p.bookNumber) ?? null,
        p.chapter,
        p.verses,
      ),
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
      source: { kind: 'verses', ...p, page: 0, reveal: 1, by, ...(total ? { total } : {}) },
    };
  }

  /** A song stanza chosen on a remote (0.6.3), in the operator's style (not «як у pptx»). */
  async function remoteSongSlide(p: RemoteSong, by: string): Promise<Slide> {
    const s = await queryClient.fetchQuery({
      queryKey: ['song', p.songId],
      queryFn: () => api.song(p.songId),
    });
    const stanza = s.slides[p.stanza];
    if (!stanza) throw new Error(tr('Такої строфи немає'));
    const line: SlideLine = { translationAbbr: '', text: stanza.text, rtl: false };
    const marked = markedText(stanza.text, stanza.style);
    return {
      // its second part dimmer, as in «Простий текст» (1.3.0)
      lines: [marked ? withSecond(line, marked) : line],
      reference: `№${s.number ?? ''} ${s.title}`.trim(),
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
      source: { kind: 'song', songId: p.songId, stanza: p.stanza, by, total: s.slides.length },
    };
  }

  const buildRemote = (t: RemoteTarget, by: string) =>
    t.kind === 'verses' ? remoteSlide(t.passage, by) : remoteSongSlide(t.song, by);

  /** A running-order item as a remote target (a free-text item has none). */
  const itemTarget = (it: SeqItem): RemoteTarget | null =>
    it.kind === 'passage'
      ? {
          kind: 'verses',
          passage: {
            translationIds: it.translationIds,
            bookNumber: it.bookNumber,
            chapter: it.chapter,
            verses: it.verses,
          },
        }
      : it.kind === 'song'
        ? { kind: 'song', song: { songId: it.songId, stanza: 0 } }
        : null;

  /**
   * A running-order item shown from a remote (0.6.9) — built like the speaker's own choice
   * (the operator's style, their selection untouched); a free-text item as the operator
   * projects it.
   */
  function playlistItemSlide(it: SeqItem, by: string): Promise<Slide> {
    // «Цикл» (1.10.0-beta.4): its first slide; shown, the window in charge turns the rest
    if (it.kind === 'loop')
      return it.items[0]
        ? playlistItemSlide(it.items[0], by)
        : Promise.reject(new Error(tr('Цикл порожній')));
    const t = itemTarget(it);
    if (t) return buildRemote(t, by);
    if (it.kind === 'image') return Promise.resolve(pictureSlide(pictureOf(it), slideStyle));
    // «Відлік» as an item (1.10.0-beta.3): its time on the cover on screen (or the settings' one)
    if (it.kind === 'countdown') {
      const a = useSettings.getState().appearance;
      const now = liveSlideRef.current;
      return Promise.resolve(
        countdownOver(
          now,
          now.cover ?? { text: a.coverText, image: a.coverImage },
          { ...itemCountdown(it, Date.now()), ...timerLook(a) },
          slideStyle,
          it.label,
        ),
      );
    }
    // «Заставка» as an item (1.10.0-beta.2): its text and picture over what is on screen
    if (it.kind === 'cover')
      return Promise.resolve(
        coverOver(
          liveSlideRef.current,
          { text: it.text, image: it.image?.src ?? null },
          slideStyle,
          it.label,
        ),
      );
    if (it.kind === 'video') {
      // the speaker's preview: the video as it would start (nothing plays until it is shown)
      const id = it.videoId;
      return queryClient
        .fetchQuery({ queryKey: ['videos'], queryFn: api.videos, staleTime: 0 })
        .then((all) => {
          const v = all.find((x) => x.id === id);
          if (!v) throw new Error(tr('Відео прибрано: {name}', { name: it.label }));
          const why = unusable('file', v, it.label);
          if (why) throw new Error(why);
          const s = videoSlide(
            {
              src: v.src,
              poster: v.poster,
              name: v.name,
              fit: it.fit,
              loop: false,
              phones: 'poster',
            },
            id,
            slideStyle,
          );
          return { ...s, video: { ...s.video!, paused: 0 } };
        });
    }
    if (it.kind === 'album') {
      // the speaker's preview: the album's first photo, read from the folder now
      const id = it.albumId;
      return queryClient
        .fetchQuery({ queryKey: ['album', id], queryFn: () => api.album(id), staleTime: 0 })
        .then((info) => {
          const list = info.photos ?? [];
          const why = unusable('folder', info, it.label);
          if (why) throw new Error(why);
          if (list.length === 0) throw new Error(tr('В альбомі немає фото'));
          return albumSlide(id, list, 0, it.fit, slideStyle);
        });
    }
    const text = it.kind === 'text' ? it : null;
    return Promise.resolve({
      lines: [{ translationAbbr: '', text: text?.body ?? '', rtl: false }],
      reference: text?.title.trim() ?? '',
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
    });
  }

  /** The speaker adds their choice to the shared running order (0.6.9). */
  async function queueFromRemote(t: RemoteTarget, by: string): Promise<Outcome> {
    let label: string;
    if (t.kind === 'verses') {
      const p = t.passage;
      const first = p.translationIds[0];
      const bookList = await queryClient.fetchQuery({
        queryKey: ['books', first],
        queryFn: () => api.books(first),
      });
      label =
        formatReference(
          bookList.find((b) => b.bookNumber === p.bookNumber) ?? null,
          p.chapter,
          p.verses,
        ) || tr('Уривок');
      playlistAdd({ kind: 'passage', label, ...p });
    } else {
      const s = await queryClient.fetchQuery({
        queryKey: ['song', t.song.songId],
        queryFn: () => api.song(t.song.songId),
      });
      label = `№${s.number ?? ''} ${s.title}`.trim();
      playlistAdd({ kind: 'song', label, songId: t.song.songId, faithful: false });
    }
    notifications.show({
      message: tr('Пульт «{remote}» додав у показ: {item}', { remote: by, item: label }),
      color: 'brand',
      autoClose: 2000,
    });
    return { ok: true };
  }

  /**
   * The remote puts its passage / stanza on screen. The screen is the speaker's now: the
   * operator's selection stops following live (`live` off) — they keep preparing, and
   * their F5 / «На екран» takes the screen back.
   */
  async function showRemote(t: RemoteTarget, by: string): Promise<Outcome> {
    const slide = await buildRemote(t, by);
    if (!leaderRef.current) return { ok: false, reason: tr('Показом керує інше вікно керування') };
    pushLive(slide);
    setLive(false);
    setRemoteView({ name: by, target: t, slide });
    return { ok: true };
  }

  /**
   * A remote's «На екран» (0.6.0): what the preview shows goes on screen — the operator's
   * F5. A song stanza / free text / Strong slide in the preview is what's shown then.
   */
  function showPreview(): Outcome {
    if (previewOverride) {
      pushLive(previewOverride);
      setLive(true);
      return { ok: true };
    }
    if (slideLines.length === 0) return { ok: false, reason: tr('У передпоказі нічого немає') };
    const onScreen =
      liveSlide.visible && !liveSlide.blank && !liveSlide.forceBlack && liveSlide.lines.length > 0;
    if (onScreen && sameContent(liveSlide, versePreview))
      return { ok: true, reason: tr('Уже на екрані') };
    send();
    return { ok: true };
  }
  useEffect(
    () =>
      subscribeCommand((cmd, id, held) => {
        if (!leaderRef.current) return;
        // one batch (1.10.7): outside React's own events the stores rendered ahead of the
        // component state, and «Наживо» re-sent the verses over the text item just put up
        const done = flushSync(() =>
          commands.dispatch(id, cmd, { kind: 'output' }, held ? { held } : {}),
        );
        void done.then((o) => {
          // a clicker at the output window can't see why nothing moved — the operator can
          // (at a chapter's edge: where a second press goes, 0.6.23) — once, however long it's held
          if (!o.ok && !o.duplicate && o.reason) noticeOnce('show-edge', o.reason);
        });
      }),
    // deps as they were in Control, where the rule knew leaderRef (a ref) as stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}
