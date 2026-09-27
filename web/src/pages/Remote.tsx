import { useEffect, useRef, useState } from 'react';
import type { RemoteCommand } from '../api';
import { connectLive, type HubFrame, type LiveConnection } from '../lib/liveSocket';
import { REMOTE_LABEL } from '../lib/remote';
import { newCommandId } from '../lib/commands';
import { type ScreenSummary } from '../lib/slide';

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
  const [notice, setNotice] = useState<string | null>(null);
  const conn = useRef<LiveConnection | null>(null);
  const noticeTimer = useRef<number | undefined>();
  /**
   * Presses not yet answered, by id (1.3.3). The server acks with the control window's
   * real outcome; a press made while the connection is down is resent on reconnect with
   * the SAME id — applied once even if the first copy did get through.
   */
  const pending = useRef(new Map<string, { cmd: RemoteCommand; at: number; sent: boolean }>());
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
            p.sent = c.send({ type: 'command', cmd: p.cmd, id });
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

  const press = (cmd: RemoteCommand) => {
    if (!allowed.includes(cmd) || state.kind === 'connecting') return;
    navigator.vibrate?.(12);
    const id = newCommandId();
    const sent = !!conn.current?.send({ type: 'command', cmd, id });
    pending.current.set(id, { cmd, at: Date.now(), sent });
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

  // A Bluetooth clicker paired to the phone sends arrow / page keys — honour them too.
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) pressRef.current('next');
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) pressRef.current('prev');
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

      {/* What «Далі» will show — so the speaker knows where the next press goes. */}
      {next && next.text && (
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
        {allowed.includes('prev') && (
          <button
            type="button"
            className="vo-remote-btn"
            disabled={!ready}
            onClick={() => press('prev')}
          >
            ← {REMOTE_LABEL.prev}
          </button>
        )}
        {allowed.includes('next') && (
          <button
            type="button"
            className="vo-remote-btn vo-remote-btn-primary"
            disabled={!ready}
            onClick={() => press('next')}
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
