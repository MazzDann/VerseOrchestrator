import { DEFAULT_STYLE, TEMPLATE_PRESETS, type Slide } from '../../presenterBus';
import { timingStats } from './report';
import { tr } from '../../i18n';

/**
 * Sync benchmark (thesis: "BroadcastChannel, evaluated against storage events, postMessage
 * and SharedWorker"): how fast, and at what cost to the SENDING window, a message gets
 * from the control window to another window of the app — and back to the server path the
 * phones and the speaker remote use. The other side is a peer page (/bench/peer) in its
 * own window; it answers every ping with a tiny pong, so a round trip = one payload one
 * way + an acknowledgement back, measured on one clock (the sender's).
 */

export type TransportId = 'broadcast' | 'storage' | 'postmessage' | 'sharedworker' | 'websocket';

/** Getters for the names with words: each read is in the interface language of the moment. */
export const TRANSPORT_NAME: Record<TransportId, string> = {
  broadcast: 'BroadcastChannel',
  get storage() {
    return tr('localStorage + подія storage');
  },
  postmessage: 'window.postMessage',
  get sharedworker() {
    return tr('SharedWorker (ретранслятор)');
  },
  get websocket() {
    return tr('WebSocket через сервер');
  },
};

export const TRANSPORTS: TransportId[] = [
  'broadcast',
  'storage',
  'postmessage',
  'sharedworker',
  'websocket',
];

export interface BenchMsg {
  k: 'ping' | 'pong' | 'ready';
  id: number;
  payload?: string;
}

/** One side of a transport: send, receive, close. */
export interface Link {
  send(msg: BenchMsg): void;
  onMessage(cb: (msg: BenchMsg) => void): () => void;
  close(): void;
}

const BC_NAME = 'vo-bench-sync';
const PING_KEY = 'vo:bench-ping';
const PONG_KEY = 'vo:bench-pong';

/**
 * Open a transport. `peer` is the other window for postMessage (the bench page passes the
 * peer window; the peer page passes its opener/parent). The storage transport writes one
 * key and listens for the other, so the two sides are told apart by `side`.
 */
export function openLink(
  t: Exclude<TransportId, 'websocket'>,
  side: 'bench' | 'peer',
  peer?: Window | null,
): Link {
  if (t === 'broadcast') {
    const ch = new BroadcastChannel(BC_NAME);
    return {
      send: (m) => ch.postMessage(m),
      onMessage: (cb) => {
        const h = (e: MessageEvent) => cb(e.data as BenchMsg);
        ch.addEventListener('message', h);
        return () => ch.removeEventListener('message', h);
      },
      close: () => ch.close(),
    };
  }
  if (t === 'storage') {
    const [out, inn] = side === 'bench' ? [PING_KEY, PONG_KEY] : [PONG_KEY, PING_KEY];
    return {
      // throws QuotaExceededError when the payload doesn't fit — reported as a failure
      send: (m) => localStorage.setItem(out, JSON.stringify(m)),
      onMessage: (cb) => {
        const h = (e: StorageEvent) => {
          if (e.key === inn && e.newValue) cb(JSON.parse(e.newValue) as BenchMsg);
        };
        window.addEventListener('storage', h);
        return () => window.removeEventListener('storage', h);
      },
      close: () => {
        try {
          localStorage.removeItem(out);
        } catch {
          /* ignore */
        }
      },
    };
  }
  if (t === 'postmessage') {
    return {
      send: (m) => peer?.postMessage(m, location.origin),
      onMessage: (cb) => {
        const h = (e: MessageEvent) => {
          if (e.origin === location.origin && e.source === peer && e.data?.k) cb(e.data);
        };
        window.addEventListener('message', h);
        return () => window.removeEventListener('message', h);
      },
      close: () => undefined,
    };
  }
  const worker = new SharedWorker(new URL('./relay.worker.ts', import.meta.url), {
    type: 'module',
    name: 'vo-bench-relay', // a literal: Vite reads worker options statically
  });
  worker.port.start();
  return {
    send: (m) => worker.port.postMessage(m),
    onMessage: (cb) => {
      const h = (e: MessageEvent) => cb(e.data as BenchMsg);
      worker.port.addEventListener('message', h);
      return () => worker.port.removeEventListener('message', h);
    },
    close: () => worker.port.close(),
  };
}

/**
 * The server path: the hub (server/src/live.ts) echoes `{ type: 'echo', id }` to a control
 * socket — the round trip a phone ↔ control relay makes (client → server → client).
 */
export function openSocket(): Promise<Link> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`,
    );
    const listeners = new Set<(m: BenchMsg) => void>();
    const timer = setTimeout(() => reject(new Error(tr('Сервер не відповів'))), 4000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', role: 'control' }));
    ws.onerror = () => reject(new Error(tr('WebSocket не з’єднався')));
    ws.onmessage = (e) => {
      const f = JSON.parse(String(e.data)) as { type: string; id?: number; reason?: string };
      if (f.type === 'welcome') {
        clearTimeout(timer);
        resolve({
          send: (m) => ws.send(JSON.stringify({ type: 'echo', id: m.id, payload: m.payload })),
          onMessage: (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
          },
          close: () => ws.close(),
        });
      } else if (f.type === 'denied') {
        clearTimeout(timer);
        reject(new Error(f.reason ?? tr('Сервер відмовив')));
      } else if (f.type === 'echo' && typeof f.id === 'number') {
        for (const l of listeners) l({ k: 'pong', id: f.id });
      }
    };
  });
}

// ---------------------------------------------------------------------------------------
// Payloads: what actually crosses between the app's windows.

function sampleSlide(withBackground: boolean): Slide {
  // the measured payload: the same bytes in every interface language
  const verse =
    'Бо так полюбив Бог світ, що дав Сина Свого Однородженого, щоб кожен, хто вірує в Нього, не згинув, але мав життя вічне. '; // i18n-ignore: payload
  return {
    lines: [
      { translationAbbr: 'UKRK', text: verse.repeat(2), rtl: false },
      { translationAbbr: 'KJV+', text: verse.repeat(2), rtl: false },
    ],
    reference: 'Від Івана 3:16–17', // i18n-ignore: payload
    blank: false,
    visible: true,
    style: {
      ...DEFAULT_STYLE,
      // a background photo as the app stores it: a JPEG data URL (lib/image.ts, ≤ ~1.5 MB)
      bgImage: withBackground ? `data:image/jpeg;base64,${'/9j/4AAQ'.repeat(187_500)}` : null,
    },
    template: TEMPLATE_PRESETS[1].template,
  };
}

export interface PayloadKind {
  id: 'command' | 'slide' | 'slide-bg';
  label: string;
  payload: string;
}

export function payloads(): PayloadKind[] {
  return [
    { id: 'command', label: tr('Команда «далі»'), payload: JSON.stringify({ cmd: 'next' }) },
    { id: 'slide', label: tr('Слайд'), payload: JSON.stringify(sampleSlide(false)) },
    { id: 'slide-bg', label: tr('Слайд з фоном'), payload: JSON.stringify(sampleSlide(true)) },
  ];
}

// ---------------------------------------------------------------------------------------
// Measurement.

export interface SyncCell {
  /** round trip: payload there + tiny pong back */
  medianMs: number;
  p95Ms: number;
  /** time the sender's thread was blocked inside send() (serialize / storage write) */
  sendMedianMs: number;
  sendMaxMs: number;
  lost: number;
  error?: string;
}

export interface SyncRow {
  transport: TransportId;
  cells: Record<PayloadKind['id'], SyncCell | null>;
  /** burst of small messages: how many per second got through, and how many were lost */
  burst: { perSec: number; lost: number; sent: number } | null;
}

export interface SyncReport {
  createdAt: string;
  app: string;
  userAgent: string;
  peer: 'window' | 'iframe';
  rounds: number;
  sizes: Record<PayloadKind['id'], number>;
  rows: SyncRow[];
}

const TIMEOUT_MS = 2000;

function waitPong(link: Link, id: number): Promise<boolean> {
  return new Promise((resolve) => {
    const off = link.onMessage((m) => {
      if (m.k === 'pong' && m.id === id) {
        off();
        clearTimeout(t);
        resolve(true);
      }
    });
    const t = setTimeout(() => {
      off();
      resolve(false);
    }, TIMEOUT_MS);
  });
}

let nextId = 1;

async function pingPong(link: Link, payload: string, rounds: number): Promise<SyncCell> {
  const rtt: number[] = [];
  const block: number[] = [];
  let lost = 0;
  for (let i = -3; i < rounds; i++) {
    // i < 0: warm-up (first messages pay for channel/worker setup)
    const id = nextId++;
    const got = waitPong(link, id);
    const t0 = performance.now();
    link.send({ k: 'ping', id, payload });
    const t1 = performance.now();
    const ok = await got;
    const t2 = performance.now();
    if (i < 0) continue;
    if (!ok) lost++;
    else rtt.push(t2 - t0);
    block.push(t1 - t0);
  }
  const r = timingStats(rtt.length ? rtt : [NaN]);
  const b = timingStats(block);
  return {
    medianMs: r.medianMs,
    p95Ms: r.p95Ms,
    sendMedianMs: b.medianMs,
    sendMaxMs: Math.max(...block),
    lost,
  };
}

/** Fire `count` small messages without waiting; count the pongs that come back. */
async function burst(link: Link, count: number): Promise<SyncRow['burst']> {
  const first = nextId;
  const seen = new Set<number>();
  let last = 0;
  const off = link.onMessage((m) => {
    if (m.k === 'pong' && m.id >= first && m.id < first + count) {
      seen.add(m.id);
      last = performance.now();
    }
  });
  const t0 = performance.now();
  for (let i = 0; i < count; i++) link.send({ k: 'ping', id: nextId++, payload: '{"cmd":"next"}' });
  const deadline = t0 + 5000;
  while (seen.size < count && performance.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  off();
  const secs = ((seen.size === count ? last : performance.now()) - t0) / 1000;
  return { perSec: Math.round(seen.size / secs), lost: count - seen.size, sent: count };
}

/**
 * Open the peer (a window by default — like the output window — or an iframe when
 * pop-ups are blocked) and wait until it has all its transports listening.
 */
export async function openPeer(prefer: 'window' | 'iframe'): Promise<{
  win: Window;
  kind: 'window' | 'iframe';
  close(): void;
}> {
  const ready = new Promise<void>((resolve, reject) => {
    const ch = new BroadcastChannel(BC_NAME);
    const t = setTimeout(() => {
      ch.close();
      reject(new Error(tr('Сторінка-партнер не відповіла')));
    }, 15000);
    ch.onmessage = (e) => {
      if ((e.data as BenchMsg)?.k === 'ready') {
        clearTimeout(t);
        ch.close();
        resolve();
      }
    };
  });
  const popup =
    prefer === 'window'
      ? window.open('/bench/peer', 'vo-bench-peer', 'popup,width=420,height=260')
      : null;
  if (popup) {
    await ready;
    return { win: popup, kind: 'window', close: () => popup.close() };
  }
  const frame = document.createElement('iframe');
  frame.src = '/bench/peer';
  frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(frame);
  await ready;
  return { win: frame.contentWindow!, kind: 'iframe', close: () => frame.remove() };
}

export async function runSyncBench(opts: {
  transports: TransportId[];
  rounds: number;
  /** the peer in its own window (like the output window) or in a frame of this page */
  peer: 'window' | 'iframe';
  onProgress: (message: string, fraction: number) => void;
}): Promise<SyncReport> {
  const kinds = payloads();
  const peer = await openPeer(opts.peer);
  const rows: SyncRow[] = [];
  const steps = opts.transports.length * (kinds.length + 1);
  let step = 0;
  try {
    for (const t of opts.transports) {
      const row: SyncRow = {
        transport: t,
        cells: { command: null, slide: null, 'slide-bg': null },
        burst: null,
      };
      rows.push(row);
      let link: Link;
      try {
        link = t === 'websocket' ? await openSocket() : openLink(t, 'bench', peer.win);
      } catch (err) {
        for (const k of kinds) {
          row.cells[k.id] = { ...emptyCell(), error: (err as Error).message };
        }
        step += kinds.length + 1;
        continue;
      }
      try {
        for (const k of kinds) {
          opts.onProgress(`${TRANSPORT_NAME[t]}: ${k.label}`, ++step / steps);
          if (t === 'websocket' && k.id === 'slide-bg') {
            // the hub caps frames at 256 KB; phones get slides without the background
            row.cells[k.id] = { ...emptyCell(), error: tr('понад ліміт кадру (256 КБ)') };
            continue;
          }
          try {
            row.cells[k.id] = await pingPong(link, k.payload, opts.rounds);
          } catch (err) {
            row.cells[k.id] = { ...emptyCell(), error: shortError(err) };
          }
        }
        opts.onProgress(tr('{transport}: серія', { transport: TRANSPORT_NAME[t] }), ++step / steps);
        row.burst = await burst(link, 200).catch(() => null);
      } finally {
        link.close();
      }
    }
  } finally {
    peer.close();
  }
  return {
    createdAt: new Date().toISOString(),
    app: __APP_VERSION__,
    userAgent: navigator.userAgent,
    peer: peer.kind,
    rounds: opts.rounds,
    sizes: Object.fromEntries(kinds.map((k) => [k.id, k.payload.length])) as SyncReport['sizes'],
    rows,
  };
}

function emptyCell(): SyncCell {
  return { medianMs: NaN, p95Ms: NaN, sendMedianMs: NaN, sendMaxMs: NaN, lost: 0 };
}

function shortError(err: unknown): string {
  const e = err as Error;
  return e?.name === 'QuotaExceededError'
    ? tr('не вміщається в localStorage')
    : e?.message || tr('помилка');
}

/** The report as CSV — one row per transport × payload. */
export function syncCsv(r: SyncReport): string {
  const rows = [
    tr(
      'транспорт,дані,байт,RTT медіана (мс),RTT p95 (мс),блокування відправника медіана (мс),блокування max (мс),втрачено,помилка',
    ),
  ];
  const kinds = payloads();
  const n = (v: number) => (Number.isFinite(v) ? String(Number(v.toFixed(2))) : '');
  for (const row of r.rows) {
    for (const k of kinds) {
      const c = row.cells[k.id];
      if (!c) continue;
      rows.push(
        [
          TRANSPORT_NAME[row.transport],
          k.label,
          r.sizes[k.id],
          n(c.medianMs),
          n(c.p95Ms),
          n(c.sendMedianMs),
          n(c.sendMaxMs),
          c.lost,
          c.error ?? '',
        ]
          .map((v) =>
            typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v,
          )
          .join(','),
      );
    }
    if (row.burst) {
      rows.push(
        tr('{transport},серія {sent} команд,,,,,,{lost},{perSec} за секунду', {
          transport: TRANSPORT_NAME[row.transport],
          sent: row.burst.sent,
          lost: row.burst.lost,
          perSec: row.burst.perSec,
        }),
      );
    }
  }
  return rows.join('\n');
}
