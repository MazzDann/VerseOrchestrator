import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type RemoteCommand } from '../api';
import { connectLive, type HubFrame, type LiveConnection } from '../lib/liveSocket';
import { REMOTE_LABEL } from '../lib/remote';
import { newCommandId, type RemotePassage } from '../lib/commands';
import { type ScreenSummary } from '../lib/slide';
import { formatReference } from '../lib/reference';
import { RemotePicker } from '../components/RemotePicker';

const sameSummary = (a: ScreenSummary | null, b: ScreenSummary | null) =>
  !!a && !!b && a.reference === b.reference && a.text === b.text;

const sameNums = (a: number[], b: number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);
/** Is this screen summary the speaker's own cursor? */
const showsPassage = (s: ScreenSummary | null, p: RemotePassage | null) =>
  !!s &&
  !!p &&
  s.source?.kind === 'verses' &&
  s.source.bookNumber === p.bookNumber &&
  s.source.chapter === p.chapter &&
  sameNums(s.source.translationIds, p.translationIds) &&
  sameNums(s.source.verses, p.verses);

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
    new Map<string, { cmd: RemoteCommand; at: number; sent: boolean; passage?: RemotePassage }>(),
  );
  /**
   * The speaker's own cursor (1.5.1): a verse chosen on this phone. It moves only once the
   * control window has taken it (ack ok); «Далі/Назад» then walk it instead of the
   * operator's selection. Null: the remote follows the operator, as before.
   */
  const [cursor, setCursorState] = useState<RemotePassage | null>(() =>
    recall<RemotePassage>(CURSOR_KEY),
  );
  const setCursor = (p: RemotePassage | null) => {
    setCursorState(p);
    remember(CURSOR_KEY, p);
  };
  const [pickerOpen, setPickerOpen] = useState(false);
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
            p.sent = c.send({ type: 'command', cmd: p.cmd, id, passage: p.passage });
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
            // the control window has the passage: it's the speaker's cursor now
            if (f.ok && p.passage) {
              setCursorState(p.passage);
              remember(CURSOR_KEY, p.passage);
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

  const press = (cmd: RemoteCommand, passage?: RemotePassage) => {
    if (!allowed.includes(cmd) || state.kind === 'connecting') return;
    if (passage && !allowed.includes('pick')) return;
    navigator.vibrate?.(12);
    const id = newCommandId();
    const sent = !!conn.current?.send({ type: 'command', cmd, id, passage });
    pending.current.set(id, { cmd, at: Date.now(), sent, passage });
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

  // The cursor's chapter (its first translation): its text, and where «Далі» goes.
  const primary = cursor?.translationIds[0];
  const cursorVerses = useQuery({
    queryKey: ['verses', primary, cursor?.bookNumber, cursor?.chapter],
    queryFn: () => api.verses(primary!, cursor!.bookNumber, cursor!.chapter),
    enabled: !!cursor,
  });
  const cursorBooks = useQuery({
    queryKey: ['books', primary],
    queryFn: () => api.books(primary!),
    enabled: !!cursor,
  });
  const mineOnScreen = showsPassage(screen, cursor);
  const canPick = allowed.includes('pick');
  const canShow = allowed.includes('show');

  /**
   * «Далі/Назад» with a cursor: the next / previous verse of its chapter — on screen when
   * the cursor is on screen (a clicker), else into the speaker's preview.
   */
  const walk = (delta: number) => {
    if (!cursor) return press(delta > 0 ? 'next' : 'prev');
    const list = (cursorVerses.data ?? []).map((v) => v.verse);
    const at = list.indexOf(cursor.verses[cursor.verses.length - 1]);
    const target = at >= 0 ? list[at + delta] : undefined;
    if (target == null) {
      return flash(delta > 0 ? 'Це останній вірш розділу' : 'Це перший вірш розділу');
    }
    const next = { ...cursor, verses: [target] };
    press(mineOnScreen && canShow ? 'show' : 'pick', next);
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
        ? 'Затемнено'
        : onScreen
          ? screen!.reference || 'На екрані'
          : 'Порожньо';
  const previewText = preview?.status === 'live' ? preview : null;
  const previewOnScreen = onScreen && sameSummary(previewText, screen);
  const cursorText = cursor
    ? (cursorVerses.data?.find((v) => v.verse === cursor.verses[0])?.text ?? '')
    : '';
  const cursorRef = cursor
    ? formatReference(
        cursorBooks.data?.find((b) => b.bookNumber === cursor.bookNumber) ?? null,
        cursor.chapter,
        cursor.verses,
      )
    : '';
  const walks = cursor ? canPick : false;

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
          start={cursor ?? (screen?.source?.kind === 'verses' ? screen.source : null)}
          translationIds={
            cursor?.translationIds ??
            recall<number[]>(TRANSLATIONS_KEY) ??
            (screen?.source?.kind === 'verses' ? screen.source.translationIds : [])
          }
          canShow={canShow}
          onPick={(p, show) => {
            remember(TRANSLATIONS_KEY, p.translationIds);
            press(show ? 'show' : 'pick', p);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
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
          Вибрати вірш…
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
      {(allowed.includes('blank') || allowed.includes('black')) && (
        <div className="vo-remote-pad vo-remote-pad-small">
          {allowed.includes('blank') && (
            <button
              type="button"
              className="vo-remote-btn"
              disabled={!ready}
              onClick={() => press('blank')}
            >
              {REMOTE_LABEL.blank}
            </button>
          )}
          {allowed.includes('black') && (
            <button
              type="button"
              className="vo-remote-btn"
              disabled={!ready}
              onClick={() => press('black')}
            >
              {REMOTE_LABEL.black}
            </button>
          )}
        </div>
      )}
      <p
        role="status"
        style={{
          minHeight: 20,
          margin: 0,
          fontSize: 13,
          textAlign: 'center',
          color: 'var(--vo-follow-alert)',
        }}
      >
        {notice ?? ''}
      </p>
    </div>
  );
}
