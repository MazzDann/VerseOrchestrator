import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RemoteCommand } from '../api';
import { connectLive, type HubFrame, type LiveConnection } from '../lib/liveSocket';
import { REMOTE_LABEL } from '../lib/remote';
import {
  newCommandId,
  targetArgs,
  type CommandArgs,
  type PlaylistEntry,
  type RemoteCountdown,
  type RemotePassage,
  type RemoteTarget,
  type SharedPlaylist,
} from '../lib/commands';
import { formatTimer, hubOffset, parseDuration, useCountdown } from '../lib/countdown';
import { RemotePlaylist } from '../components/RemotePlaylist';
import { inPhoneWords, type ScreenSummary } from '../lib/slide';
import { formatReference } from '../lib/reference';
import {
  chapterName,
  crossTarget,
  edgeNotice,
  landingVerse,
  pressAtEdge,
  translationEdge,
  type CrossArm,
} from '../lib/chapterCross';
import { believedHidden, songEndStep, type EndGuard } from '../lib/songEnd';
import { RemotePicker } from '../components/RemotePicker';
import { tr, trn, useLang } from '../i18n';
import { IconMoon, IconSun, IconSunMoon } from '@tabler/icons-react';
import { nextPhoneTheme, themeAttr, themeLabel, usePhoneTheme } from '../lib/phoneTheme';

const sameSummary = (a: ScreenSummary | null, b: ScreenSummary | null) =>
  !!a && !!b && a.kind === b.kind && a.reference === b.reference && a.text === b.text;

const sameNums = (a: number[], b: number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);
/** Is this screen summary the speaker's own cursor (a passage or a song stanza)? */
function showsTarget(s: ScreenSummary | null, t: RemoteTarget | null): boolean {
  const src = s?.source;
  if (!src || !t) return false;
  if (t.kind === 'song') {
    return src.kind === 'song' && src.songId === t.song.songId && src.stanza === t.song.stanza;
  }
  const p = t.passage;
  return (
    src.kind === 'verses' &&
    src.bookNumber === p.bookNumber &&
    src.chapter === p.chapter &&
    sameNums(src.translationIds, p.translationIds) &&
    sameNums(src.verses, p.verses)
  );
}

/** What is on screen, as a target — where the picker opens when the speaker has no cursor. */
function screenTarget(s: ScreenSummary | null): RemoteTarget | null {
  const src = s?.source;
  if (src?.kind === 'verses') {
    const { translationIds, bookNumber, chapter, verses } = src;
    return { kind: 'verses', passage: { translationIds, bookNumber, chapter, verses } };
  }
  if (src?.kind === 'song')
    return { kind: 'song', song: { songId: src.songId, stanza: src.stanza } };
  return null;
}

/** A running-order item as a target the speaker's cursor can walk (a free text can't). */
function entryTarget(e: PlaylistEntry): RemoteTarget | undefined {
  if (e.kind === 'passage') {
    const { translationIds, bookNumber, chapter, verses } = e;
    return { kind: 'verses', passage: { translationIds, bookNumber, chapter, verses } };
  }
  if (e.kind === 'song') return { kind: 'song', song: { songId: e.songId, stanza: 0 } };
  return undefined;
}

/** The remembered cursor — also one saved by 0.6.1, which was a bare passage. */
function recallCursor(): RemoteTarget | null {
  const raw = recall<RemoteTarget | RemotePassage>(CURSOR_KEY);
  if (!raw) return null;
  if ('kind' in raw) return raw;
  return 'translationIds' in raw ? { kind: 'verses', passage: raw } : null;
}

/** Per-phone memory (not shared, not needed to work): the cursor and the chosen translations. */
const CURSOR_KEY = 'vo:remote-cursor';
const TRANSLATIONS_KEY = 'vo:remote-translations';
function remember<T>(key: string, value: T | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: just not remembered */
  }
}
function recall<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Speaker remote (/remote#<token>): a phone paired by the operator via QR. It can only
 * send the commands its pairing allows (server-enforced) and shows what's on screen now.
 * The token rides in the URL fragment, so it never reaches server logs or Referer headers.
 */

/** A press made while offline is resent on reconnect within this window, then dropped. */
const RESEND_MS = 5000;

type State =
  | { kind: 'connecting' }
  | { kind: 'ready'; name: string; allowed: RemoteCommand[] }
  /** `off`: the operator switched the app off («Вимкнути повністю», 0.7.1) — not a blip */
  | { kind: 'offline'; name?: string; allowed?: RemoteCommand[]; off?: boolean }
  | { kind: 'denied'; reason: string };

export function Remote() {
  const [theme, setTheme] = usePhoneTheme();
  useLang();
  const token = decodeURIComponent(window.location.hash.slice(1));
  const [state, setState] = useState<State>(
    token ? { kind: 'connecting' } : { kind: 'denied', reason: '' },
  );
  const [screenSent, setScreen] = useState<ScreenSummary | null>(null);
  const [nextSent, setNext] = useState<ScreenSummary | null>(null);
  /** The control window's preview — what «На екран» puts on screen (0.6.0). */
  const [previewSent, setPreview] = useState<ScreenSummary | null>(null);
  // «Заставка» and the viewers' QR in this phone's language, not the operator's (1.4.2)
  const screen = inPhoneWords(screenSent);
  const next = inPhoneWords(nextSent);
  const preview = inPhoneWords(previewSent);
  const [notice, setNotice] = useState<string | null>(null);
  // how far the computer's clock is ahead of this phone's (1.11.0-beta.1): «Відлік» counts by it
  const [offset, setOffset] = useState(0);
  const conn = useRef<LiveConnection | null>(null);
  const noticeTimer = useRef<number | undefined>();
  /**
   * Presses not yet answered, by id (0.4.3). The server acks with the control window's
   * real outcome; a press made while the connection is down is resent on reconnect with
   * the SAME id — applied once even if the first copy did get through.
   */
  const pending = useRef(
    new Map<
      string,
      {
        cmd: RemoteCommand;
        at: number;
        sent: boolean;
        /** what goes over the hub: a passage, a stanza or a running-order item */
        args: CommandArgs;
        /** the speaker's cursor once this is acked */
        target?: RemoteTarget;
        /** an album put on screen (1.8.12): «Далі» steps it there, not a cursor of this phone */
        dropCursor?: boolean;
      }
    >(),
  );
  /**
   * The speaker's own cursor: a verse (0.6.1) or a song stanza (0.6.3) chosen on this
   * phone. It moves only once the control window has taken it (ack ok); «Далі/Назад» then
   * walk it instead of the operator's selection. Null: the remote follows the operator.
   */
  const [cursor, setCursorState] = useState<RemoteTarget | null>(recallCursor);
  const setCursor = (t: RemoteTarget | null) => {
    setCursorState(t);
    remember(CURSOR_KEY, t);
  };
  const [pickerOpen, setPickerOpen] = useState(false);
  /** The operator's running order (0.6.9) — when this remote may see it. */
  const [playlist, setPlaylist] = useState<SharedPlaylist | null>(null);
  const [listOpen, setListOpen] = useState(false);
  /** What the operator suggested (0.6.4) — the speaker takes it or not. */
  const [suggestion, setSuggestion] = useState<{
    target: RemoteTarget;
    reference: string;
    text: string;
  } | null>(null);
  /** Last press → ack round trip, ms — shown next to the name. */
  const [rtt, setRtt] = useState<number | null>(null);

  const flash = (msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  };

  useEffect(() => {
    if (!token) return;
    // the hub's time: asked on every connect and every few minutes (clocks drift), as /follow does
    const askClock = () => c.send({ type: 'clock', t: Date.now() });
    const clock = window.setInterval(askClock, 5 * 60_000);
    const c = connectLive({
      hello: { role: 'remote', token },
      onStatus: (open) => {
        if (open) askClock();
        setState((s) =>
          open || s.kind === 'denied' || s.kind === 'offline'
            ? s
            : {
                kind: 'offline',
                ...(s.kind === 'ready' ? { name: s.name, allowed: s.allowed } : {}),
              },
        );
      },
      onMessage: (f: HubFrame) => {
        if (f.type === 'clock' && typeof f.t === 'number' && typeof f.now === 'number') {
          setOffset(hubOffset(f.t, f.now, Date.now()));
          return;
        }
        if (f.type === 'shutdown') {
          setState((s) =>
            s.kind === 'denied'
              ? s
              : {
                  kind: 'offline',
                  ...(s.kind === 'ready' || s.kind === 'offline'
                    ? { name: s.name, allowed: s.allowed }
                    : {}),
                  off: true,
                },
          );
          return;
        }
        // «На екрані» comes from the control window's screen relay (remotes only), not
        // the audience slide — so it works even with follow-along switched off.
        if (f.type === 'screen') {
          setScreen((f.screen as ScreenSummary | null) ?? null);
          setNext((f.next as ScreenSummary | null) ?? null);
          setPreview((f.preview as ScreenSummary | null) ?? null);
        } else if (f.type === 'playlist') {
          // the operator's running order, when this remote may see it (0.6.9)
          setPlaylist((f.playlist as SharedPlaylist | null) ?? null);
        } else if (f.type === 'suggest') {
          const target: RemoteTarget | null = f.passage
            ? { kind: 'verses', passage: f.passage as RemotePassage }
            : f.song
              ? { kind: 'song', song: f.song as { songId: number; stanza: number } }
              : null;
          if (target) {
            navigator.vibrate?.([20, 60, 20]);
            setSuggestion({
              target,
              reference: String(f.reference ?? ''),
              text: String(f.text ?? ''),
            });
          }
        } else if (f.type === 'allowed') {
          // the operator changed what this remote may do (0.6.0): buttons follow at once
          const allowed = (f.allowed as RemoteCommand[]) ?? [];
          setState((s) => (s.kind === 'ready' || s.kind === 'offline' ? { ...s, allowed } : s));
        } else if (f.type === 'welcome') {
          setState({
            kind: 'ready',
            name: String(f.name ?? tr('Пульт')),
            allowed: (f.allowed as RemoteCommand[]) ?? [],
          });
          // Back online: resend what was pressed in the last few seconds (same ids).
          for (const [id, p] of pending.current) {
            if (Date.now() - p.at > RESEND_MS) {
              pending.current.delete(id);
              continue;
            }
            p.sent = c.send({ type: 'command', cmd: p.cmd, id, ...p.args });
          }
        } else if (f.type === 'denied') {
          setState({ kind: 'denied', reason: String(f.reason ?? '') });
        } else if (f.type === 'revoked') {
          setState({ kind: 'denied', reason: tr('Оператор відкликав цей пульт.') });
        } else if (f.type === 'ack') {
          const p = typeof f.id === 'string' ? pending.current.get(f.id) : undefined;
          if (p) {
            pending.current.delete(f.id as string);
            setRtt(Date.now() - p.at);
            // the control window has it: it's the speaker's cursor now
            if (f.ok && p.target) {
              setCursorState(p.target);
              remember(CURSOR_KEY, p.target);
            } else if (f.ok && p.dropCursor) {
              setCursorState(null);
              remember(CURSOR_KEY, null);
            }
          }
          // the reason comes in the operator's language, or from the server: a key either way
          if (!f.ok) flash(f.reason ? tr(String(f.reason)) : tr('Команду не виконано'));
        }
      },
      stopOn: (f) => f.type === 'denied' || f.type === 'revoked',
    });
    conn.current = c;
    return () => {
      window.clearInterval(clock);
      c.stop();
    };
  }, [token]);

  const allowed = state.kind === 'ready' || state.kind === 'offline' ? (state.allowed ?? []) : [];
  const ready = state.kind === 'ready';

  const press = (
    cmd: RemoteCommand,
    target?: RemoteTarget,
    entry?: PlaylistEntry,
    /** what a «Відлік» press asks for (1.11.0-beta.1) */
    countdown?: RemoteCountdown,
  ) => {
    if (state.kind === 'connecting') return;
    // `pick` / `queue` are allowed by what they carry: verses → «Вибір віршів», a stanza →
    // «Пісні», a running-order item or adding to it → «Послідовність»
    if (cmd !== 'pick' && cmd !== 'queue' && !allowed.includes(cmd)) return;
    if (target?.kind === 'verses' && !allowed.includes('pick')) return;
    if (target?.kind === 'song' && !allowed.includes('songs')) return;
    if ((entry || cmd === 'queue') && !allowed.includes('playlist')) return;
    navigator.vibrate?.(12);
    const id = newCommandId();
    const args: CommandArgs = countdown
      ? { countdown }
      : entry
        ? { item: entry.id }
        : targetArgs(target);
    // after an item is taken the speaker's cursor walks it — when they may choose that kind
    const walkable = entry ? entryTarget(entry) : cmd === 'queue' ? undefined : target;
    const cursorAfter =
      walkable && allowed.includes(walkable.kind === 'verses' ? 'pick' : 'songs')
        ? walkable
        : undefined;
    const sent = !!conn.current?.send({ type: 'command', cmd, id, ...args });
    const dropCursor = cmd === 'show' && entry?.kind === 'album';
    pending.current.set(id, { cmd, at: Date.now(), sent, args, target: cursorAfter, dropCursor });
    if (!sent) flash(tr('Немає зв’язку — надішлю, щойно підключуся'));
    // No answer at all (server gone mid-press): say so instead of leaving it silent.
    window.setTimeout(() => {
      if (pending.current.delete(id)) flash(tr('Немає відповіді. Команду, можливо, не виконано.'));
    }, RESEND_MS);
  };

  // Scanning a NEW QR into an open tab only changes the #fragment (no navigation), which
  // would keep the old token — start over with the new one.
  useEffect(() => {
    const onHash = () => window.location.reload();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // The cursor's chapter (its first translation) or song: its text, and where «Далі» goes.
  const passage = cursor?.kind === 'verses' ? cursor.passage : null;
  const songPick = cursor?.kind === 'song' ? cursor.song : null;
  const primary = passage?.translationIds[0];
  const cursorVerses = useQuery({
    queryKey: ['verses', primary, passage?.bookNumber, passage?.chapter],
    queryFn: () => api.verses(primary!, passage!.bookNumber, passage!.chapter),
    enabled: !!passage,
  });
  const cursorBooks = useQuery({
    queryKey: ['books', primary],
    queryFn: () => api.books(primary!),
    enabled: !!passage,
  });
  const cursorChapters = useQuery({
    queryKey: ['chapters', primary, passage?.bookNumber],
    queryFn: () => api.chapters(primary!, passage!.bookNumber),
    enabled: !!passage,
  });
  const queryClient = useQueryClient();
  const crossArm = useRef<CrossArm | null>(null);
  /** the song's end as this phone last left it (0.6.24) — see walk() */
  const endGuard = useRef<EndGuard | null>(null);
  const cursorSong = useQuery({
    queryKey: ['song', songPick?.songId],
    queryFn: () => api.song(songPick!.songId),
    enabled: !!songPick,
  });
  const mineOnScreen = showsTarget(screen, cursor);
  const canVerses = allowed.includes('pick');
  const canSongs = allowed.includes('songs');
  const canPick = canVerses || canSongs;
  const canPlaylist = allowed.includes('playlist');
  const listAt = playlist ? playlist.items.findIndex((i) => i.id === playlist.currentId) : -1;
  const listCurrent = listAt >= 0 ? playlist!.items[listAt] : undefined;
  const listNext = playlist?.items[listAt + 1];
  const canShow = allowed.includes('show');

  /**
   * «Далі/Назад» with a cursor: the next / previous verse of its chapter — on screen when
   * the cursor is on screen (a clicker), else into the speaker's preview.
   */
  const walk = (delta: number) => {
    if (!cursor) return press(delta > 0 ? 'next' : 'prev');
    let next: RemoteTarget;
    if (songPick) {
      const count = cursorSong.data?.slides.length ?? 0;
      // its last stanza on screen (0.6.24): «Далі» empties the screen, again → the end,
      // «Назад» brings exactly that stanza back (lib/songEnd.ts)
      const key = `${songPick.songId}:${songPick.stanza}`;
      const now = Date.now();
      const end = songEndStep({
        atLast: count > 0 && songPick.stanza === count - 1,
        onScreen: mineOnScreen && canShow,
        canHide: allowed.includes('blank'),
        hidden: believedHidden(endGuard.current, key, now, screen?.status === 'blank'),
        delta,
      });
      if (end === 'end') return flash(tr('Кінець пісні'));
      if (end === 'hide' || end === 'show') {
        endGuard.current = { key, at: now, hidden: end === 'hide' };
        if (end === 'show') setNotice(null); // «Кінець пісні» no longer holds
        return press('blank');
      }
      const to = songPick.stanza + delta;
      if (to < 0 || to >= count) {
        return flash(delta > 0 ? tr('Це остання строфа') : tr('Це перша строфа'));
      }
      next = { kind: 'song', song: { ...songPick, stanza: to } };
    } else {
      const p = passage!;
      const list = (cursorVerses.data ?? []).map((v) => v.verse);
      const at = list.indexOf(p.verses[p.verses.length - 1]);
      const to = at >= 0 ? list[at + delta] : undefined;
      if (to == null) {
        if (at < 0) return flash(tr('Розділ ще завантажується'));
        return void crossChapter(p, delta);
      }
      crossArm.current = null;
      next = { kind: 'verses', passage: { ...p, verses: [to] } };
    }
    press(mineOnScreen && canShow ? 'show' : 'pick', next);
  };
  /**
   * The cursor at its chapter's edge (0.6.23): the first press says where a second one
   * goes; pressed again within 5 s the cursor opens the next chapter's first verse (the
   * previous one's last going back) — on screen when the cursor is on screen. At a book's
   * edge the same two presses open the next book (1.4.0).
   */
  const crossChapter = async (p: RemotePassage, delta: number) => {
    if (!cursorChapters.data || !cursorBooks.data) {
      return flash(delta > 0 ? tr('Це останній вірш розділу') : tr('Це перший вірш розділу'));
    }
    const tid = p.translationIds[0];
    const key = `${tid}:${p.bookNumber}:${p.chapter}:${delta > 0 ? 1 : -1}`;
    const step = pressAtEdge(crossArm.current, key, Date.now());
    crossArm.current = step.arm;
    const onScreenNow = mineOnScreen && canShow;
    try {
      const target = await crossTarget(
        { book: p.bookNumber, chapter: p.chapter },
        cursorChapters.data,
        cursorBooks.data.map((b) => b.bookNumber),
        delta,
        (b) =>
          queryClient.fetchQuery({
            queryKey: ['chapters', tid, b],
            queryFn: () => api.chapters(tid, b),
          }),
      );
      if (!target) {
        crossArm.current = null;
        return flash(translationEdge(delta));
      }
      const to = target.chapter;
      const book = cursorBooks.data.find((b) => b.bookNumber === target.book) ?? null;
      if (!step.cross) return flash(edgeNotice(delta, chapterName(book, to), target.newBook));
      const verses = await queryClient.fetchQuery({
        queryKey: ['verses', tid, target.book, to],
        queryFn: () => api.verses(tid, target.book, to),
      });
      const v = landingVerse(
        verses.map((x) => x.verse),
        delta,
      );
      if (v == null) return flash(tr('У цьому розділі немає віршів'));
      setNotice(null); // «натисніть ще раз» is done with
      press(onScreenNow ? 'show' : 'pick', {
        kind: 'verses',
        passage: { ...p, bookNumber: target.book, chapter: to, verses: [v] },
      });
    } catch {
      flash(tr('Не вдалося відкрити розділ — перевірте зв’язок'));
    }
  };
  const showNow = () => (cursor ? press('show', cursor) : press('show'));
  // «Заставка» / «Відлік» on screen (1.11.0-beta.1): the buttons say what a press does
  const onCover = screen?.kind === 'cover' || screen?.kind === 'countdown';
  const running = screenSent?.countdown ?? null;

  // A Bluetooth clicker paired to the phone sends arrow / page keys — honour them too.
  const keysRef = useRef({ walk, showNow, pickerOpen });
  keysRef.current = { walk, showNow, pickerOpen };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (keysRef.current.pickerOpen) return; // the picker's own list / filter
      // a field's own keys: «Відлік»'s length (1.11.0-beta.1 review — Enter put the preview up,
      // the space walked the show)
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]'))
        return;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) keysRef.current.walk(1);
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) keysRef.current.walk(-1);
      else if (e.key === 'Enter') keysRef.current.showNow();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onScreen = screen?.status === 'live';
  const screenLabel =
    screen?.status === 'black'
      ? tr('Чорний екран')
      : screen?.status === 'blank'
        ? tr('Текст сховано')
        : onScreen
          ? screen!.reference || tr('На екрані')
          : tr('Порожньо');
  const previewText = preview?.status === 'live' ? preview : null;
  const previewOnScreen = onScreen && sameSummary(previewText, screen);
  const cursorText = passage
    ? (cursorVerses.data?.find((v) => v.verse === passage.verses[0])?.text ?? '')
    : songPick
      ? (cursorSong.data?.slides[songPick.stanza]?.text ?? '')
      : '';
  const cursorRef = passage
    ? formatReference(
        cursorBooks.data?.find((b) => b.bookNumber === passage.bookNumber) ?? null,
        passage.chapter,
        passage.verses,
      )
    : songPick && cursorSong.data
      ? `№${cursorSong.data.number ?? ''} ${cursorSong.data.title} · ${tr('строфа {n}/{total}', {
          n: songPick.stanza + 1,
          total: cursorSong.data.slides.length,
        })}`
      : '';
  // walking needs the right to choose what the cursor holds
  const walks = passage ? canVerses : songPick ? canSongs : false;

  if (state.kind === 'denied') {
    return (
      <div
        className="vo-follow vo-remote"
        data-theme={themeAttr(theme)}
        style={{ justifyContent: 'center', textAlign: 'center' }}
      >
        <p style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{tr('Пульт недоступний')}</p>
        <p style={{ opacity: 0.7, margin: '8px 0 0' }}>
          {state.reason
            ? tr(state.reason)
            : tr('Відскануйте QR у вікні керування: Пульт доповідача → Створити пульт.')}
        </p>
      </div>
    );
  }

  return (
    <div className="vo-follow vo-remote" data-theme={themeAttr(theme)}>
      {/* everything scrolls except the footer: «Назад / Далі» stay under the thumb (0.6.15) */}
      <div className="vo-remote-body">
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span
            aria-hidden
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: ready ? '#2f9e44' : '#e8590c',
            }}
          />
          <strong>
            {state.kind === 'connecting' ? tr('Підключення…') : (state.name ?? tr('Пульт'))}
          </strong>
          <span style={{ opacity: 0.6 }}>
            {state.kind === 'offline'
              ? state.off
                ? tr('· застосунок вимкнено')
                : tr('· немає зв’язку, перепідключаюся')
              : ready && rtt != null
                ? `· ${tr('відповідь {ms} мс', { ms: rtt })}`
                : ''}
          </span>
          {/* light / dark of its own (1.8.12-beta.8, F1005-04): one tap goes round «Як у телефоні»,
              «Світла», «Темна» — kept on this phone */}
          <button
            type="button"
            className="vo-remote-theme"
            onClick={() => setTheme(nextPhoneTheme(theme))}
            aria-label={tr('Тема: {name}', { name: themeLabel(theme) })}
            title={tr('Тема: {name}', { name: themeLabel(theme) })}
          >
            {theme === 'light' ? (
              <IconSun size={18} stroke={1.6} />
            ) : theme === 'dark' ? (
              <IconMoon size={18} stroke={1.6} />
            ) : (
              <IconSunMoon size={18} stroke={1.6} />
            )}
          </button>
        </header>

        <section className="vo-remote-screen" aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: onScreen ? 'var(--mantine-color-live-filled)' : 'currentColor',
                opacity: onScreen ? 1 : 0.35,
              }}
            />
            <span style={{ fontWeight: 600 }}>{tr('На екрані')}</span>
            <span style={{ opacity: 0.65 }}>{screenLabel}</span>
          </div>
          {onScreen && (
            <p
              className="vo-remote-text"
              style={{ fontFamily: screen!.font ?? '"Lora", Georgia, serif' }}
            >
              {screen!.text}
            </p>
          )}
        </section>

        {pickerOpen && (
          <RemotePicker
            start={cursor ?? screenTarget(screen)}
            translationIds={
              passage?.translationIds ??
              recall<number[]>(TRANSLATIONS_KEY) ??
              (screen?.source?.kind === 'verses' ? screen.source.translationIds : [])
            }
            canShow={canShow}
            verses={canVerses}
            songs={canSongs}
            onPick={(t, show) => {
              if (t.kind === 'verses') remember(TRANSLATIONS_KEY, t.passage.translationIds);
              press(show ? 'show' : 'pick', t);
              setPickerOpen(false);
            }}
            onQueue={
              canPlaylist
                ? (t) => {
                    press('queue', t);
                    setPickerOpen(false);
                  }
                : undefined
            }
            onClose={() => setPickerOpen(false)}
          />
        )}

        {listOpen && playlist && (
          <RemotePlaylist
            playlist={playlist}
            canShow={canShow}
            onTake={(entry, show) => {
              press(show ? 'show' : 'pick', undefined, entry);
              setListOpen(false);
            }}
            onClose={() => setListOpen(false)}
          />
        )}

        {/* The shared running order (0.6.9): where the show is, and what's next in it. */}
        {canPlaylist && playlist && playlist.items.length > 0 && (
          <section className="vo-remote-preview" aria-label={tr('Послідовність')}>
            <div style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600 }}>{tr('Послідовність')}</span>
              <span style={{ opacity: 0.65, flex: 1, minWidth: 0 }}>
                {listCurrent
                  ? tr('зараз: {item}', { item: listCurrent.label })
                  : trn(playlist.items.length, '{n} елем.|{n} елем.|{n} елем.')}
              </span>
            </div>
            {listNext && (
              <p className="vo-remote-text vo-remote-text-small" style={{ margin: 0 }}>
                {tr('Далі: {item}', { item: listNext.label })}
              </p>
            )}
            <div className="vo-remote-row">
              <button
                type="button"
                className="vo-remote-btn"
                disabled={!ready}
                onClick={() => setListOpen(true)}
              >
                {tr('Список…')}
              </button>
              {listNext &&
                (canShow ? (
                  <button
                    type="button"
                    className="vo-remote-btn vo-remote-btn-live"
                    disabled={!ready}
                    onClick={() => press('show', undefined, listNext)}
                  >
                    {tr('Наступне на екран')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="vo-remote-btn"
                    disabled={!ready}
                    onClick={() => press('pick', undefined, listNext)}
                  >
                    {tr('Наступне в передпоказ')}
                  </button>
                ))}
            </div>
          </section>
        )}

        {/* The operator's suggestion (0.6.4): take it into your preview, show it, or not. */}
        {suggestion && (
          <section
            className="vo-remote-preview vo-remote-suggest"
            aria-label={tr('Пропозиція оператора')}
          >
            <div style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600 }}>{tr('Оператор пропонує')}</span>
              <span style={{ opacity: 0.65, flex: 1, minWidth: 0 }}>{suggestion.reference}</span>
              <button
                type="button"
                className="vo-remote-chip"
                onClick={() => setSuggestion(null)}
                aria-label={tr('Відхилити пропозицію')}
              >
                ✕
              </button>
            </div>
            {suggestion.text && (
              <p className="vo-remote-text vo-remote-text-small" style={{ whiteSpace: 'pre-line' }}>
                {suggestion.text}
              </p>
            )}
            <div className="vo-remote-row">
              <button
                type="button"
                className="vo-remote-btn"
                disabled={!ready}
                onClick={() => {
                  press('pick', suggestion.target);
                  setSuggestion(null);
                }}
              >
                {tr('У передпоказ')}
              </button>
              {canShow && (
                <button
                  type="button"
                  className="vo-remote-btn vo-remote-btn-live"
                  disabled={!ready}
                  onClick={() => {
                    press('show', suggestion.target);
                    setSuggestion(null);
                  }}
                >
                  {tr(REMOTE_LABEL.show)}
                </button>
              )}
            </div>
          </section>
        )}

        {/* The speaker's own preview (0.6.1): a verse chosen here — «Далі» walks it. */}
        {canPick && cursor && (
          <section className="vo-remote-preview vo-remote-mine" aria-label={tr('Ваш передпоказ')}>
            <div style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600 }}>{tr('Ваш передпоказ')}</span>
              <span style={{ opacity: 0.65, flex: 1, minWidth: 0 }}>
                {mineOnScreen ? tr('на екрані') : cursorRef}
              </span>
              <button
                type="button"
                className="vo-remote-chip"
                onClick={() => setCursor(null)}
                aria-label={tr('Скинути: гортати разом з оператором')}
              >
                ✕
              </button>
            </div>
            {!mineOnScreen && cursorText && (
              <p className="vo-remote-text vo-remote-text-small">{cursorText}</p>
            )}
            <div className="vo-remote-row">
              <button
                type="button"
                className="vo-remote-btn"
                disabled={!ready}
                onClick={() => setPickerOpen(true)}
              >
                {tr('Вибрати…')}
              </button>
              {canShow && (
                <button
                  type="button"
                  className="vo-remote-btn vo-remote-btn-live"
                  disabled={!ready || mineOnScreen}
                  onClick={() => press('show', cursor)}
                >
                  {tr(REMOTE_LABEL.show)}
                </button>
              )}
            </div>
          </section>
        )}
        {canPick && !cursor && (
          <button
            type="button"
            className="vo-remote-btn"
            disabled={!ready}
            onClick={() => setPickerOpen(true)}
          >
            {canVerses && canSongs
              ? tr('Вибрати вірш або пісню…')
              : canSongs
                ? tr('Вибрати пісню…')
                : tr('Вибрати вірш…')}
          </button>
        )}

        {/* «На екран» (0.6.0): what the operator's preview holds, if it isn't on screen yet. */}
        {allowed.includes('show') && !cursor && (
          <section className="vo-remote-preview" aria-label={tr('Передпоказ')}>
            <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{tr('Передпоказ')}</span>
              <span style={{ opacity: 0.65 }}>
                {previewOnScreen ? tr('уже на екрані') : (previewText?.reference ?? tr('порожньо'))}
              </span>
            </div>
            {previewText && !previewOnScreen && (
              <p
                className="vo-remote-text vo-remote-text-small"
                style={{ fontFamily: previewText.font ?? '"Lora", Georgia, serif' }}
              >
                {previewText.text}
              </p>
            )}
            <button
              type="button"
              className="vo-remote-btn vo-remote-btn-live"
              disabled={!ready || !previewText || previewOnScreen}
              onClick={() => press('show')}
            >
              {tr(REMOTE_LABEL.show)}
            </button>
          </section>
        )}

        {/* What «Далі» will show — so the speaker knows where the next press goes. */}
        {next && next.text && !cursor && (
          <section className="vo-remote-next" aria-label={tr('Далі')}>
            <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{tr('Далі')}</span>
              <span style={{ opacity: 0.65 }}>{next.reference}</span>
            </div>
            <p
              className="vo-remote-text vo-remote-text-small"
              style={{ fontFamily: next.font ?? '"Lora", Georgia, serif' }}
            >
              {next.text}
            </p>
          </section>
        )}

        {allowed.includes('countdown') && (
          <RemoteCountdownPad
            running={running}
            offset={offset}
            ready={ready}
            onCountdown={(c) => press('countdown', undefined, undefined, c)}
          />
        )}
        {(allowed.includes('blank') || allowed.includes('black') || allowed.includes('cover')) && (
          <div className="vo-remote-pad vo-remote-pad-small">
            {allowed.includes('blank') && (
              <button
                type="button"
                className="vo-remote-btn"
                disabled={!ready}
                onClick={() => press('blank')}
              >
                {screen?.status === 'blank' ? tr('Показати текст') : tr(REMOTE_LABEL.blank)}
              </button>
            )}
            {allowed.includes('black') && (
              <button
                type="button"
                className="vo-remote-btn"
                disabled={!ready}
                onClick={() => press('black')}
              >
                {screen?.status === 'black' ? tr('Зняти чорне') : tr(REMOTE_LABEL.black)}
              </button>
            )}
            {allowed.includes('cover') && (
              <button
                type="button"
                className="vo-remote-btn"
                disabled={!ready}
                onClick={() => press('cover')}
              >
                {onCover ? tr('Прибрати заставку') : tr(REMOTE_LABEL.cover)}
              </button>
            )}
          </div>
        )}
      </div>
      <footer className="vo-remote-foot">
        <p
          role="status"
          style={{
            minHeight: 16,
            margin: 0,
            fontSize: 12,
            lineHeight: '16px',
            textAlign: 'center',
            color: 'var(--vo-follow-alert)',
          }}
        >
          {notice ?? ''}
        </p>
        <div className="vo-remote-pad">
          {(allowed.includes('prev') || walks) && (
            <button
              type="button"
              className="vo-remote-btn"
              disabled={!ready}
              onClick={() => walk(-1)}
            >
              ← {tr(REMOTE_LABEL.prev)}
            </button>
          )}
          {(allowed.includes('next') || walks) && (
            <button
              type="button"
              className="vo-remote-btn vo-remote-btn-primary"
              disabled={!ready}
              onClick={() => walk(1)}
            >
              {tr(REMOTE_LABEL.next)} →
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

/**
 * «Відлік» from the phone (1.11.0-beta.1, a permission of its own, as the desk's): a new one of a typed
 * length — empty: the operator's saved one —, its time left while it counts, pause / go on, off. The
 * look, the words and the place are the operator's.
 */
function RemoteCountdownPad({
  running,
  offset,
  ready,
  onCountdown,
}: {
  running: ScreenSummary['countdown'] | null;
  /** how far the computer's clock is ahead of this phone's */
  offset: number;
  ready: boolean;
  onCountdown: (c: RemoteCountdown) => void;
}) {
  // here, not in the page: only this pad redraws as the seconds go (review)
  const { left, paused } = useCountdown(running, offset);
  const [length, setLength] = useState('');
  const ms = length.trim() ? parseDuration(length) : null;
  const bad = length.trim() !== '' && ms == null;
  if (running)
    return (
      <section className="vo-remote-countdown" aria-label={tr('Відлік')}>
        <p className="vo-remote-countdown-time" role="timer">
          {formatTimer(left)}
          {paused ? ` · ${tr('пауза')}` : ''}
        </p>
        <div className="vo-remote-pad vo-remote-pad-small">
          <button
            type="button"
            className="vo-remote-btn"
            disabled={!ready}
            onClick={() => onCountdown({ op: 'pause' })}
          >
            {paused ? tr('Продовжити') : tr('Пауза')}
          </button>
          <button
            type="button"
            className="vo-remote-btn"
            disabled={!ready}
            onClick={() => onCountdown({ op: 'stop' })}
          >
            {tr('Прибрати відлік')}
          </button>
        </div>
      </section>
    );
  return (
    <form
      className="vo-remote-countdown"
      onSubmit={(e) => {
        e.preventDefault();
        if (bad) return;
        onCountdown(ms ? { op: 'start', seconds: Math.round(ms / 1000) } : { op: 'start' });
        setLength('');
      }}
    >
      <input
        className="vo-remote-input"
        // «:» for 7:30 is on the text keyboard's symbols (review: a number pad has none)
        inputMode="text"
        aria-label={tr('Тривалість')}
        placeholder={tr('5 чи 7:30')}
        value={length}
        aria-invalid={bad || undefined}
        onChange={(e) => setLength(e.currentTarget.value)}
      />
      <button type="submit" className="vo-remote-btn" disabled={!ready || bad}>
        {tr('Почати відлік')}
      </button>
    </form>
  );
}
