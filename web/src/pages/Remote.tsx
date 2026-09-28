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
  type RemotePassage,
  type RemoteTarget,
  type SharedPlaylist,
} from '../lib/commands';
import { RemotePlaylist } from '../components/RemotePlaylist';
import { type ScreenSummary } from '../lib/slide';
import { formatReference } from '../lib/reference';
import {
  bookEdge,
  chapterName,
  edgeNotice,
  landingVerse,
  neighbourChapter,
  pressAtEdge,
  type CrossArm,
} from '../lib/chapterCross';
import { RemotePicker } from '../components/RemotePicker';

const sameSummary = (a: ScreenSummary | null, b: ScreenSummary | null) =>
  !!a && !!b && a.reference === b.reference && a.text === b.text;

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

/** The remembered cursor — also one saved by 1.5.1, which was a bare passage. */
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
  | { kind: 'offline'; name?: string; allowed?: RemoteCommand[] }
  | { kind: 'denied'; reason: string };

export function Remote() {
  const token = decodeURIComponent(window.location.hash.slice(1));
  const [state, setState] = useState<State>(
    token ? { kind: 'connecting' } : { kind: 'denied', reason: '' },
  );
  const [screen, setScreen] = useState<ScreenSummary | null>(null);
  const [next, setNext] = useState<ScreenSummary | null>(null);
  /** The control window's preview — what «На екран» puts on screen (1.5.0). */
  const [preview, setPreview] = useState<ScreenSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const conn = useRef<LiveConnection | null>(null);
  const noticeTimer = useRef<number | undefined>();
  /**
   * Presses not yet answered, by id (1.3.3). The server acks with the control window's
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
      }
    >(),
  );
  /**
   * The speaker's own cursor: a verse (1.5.1) or a song stanza (1.5.3) chosen on this
   * phone. It moves only once the control window has taken it (ack ok); «Далі/Назад» then
   * walk it instead of the operator's selection. Null: the remote follows the operator.
   */
  const [cursor, setCursorState] = useState<RemoteTarget | null>(recallCursor);
  const setCursor = (t: RemoteTarget | null) => {
    setCursorState(t);
    remember(CURSOR_KEY, t);
  };
  const [pickerOpen, setPickerOpen] = useState(false);
  /** The operator's running order (1.5.9) — when this remote may see it. */
  const [playlist, setPlaylist] = useState<SharedPlaylist | null>(null);
  const [listOpen, setListOpen] = useState(false);
  /** What the operator suggested (1.5.4) — the speaker takes it or not. */
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
    const c = connectLive({
      hello: { role: 'remote', token },
      onStatus: (open) =>
        setState((s) =>
          open || s.kind === 'denied'
            ? s
            : {
                kind: 'offline',
                ...(s.kind === 'ready' ? { name: s.name, allowed: s.allowed } : {}),
              },
        ),
      onMessage: (f: HubFrame) => {
        // «На екрані» comes from the control window's screen relay (remotes only), not
        // the audience slide — so it works even with follow-along switched off.
        if (f.type === 'screen') {
          setScreen((f.screen as ScreenSummary | null) ?? null);
          setNext((f.next as ScreenSummary | null) ?? null);
          setPreview((f.preview as ScreenSummary | null) ?? null);
        } else if (f.type === 'playlist') {
          // the operator's running order, when this remote may see it (1.5.9)
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
          // the operator changed what this remote may do (1.5.0): buttons follow at once
          const allowed = (f.allowed as RemoteCommand[]) ?? [];
          setState((s) => (s.kind === 'ready' || s.kind === 'offline' ? { ...s, allowed } : s));
        } else if (f.type === 'welcome') {
          setState({
            kind: 'ready',
            name: String(f.name ?? 'Пульт'),
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
          setState({ kind: 'denied', reason: 'Оператор відкликав цей пульт.' });
        } else if (f.type === 'ack') {
          const p = typeof f.id === 'string' ? pending.current.get(f.id) : undefined;
          if (p) {
            pending.current.delete(f.id as string);
            setRtt(Date.now() - p.at);
            // the control window has it: it's the speaker's cursor now
            if (f.ok && p.target) {
              setCursorState(p.target);
              remember(CURSOR_KEY, p.target);
            }
          }
          if (!f.ok) flash(String(f.reason ?? 'Команду не виконано'));
        }
      },
      stopOn: (f) => f.type === 'denied' || f.type === 'revoked',
    });
    conn.current = c;
    return () => c.stop();
  }, [token]);

  const allowed = state.kind === 'ready' || state.kind === 'offline' ? (state.allowed ?? []) : [];
  const ready = state.kind === 'ready';

  const press = (cmd: RemoteCommand, target?: RemoteTarget, entry?: PlaylistEntry) => {
    if (state.kind === 'connecting') return;
    // `pick` / `queue` are allowed by what they carry: verses → «Вибір віршів», a stanza →
    // «Пісні», a running-order item or adding to it → «Послідовність»
    if (cmd !== 'pick' && cmd !== 'queue' && !allowed.includes(cmd)) return;
    if (target?.kind === 'verses' && !allowed.includes('pick')) return;
    if (target?.kind === 'song' && !allowed.includes('songs')) return;
    if ((entry || cmd === 'queue') && !allowed.includes('playlist')) return;
    navigator.vibrate?.(12);
    const id = newCommandId();
    const args: CommandArgs = entry ? { item: entry.id } : targetArgs(target);
    // after an item is taken the speaker's cursor walks it — when they may choose that kind
    const walkable = entry ? entryTarget(entry) : cmd === 'queue' ? undefined : target;
    const cursorAfter =
      walkable && allowed.includes(walkable.kind === 'verses' ? 'pick' : 'songs')
        ? walkable
        : undefined;
    const sent = !!conn.current?.send({ type: 'command', cmd, id, ...args });
    pending.current.set(id, { cmd, at: Date.now(), sent, args, target: cursorAfter });
    if (!sent) flash('Немає зв’язку — надішлю, щойно підключуся');
    // No answer at all (server gone mid-press): say so instead of leaving it silent.
    window.setTimeout(() => {
      if (pending.current.delete(id)) flash('Немає відповіді. Команду, можливо, не виконано.');
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
      const to = songPick.stanza + delta;
      if (to < 0 || to >= count) {
        return flash(delta > 0 ? 'Це остання строфа' : 'Це перша строфа');
      }
      next = { kind: 'song', song: { ...songPick, stanza: to } };
    } else {
      const p = passage!;
      const list = (cursorVerses.data ?? []).map((v) => v.verse);
      const at = list.indexOf(p.verses[p.verses.length - 1]);
      const to = at >= 0 ? list[at + delta] : undefined;
      if (to == null) {
        if (at < 0) return flash('Розділ ще завантажується');
        return void crossChapter(p, delta);
      }
      crossArm.current = null;
      next = { kind: 'verses', passage: { ...p, verses: [to] } };
    }
    press(mineOnScreen && canShow ? 'show' : 'pick', next);
  };
  /**
   * The cursor at its chapter's edge (1.5.23): the first press says where a second one
   * goes; pressed again within 5 s the cursor opens the next chapter's first verse (the
   * previous one's last going back) — on screen when the cursor is on screen.
   */
  const crossChapter = async (p: RemotePassage, delta: number) => {
    const to = neighbourChapter(cursorChapters.data ?? [], p.chapter, delta);
    if (to == null) {
      return flash(
        cursorChapters.data
          ? bookEdge(delta)
          : delta > 0
            ? 'Це останній вірш розділу'
            : 'Це перший вірш розділу',
      );
    }
    const key = `${p.translationIds[0]}:${p.bookNumber}:${p.chapter}:${delta > 0 ? 1 : -1}`;
    const step = pressAtEdge(crossArm.current, key, Date.now());
    crossArm.current = step.arm;
    const book = cursorBooks.data?.find((b) => b.bookNumber === p.bookNumber) ?? null;
    if (!step.cross) return flash(edgeNotice(delta, chapterName(book, to)));
    const onScreenNow = mineOnScreen && canShow;
    try {
      const verses = await queryClient.fetchQuery({
        queryKey: ['verses', p.translationIds[0], p.bookNumber, to],
        queryFn: () => api.verses(p.translationIds[0], p.bookNumber, to),
      });
      const v = landingVerse(
        verses.map((x) => x.verse),
        delta,
      );
      if (v == null) return flash('У цьому розділі немає віршів');
      setNotice(null); // «натисніть ще раз» is done with
      press(onScreenNow ? 'show' : 'pick', {
        kind: 'verses',
        passage: { ...p, chapter: to, verses: [v] },
      });
    } catch {
      flash('Не вдалося відкрити розділ — перевірте зв’язок');
    }
  };
  const showNow = () => (cursor ? press('show', cursor) : press('show'));

  // A Bluetooth clicker paired to the phone sends arrow / page keys — honour them too.
  const keysRef = useRef({ walk, showNow, pickerOpen });
  keysRef.current = { walk, showNow, pickerOpen };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (keysRef.current.pickerOpen) return; // the picker's own list / filter
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
      ? 'Чорний екран'
      : screen?.status === 'blank'
        ? 'Текст сховано'
        : onScreen
          ? screen!.reference || 'На екрані'
          : 'Порожньо';
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
      ? `№${cursorSong.data.number ?? ''} ${cursorSong.data.title} · строфа ${songPick.stanza + 1}/${cursorSong.data.slides.length}`
      : '';
  // walking needs the right to choose what the cursor holds
  const walks = passage ? canVerses : songPick ? canSongs : false;

  if (state.kind === 'denied') {
    return (
      <div
        className="vo-follow vo-remote"
        style={{ justifyContent: 'center', textAlign: 'center' }}
      >
        <p style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Пульт недоступний</p>
        <p style={{ opacity: 0.7, margin: '8px 0 0' }}>
          {state.reason || 'Відскануйте QR у вікні керування: Пульт доповідача → Створити пульт.'}
        </p>
      </div>
    );
  }

  return (
    <div className="vo-follow vo-remote">
      {/* everything scrolls except the footer: «Назад / Далі» stay under the thumb (1.5.15) */}
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
          <strong>{state.kind === 'connecting' ? 'Підключення…' : (state.name ?? 'Пульт')}</strong>
          <span style={{ opacity: 0.6 }}>
            {state.kind === 'offline'
              ? '· немає зв’язку, перепідключаюся'
              : ready && rtt != null
                ? `· відповідь ${rtt} мс`
                : ''}
          </span>
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
            <span style={{ fontWeight: 600 }}>На екрані</span>
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

        {/* The shared running order (1.5.9): where the show is, and what's next in it. */}
        {canPlaylist && playlist && playlist.items.length > 0 && (
          <section className="vo-remote-preview" aria-label="Послідовність">
            <div style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600 }}>Послідовність</span>
              <span style={{ opacity: 0.65, flex: 1, minWidth: 0 }}>
                {listCurrent ? `зараз: ${listCurrent.label}` : `${playlist.items.length} елем.`}
              </span>
            </div>
            {listNext && (
              <p className="vo-remote-text vo-remote-text-small" style={{ margin: 0 }}>
                Далі: {listNext.label}
              </p>
            )}
            <div className="vo-remote-row">
              <button
                type="button"
                className="vo-remote-btn"
                disabled={!ready}
                onClick={() => setListOpen(true)}
              >
                Список…
              </button>
              {listNext &&
                (canShow ? (
                  <button
                    type="button"
                    className="vo-remote-btn vo-remote-btn-live"
                    disabled={!ready}
                    onClick={() => press('show', undefined, listNext)}
                  >
                    Наступне на екран
                  </button>
                ) : (
                  <button
                    type="button"
                    className="vo-remote-btn"
                    disabled={!ready}
                    onClick={() => press('pick', undefined, listNext)}
                  >
                    Наступне в передпоказ
                  </button>
                ))}
            </div>
          </section>
        )}

        {/* The operator's suggestion (1.5.4): take it into your preview, show it, or not. */}
        {suggestion && (
          <section
            className="vo-remote-preview vo-remote-suggest"
            aria-label="Пропозиція оператора"
          >
            <div style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600 }}>Оператор пропонує</span>
              <span style={{ opacity: 0.65, flex: 1, minWidth: 0 }}>{suggestion.reference}</span>
              <button
                type="button"
                className="vo-remote-chip"
                onClick={() => setSuggestion(null)}
                aria-label="Відхилити пропозицію"
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
                У передпоказ
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
                  {REMOTE_LABEL.show}
                </button>
              )}
            </div>
          </section>
        )}

        {/* The speaker's own preview (1.5.1): a verse chosen here — «Далі» walks it. */}
        {canPick && cursor && (
          <section className="vo-remote-preview vo-remote-mine" aria-label="Ваш передпоказ">
            <div style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600 }}>Ваш передпоказ</span>
              <span style={{ opacity: 0.65, flex: 1, minWidth: 0 }}>
                {mineOnScreen ? 'на екрані' : cursorRef}
              </span>
              <button
                type="button"
                className="vo-remote-chip"
                onClick={() => setCursor(null)}
                aria-label="Скинути: гортати разом з оператором"
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
                Вибрати…
              </button>
              {canShow && (
                <button
                  type="button"
                  className="vo-remote-btn vo-remote-btn-live"
                  disabled={!ready || mineOnScreen}
                  onClick={() => press('show', cursor)}
                >
                  {REMOTE_LABEL.show}
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
              ? 'Вибрати вірш або пісню…'
              : canSongs
                ? 'Вибрати пісню…'
                : 'Вибрати вірш…'}
          </button>
        )}

        {/* «На екран» (1.5.0): what the operator's preview holds, if it isn't on screen yet. */}
        {allowed.includes('show') && !cursor && (
          <section className="vo-remote-preview" aria-label="Передпоказ">
            <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Передпоказ</span>
              <span style={{ opacity: 0.65 }}>
                {previewOnScreen ? 'уже на екрані' : (previewText?.reference ?? 'порожньо')}
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
              {REMOTE_LABEL.show}
            </button>
          </section>
        )}

        {/* What «Далі» will show — so the speaker knows where the next press goes. */}
        {next && next.text && !cursor && (
          <section className="vo-remote-next" aria-label="Далі">
            <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Далі</span>
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

        {(allowed.includes('blank') || allowed.includes('black')) && (
          <div className="vo-remote-pad vo-remote-pad-small">
            {allowed.includes('blank') && (
              <button
                type="button"
                className="vo-remote-btn"
                disabled={!ready}
                onClick={() => press('blank')}
              >
                {screen?.status === 'blank' ? 'Показати текст' : REMOTE_LABEL.blank}
              </button>
            )}
            {allowed.includes('black') && (
              <button
                type="button"
                className="vo-remote-btn"
                disabled={!ready}
                onClick={() => press('black')}
              >
                {screen?.status === 'black' ? 'Зняти чорне' : REMOTE_LABEL.black}
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
              ← {REMOTE_LABEL.prev}
            </button>
          )}
          {(allowed.includes('next') || walks) && (
            <button
              type="button"
              className="vo-remote-btn vo-remote-btn-primary"
              disabled={!ready}
              onClick={() => walk(1)}
            >
              {REMOTE_LABEL.next} →
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
