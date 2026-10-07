import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { type Lang } from '@vo/shared';
import { api, type RemoteCommand, type Pairing } from '../../api';
import { playable, type SeqItem } from '../../playlistStore';
import { type Slide, type SlideSource } from '../../presenterBus';
import { connectLive, type LiveConnection } from '../../lib/liveSocket';
import { REMOTE_LABEL } from '../../lib/remote';
import {
  asCountdown,
  asPassage,
  asSong,
  commands,
  targetArgs,
  type RemoteTarget,
  type SharedPlaylist,
} from '../../lib/commands';
import { deskFrame, forAudience, summarize } from '../../lib/slide';
import { takeServerUiState } from '../../lib/uiState';
import { SONG_KEYS } from '../../lib/songKeys';
import {
  applyHandoverFrame,
  claimForHandover,
  controlHello,
  takeHandover,
} from '../../lib/handover';
import { tr } from '../../i18n';

/**
 * The hub (vo-remote, vo-sync): the server's control socket, held by the leading window — the
 * viewers' count, which control window the hub listens to (E26 the handover's claim, E27 the
 * title of the one in charge), the remotes' commands and the hub's other frames (E28), the shared
 * running order (E29), «Запропонувати пульту» (the remotes query and the suggestion, between E29
 * and E30 as before) and the remotes' screen frame (E30). `previewSummary` and
 * `sharedPlaylistRef` are assigned during render; `previewSummary` before `previewKey` is read.
 */
export function useHub({
  liveSlideRef,
  nextSlideRef,
  previewSlide,
  isLeader,
  claim,
  lang,
  serverAvailable,
  followAlongRef,
  controlConn,
  queryClient,
  playlistItems,
  playlistCurrentId,
  previewOverride,
  verseSource,
  pageVerses,
  liveSlide,
  nextSlide,
}: {
  liveSlideRef: MutableRefObject<Slide>;
  nextSlideRef: MutableRefObject<Slide | null>;
  previewSlide: Slide;
  isLeader: boolean;
  claim: () => Promise<void>;
  lang: Lang;
  serverAvailable: boolean | null;
  followAlongRef: MutableRefObject<boolean>;
  controlConn: MutableRefObject<LiveConnection | null>;
  queryClient: QueryClient;
  playlistItems: SeqItem[];
  playlistCurrentId: string | null;
  previewOverride: Slide | null;
  verseSource: (verses?: number[], page?: number, reveal?: number) => SlideSource | undefined;
  pageVerses: number[];
  liveSlide: Slide;
  nextSlide: Slide | null;
}) {
  // Speaker remotes: this window holds the hub's control socket; paired phones' commands
  // (already scope-checked by the server) run through the same handler as the output
  // window's forwarded keys. A 'remotes' frame means the pairing list changed.
  // Remotes get compact summaries (lib/slide.ts) of what's on screen and what «Далі» shows.
  const screenFrame = () => ({
    type: 'screen',
    screen: summarize(liveSlideRef.current),
    next: nextSlideRef.current ? summarize(nextSlideRef.current) : null,
    // what the remote's «На екран» would put there (0.6.0)
    preview: JSON.parse(previewSummary.current) as ReturnType<typeof summarize>,
  });
  // Desks (1.9.0-beta.10, a control window on another computer) draw their monitors from whole
  // slides — no images, under the hub's frame cap (deskFrame) —, sent when they change: the hub
  // keeps the last for a late one.
  const slidesSent = useRef('');
  const sendSlides = (force = false) => {
    const { frame, key } = deskFrame(liveSlideRef.current, nextSlideRef.current);
    if (!force && key === slidesSent.current) return;
    if (controlConn.current?.send(frame)) slidesSent.current = key;
  };
  // the preview gets a new identity every render: compare its summary instead
  const previewSummary = useRef('');
  previewSummary.current = JSON.stringify(summarize(previewSlide));
  /** Audience phones currently on /follow (pushed by the hub). */
  const [viewers, setViewers] = useState(0);
  /**
   * Is this the control window the server listens to (0.6.8)? With control windows in two
   * browsers, remotes, their «На екрані» and the phones follow one — the first; the other
   * shows a note and can take over («Слухати тут»).
   */
  const [hubActive, setHubActive] = useState(true);
  /**
   * The browser a control window «Відкрити в … зараз» opened in took charge (the hub names it):
   * this window says control went there.
   */
  const [hubMovedTo, setHubMovedTo] = useState<string | null>(null);
  // Opened by «Відкрити в … зараз» (lib/handover.ts) while another control window of this browser
  // leads here: take over from it — for a token the server still holds — so this window's hello
  // carries the token and the hub puts it in charge.
  useEffect(() => {
    let current = true;
    void claimForHandover(takeHandover(), api.checkHandover, () => (current ? claim() : undefined));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /**
   * The socket to the hub has been down for more than a blink (0.6.25). Then nobody can say
   * which window is in charge: the Mac test saw «Слухати тут» stay up (and do nothing) after
   * the server had stopped — the last word from the hub, never taken back.
   */
  const [hubLost, setHubLost] = useState(false);
  // The window in charge has its own title (1.1.0): the start file finds it by that
  // (shortcut.ts CONTROL_TITLES) instead of opening a second one, and among the browser's
  // windows it is the one to pick. One on standby, or not in charge of the hub, keeps the plain
  // name, so the start file never brings that one forward.
  const inCharge = isLeader && hubActive;
  useEffect(() => {
    document.title = inCharge ? `VerseOrchestrator — ${tr('керування')}` : 'VerseOrchestrator';
    return () => {
      document.title = 'VerseOrchestrator';
    };
  }, [inCharge, lang]);
  /** The hub said the app is being switched off on purpose («Вимкнути повністю», 0.7.1). */
  const [appOff, setAppOff] = useState(false);
  useEffect(() => {
    // No server (static deployment / stopped): there is no hub to talk to. Standby: the
    // leading window holds the control socket, so remote commands reach one window only.
    if (serverAvailable !== true || !isLeader) return;
    let lostTimer: number | undefined;
    const c = connectLive({
      // the first hello of a window «Відкрити в … зараз» opened carries its one-time token
      hello: controlHello,
      // a restart of the server (≈1–2 s) shouldn't flash a warning; a real outage should
      onStatus: (open) => {
        window.clearTimeout(lostTimer);
        if (open) {
          setHubLost(false);
          setAppOff(false); // started again
        } else lostTimer = window.setTimeout(() => setHubLost(true), HUB_LOST_MS);
      },
      onMessage: (f) => {
        // In charge of the hub (at connect, after «Слухати тут», or when the other browser's
        // control window closed): give remotes the current screen straight away and, after a
        // server restart (the relay starts paused), restore what phones should see.
        if (f.type === 'hub') {
          setHubActive(f.active === true);
          if (f.active === true) {
            c.send(screenFrame());
            sendSlides(true);
            c.send({ type: 'playlist', playlist: sharedPlaylistRef.current });
            if (followAlongRef.current)
              c.send({ type: 'publish', slide: forAudience(liveSlideRef.current) });
          }
        }
        // «Відкрити в … зараз»: control moved to another browser (`hub`), or this window was
        // opened there and now knows which browser it is in (`handover`)
        applyHandoverFrame(f, setHubMovedTo);
        if (f.type === 'viewers' && typeof f.count === 'number') setViewers(f.count);
        if (f.type === 'shutdown') setAppOff(true);
        // `songs` is a permission, never a command (the server doesn't forward it)
        if (
          f.type === 'command' &&
          typeof f.cmd === 'string' &&
          f.cmd in REMOTE_LABEL &&
          f.cmd !== 'songs' &&
          f.cmd !== 'playlist'
        ) {
          const cmd = f.cmd as Exclude<RemoteCommand, 'songs' | 'playlist'>;
          const from = String(f.from ?? '');
          const id = typeof f.id === 'string' ? f.id : `ws-${Date.now()}`;
          const passage = asPassage(f.passage);
          const song = passage ? undefined : asSong(f.song);
          const item = typeof f.item === 'string' ? f.item : undefined;
          const countdown = asCountdown(f.countdown);
          void commands
            .dispatch(id, cmd, { kind: 'remote', name: from }, { passage, song, item, countdown })
            .then((outcome) => {
              // The remote is acked with what really happened (server/src/live.ts onCommand).
              if (typeof f.id === 'string') c.send({ type: 'result', id: f.id, ...outcome });
              // the speaker walking their own preview isn't news for the operator
              if (outcome.duplicate || (cmd === 'pick' && outcome.ok)) return;
              notifications.show({
                message:
                  tr('Пульт «{remote}»: {command}', {
                    remote: from,
                    command: tr(REMOTE_LABEL[cmd]),
                  }) + (outcome.ok ? '' : ` — ${outcome.reason ?? tr('не виконано')}`),
                color: outcome.ok ? 'brand' : 'orange',
                autoClose: 1200,
              });
            });
        } else if (f.type === 'remotes') {
          void queryClient.invalidateQueries({ queryKey: ['remotes'] });
        } else if (f.type === 'ui-state') {
          // a backup restored or undone (1.5.0), maybe from another window: its state, now
          void takeServerUiState().then((ok) => {
            if (!ok) return;
            // the restore replaced the song bundles and the pictures as well
            for (const key of ['backup-state', ...SONG_KEYS, 'images'])
              void queryClient.invalidateQueries({ queryKey: [key] });
            notifications.show({
              message: tr('Налаштування й програми замінено з резервної копії.'),
              color: 'gray',
              autoClose: 4000,
            });
          });
        } else if (f.type === 'suggested') {
          // the hub's answer to «Запропонувати пульту» (0.6.4)
          const name =
            queryClient.getQueryData<Pairing[]>(['remotes'])?.find((p) => p.id === f.to)?.name ??
            tr('пульт');
          notifications.show(
            typeof f.delivered === 'number' && f.delivered > 0
              ? {
                  message: tr('Запропоновано: «{remote}»', { remote: name }),
                  color: 'green',
                  autoClose: 1500,
                }
              : {
                  message: `«${name}»: ${f.reason ? tr(String(f.reason)) : tr('не доставлено')}`,
                  color: 'orange',
                },
          );
        }
      },
    });
    controlConn.current = c;
    return () => {
      controlConn.current = null;
      window.clearTimeout(lostTimer);
      setHubActive(true);
      setHubMovedTo(null);
      setHubLost(false);
      c.stop();
    };
    // deps as they were: the rule knew these refs (now from useLivePipeline) as stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, serverAvailable, isLeader]);
  // The shared running order (0.6.9): a summary of «Послідовність показу» for remotes
  // allowed «Послідовність» (the hub relays it to them only) — ids, labels, the current
  // item, and what a phone needs to walk a passage / song with its own cursor.
  const sharedPlaylist: SharedPlaylist = useMemo(
    () => ({
      // an item of a newer version (1.9.1) stays here: a remote can't show it
      items: playlistItems.filter(playable).map((it) =>
        it.kind === 'passage'
          ? {
              id: it.id,
              kind: 'passage',
              label: it.label,
              translationIds: it.translationIds,
              bookNumber: it.bookNumber,
              chapter: it.chapter,
              verses: it.verses,
            }
          : it.kind === 'song'
            ? { id: it.id, kind: 'song', label: it.label, songId: it.songId }
            : it.kind === 'image' || it.kind === 'album' || it.kind === 'video'
              ? { id: it.id, kind: it.kind, label: it.label }
              : { id: it.id, kind: 'text', label: it.label },
      ),
      currentId: playlistCurrentId,
    }),
    [playlistItems, playlistCurrentId],
  );
  const sharedPlaylistRef = useRef(sharedPlaylist);
  sharedPlaylistRef.current = sharedPlaylist;
  useEffect(() => {
    if (hubActive) controlConn.current?.send({ type: 'playlist', playlist: sharedPlaylist });
    // deps as they were: controlConn is a ref (now from useLivePipeline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedPlaylist, hubActive]);

  // «Запропонувати пульту» (0.6.4): the operator's preview — a verse page or a song stanza —
  // to a speaker's remote allowed to choose that kind and online now.
  const remotesQuery = useQuery({
    queryKey: ['remotes'],
    queryFn: api.remotes,
    enabled: serverAvailable === true && isLeader,
  });
  const suggestTarget: RemoteTarget | null = (() => {
    const src = previewOverride ? previewOverride.source : verseSource(pageVerses);
    if (src?.kind === 'song')
      return { kind: 'song', song: { songId: src.songId, stanza: src.stanza } };
    if (src?.kind === 'verses') {
      const { translationIds, bookNumber, chapter } = src;
      return {
        kind: 'verses',
        passage: {
          translationIds,
          bookNumber,
          chapter,
          verses: previewOverride ? src.verses : pageVerses,
        },
      };
    }
    return null; // free text: nothing a remote could choose
  })();
  const suggestRemotes = suggestTarget
    ? (remotesQuery.data ?? []).filter(
        (p) => p.online && p.allowed.includes(suggestTarget.kind === 'verses' ? 'pick' : 'songs'),
      )
    : [];
  const suggestion =
    suggestTarget && suggestRemotes.length > 0
      ? {
          remotes: suggestRemotes.map((p) => ({ id: p.id, name: p.name })),
          onSend: (id: string) => {
            const sent = controlConn.current?.send({
              type: 'suggest',
              to: id,
              ...targetArgs(suggestTarget),
              reference: previewSlide.reference,
              text: previewSlide.lines[0]?.text ?? '',
            });
            if (!sent)
              notifications.show({ message: tr('Немає зв’язку з сервером'), color: 'red' });
          },
        }
      : null;

  // Keep remotes' «На екрані» / «Передпоказ» / «Далі» in step (independent of follow-along) — and
  // the desks' whole slides, only when they changed (a preview step doesn't resend them).
  const previewKey = previewSummary.current;
  useEffect(() => {
    controlConn.current?.send(screenFrame());
    sendSlides();
    // deps as they were: controlConn and the refs screenFrame reads now come from useLivePipeline
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSlide, nextSlide, previewKey]);
  return { viewers, hubActive, hubMovedTo, hubLost, appOff, suggestion };
}

/**
 * How long the socket to the hub may be down before the operator is told (0.6.25), counted
 * from the drop (0.6.29: a failed retry no longer restarts it — with retries every 2 s it
 * never ran out). The retries 0.5 / 1.5 / 3.5 s after the drop catch a restart of up to
 * ~3.5 s before this.
 */
const HUB_LOST_MS = 4000;
