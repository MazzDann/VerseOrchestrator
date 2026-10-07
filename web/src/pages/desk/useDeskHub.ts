import { useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { type RemoteCommand } from '../../api';
import { type Slide } from '../../presenterBus';
import { connectLive, type HubFrame, type LiveConnection } from '../../lib/liveSocket';
import { isSlide } from '../../lib/bus';
import { newCommandId, type CommandArgs, type SharedPlaylist } from '../../lib/commands';
import { tr } from '../../i18n';

/** A press made while offline is resent on reconnect within this window, then dropped (as /remote). */
const RESEND_MS = 5000;

export type DeskLink =
  | { kind: 'connecting' }
  | { kind: 'ready'; name: string; allowed: RemoteCommand[] }
  /** `off`: the operator switched the app off («Вимкнути повністю») — not a blip */
  | { kind: 'offline'; name?: string; allowed?: RemoteCommand[]; off?: boolean }
  | { kind: 'denied'; reason: string };

/**
 * The desk's line to the hub (1.9.0-beta.10, vo-remote): a remote socket that says `desk: true` —
 * the same token, permissions and acks as a phone's — and hears whole slides for its monitors
 * (`slides`, forDesk on the control window's side). `press` sends a command with an id; a press
 * made while the line is down goes again on reconnect with the same id, so it is applied once.
 */
export function useDeskHub(token: string) {
  const [link, setLink] = useState<DeskLink>(
    token ? { kind: 'connecting' } : { kind: 'denied', reason: '' },
  );
  const [live, setLive] = useState<Slide | null>(null);
  const [next, setNext] = useState<Slide | null>(null);
  /** the operator's running order — when this desk may see it */
  const [playlist, setPlaylist] = useState<SharedPlaylist | null>(null);
  /** the last press → ack round trip, ms */
  const [rtt, setRtt] = useState<number | null>(null);
  const conn = useRef<LiveConnection | null>(null);
  const pending = useRef(
    new Map<
      string,
      { cmd: RemoteCommand; args: CommandArgs; at: number; onDone?: (ok: boolean) => void }
    >(),
  );

  useEffect(() => {
    if (!token) return;
    const c = connectLive({
      hello: { role: 'remote', token, desk: true },
      onStatus: (open) =>
        setLink((s) =>
          open || s.kind === 'denied' || s.kind === 'offline'
            ? s
            : {
                kind: 'offline',
                ...(s.kind === 'ready' ? { name: s.name, allowed: s.allowed } : {}),
              },
        ),
      onMessage: (f: HubFrame) => {
        if (f.type === 'slides') {
          // what the pages draw passes the bus's own check: a bad one never breaks the monitor
          setLive(isSlide(f.live) ? f.live : null);
          setNext(isSlide(f.next) ? f.next : null);
        } else if (f.type === 'playlist') {
          setPlaylist((f.playlist as SharedPlaylist | null) ?? null);
        } else if (f.type === 'allowed') {
          // the operator changed what this desk may do: the buttons follow at once
          const allowed = (f.allowed as RemoteCommand[]) ?? [];
          setLink((s) => (s.kind === 'ready' || s.kind === 'offline' ? { ...s, allowed } : s));
        } else if (f.type === 'welcome') {
          // a phone's link (/remote) opened here: the hub sends it no slides — say what to ask for
          if (f.kind === 'phone') {
            setLink({
              kind: 'denied',
              reason: tr(
                'Це посилання пульта для телефона. Попросіть оператора створити пульт для комп’ютера (Пульт доповідача → Комп’ютер).',
              ),
            });
            c.stop();
            return;
          }
          setLink({
            kind: 'ready',
            name: String(f.name ?? tr('Пульт')),
            allowed: (f.allowed as RemoteCommand[]) ?? [],
          });
          // back online: what was pressed in the last few seconds goes again (same ids)
          for (const [id, p] of pending.current) {
            if (Date.now() - p.at > RESEND_MS) pending.current.delete(id);
            else c.send({ type: 'command', cmd: p.cmd, id, ...p.args });
          }
        } else if (f.type === 'shutdown') {
          setLink((s) =>
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
        } else if (f.type === 'denied') {
          setLink({ kind: 'denied', reason: String(f.reason ?? '') });
        } else if (f.type === 'revoked') {
          setLink({ kind: 'denied', reason: tr('Оператор відкликав цей пульт.') });
        } else if (f.type === 'ack') {
          const p = typeof f.id === 'string' ? pending.current.get(f.id) : undefined;
          if (p) {
            pending.current.delete(f.id as string);
            setRtt(Date.now() - p.at);
            p.onDone?.(f.ok === true);
          }
          // the reason comes in the operator's language or from the server: a key either way
          if (!f.ok)
            notifications.show({
              message: f.reason ? tr(String(f.reason)) : tr('Команду не виконано'),
              color: 'orange',
              autoClose: 2500,
            });
        }
      },
      stopOn: (f) => f.type === 'denied' || f.type === 'revoked',
    });
    conn.current = c;
    return () => c.stop();
  }, [token]);

  /** `onDone`: what the control window answered (false too when nothing came back). */
  const press = (cmd: RemoteCommand, args: CommandArgs = {}, onDone?: (ok: boolean) => void) => {
    const id = newCommandId();
    const sent = !!conn.current?.send({ type: 'command', cmd, id, ...args });
    pending.current.set(id, { cmd, args, at: Date.now(), onDone });
    if (!sent)
      notifications.show({
        message: tr('Немає зв’язку — надішлю, щойно підключуся'),
        color: 'orange',
        autoClose: 2500,
      });
    // no answer at all (the server gone mid-press): say so instead of staying silent
    window.setTimeout(() => {
      const p = pending.current.get(id);
      if (!p) return;
      pending.current.delete(id);
      p.onDone?.(false);
      notifications.show({
        message: tr('Немає відповіді. Команду, можливо, не виконано.'),
        color: 'orange',
      });
    }, RESEND_MS);
  };

  return { link, live, next, playlist, rtt, press };
}
