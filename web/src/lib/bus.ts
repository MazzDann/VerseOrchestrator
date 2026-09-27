import type { PresenterCommand, Slide } from '../presenterBus';

/**
 * The window bus, protocol v2 (1.3.1) — control window ⇄ output windows (presenter,
 * stage). Measured in /bench (1.3.0): text slides cost nothing on any transport; the
 * background photo (a ≤1.5 MB data URL inside every slide's style) was the whole cost —
 * each slide change wrote it to localStorage (sync, ~16 ms frozen control window, plus a
 * 1.4 MB `storage` event in EVERY app window) and cloned it over BroadcastChannel; the
 * «next» preview did the same on every selection change. Now:
 *   - ASSETS: a background travels once, as `{ t: 'asset', id, data }` (id = length +
 *     FNV-1a of the data); slides carry `asset:<id>` and receivers resolve it back.
 *   - ONE ordered channel for everything (live, next, assets, commands, handshake);
 *     publishes are numbered (`epoch` = this control window's session, `seq`), so a
 *     receiver drops stale copies (e.g. handshake replies) per stream.
 *   - HANDSHAKE: a window that opens or reloads sends `hello`; the publishing window
 *     answers with its assets + current live + next. A receiver that still misses an
 *     asset asks for it (`need`).
 *   - COLD START: localStorage keeps the last live/next slide (small, with the asset
 *     reference) and the current asset (written only when the background changes), so
 *     an output window opened while the control window is closed still shows the last
 *     slide.
 */

export type Wire =
  | { t: 'live' | 'next'; epoch: string; seq: number; slide: Slide | null }
  | { t: 'asset'; id: string; data: string }
  | { t: 'hello' }
  | { t: 'need'; id: string }
  | { t: 'cmd'; cmd: PresenterCommand; id: string };

export interface BusChannel {
  post(msg: Wire): void;
  listen(cb: (msg: Wire) => void): () => void;
}

export interface BusStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const KEY_LIVE = 'vo:slide';
export const KEY_NEXT = 'vo:slide-next';
export const KEY_ASSET = 'vo:asset';
const ASSET_PREFIX = 'asset:';
/** Receivers keep a few recent backgrounds (switching back and forth stays instant). */
const KEEP_ASSETS = 4;

/** Content id of a data URL: its length + FNV-1a (32-bit) over every char code. */
export function assetId(data: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data.charCodeAt(i), 0x01000193);
  return `${data.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

const isInline = (bg: string | null | undefined): bg is string =>
  !!bg && !bg.startsWith(ASSET_PREFIX) && bg.length > 256; // data URLs; short URLs stay inline

export function createBus(channel: BusChannel | null, storage: BusStorage | null) {
  const epoch = Math.random().toString(36).slice(2, 10);
  let seq = 0;
  let cmdSeq = 0;

  // ---- publisher side (the control window)
  const published = new Map<string, string>(); // id → data, what we've announced
  let lastData: string | null = null;
  let lastId = '';
  let live: Slide | null | undefined; // undefined: this window never published
  let next: Slide | null | undefined;
  let liveSeq = 0;
  let nextSeq = 0;

  const save = (key: string, value: string | null) => {
    try {
      if (value == null) storage?.remove(key);
      else storage?.set(key, value);
    } catch {
      /* quota / private mode: the bus still works, only cold start loses the slide */
    }
  };

  /** Replace an inline background with an asset reference; announce new assets once. */
  function toWire(slide: Slide | null): Slide | null {
    const bg = slide?.style?.bgImage;
    if (!slide || !isInline(bg)) return slide;
    // Same string as last time (the appearance setting) → no hashing at all.
    const id = bg === lastData ? lastId : assetId(bg);
    lastData = bg;
    lastId = id;
    if (!published.has(id)) {
      published.set(id, bg);
      if (published.size > KEEP_ASSETS) published.delete(published.keys().next().value!);
      channel?.post({ t: 'asset', id, data: bg });
      save(KEY_ASSET, JSON.stringify({ id, data: bg })); // once per background change
    }
    return { ...slide, style: { ...slide.style!, bgImage: ASSET_PREFIX + id } };
  }

  /** The last wire JSON per stream: an identical publish is dropped (no message, no write). */
  const lastJson = { live: '', next: '' };
  /**
   * Is this window allowed to publish (1.3.4)? A standby control window (another one
   * leads — lib/leader.ts) neither publishes nor answers handshakes with stale state.
   */
  let publishing = true;

  function publish(t: 'live' | 'next', slide: Slide | null): void {
    if (!publishing) return;
    const wire = toWire(slide);
    const json = wire ? JSON.stringify(wire) : 'null'; // small: the background is a reference
    if (json === lastJson[t]) return;
    lastJson[t] = json;
    seq += 1;
    if (t === 'live') {
      live = wire;
      liveSeq = seq;
    } else {
      next = wire;
      nextSeq = seq;
    }
    channel?.post({ t, epoch, seq, slide: wire });
    save(t === 'live' ? KEY_LIVE : KEY_NEXT, wire ? json : null);
  }

  /** A window (re)opened: give it everything the current state refers to. */
  function answerHello(): void {
    if (!publishing) return;
    if (live === undefined && next === undefined) return; // not a publisher
    for (const s of [live, next]) {
      const ref = s?.style?.bgImage;
      if (ref?.startsWith(ASSET_PREFIX)) {
        const id = ref.slice(ASSET_PREFIX.length);
        const data = published.get(id);
        if (data) channel?.post({ t: 'asset', id, data });
      }
    }
    if (live !== undefined) channel?.post({ t: 'live', epoch, seq: liveSeq, slide: live });
    if (next !== undefined) channel?.post({ t: 'next', epoch, seq: nextSeq, slide: next });
  }

  // ---- receiver side (presenter / stage)
  const assets = new Map<string, string>();
  const liveSubs = new Set<(s: Slide) => void>();
  const nextSubs = new Set<(s: Slide | null) => void>();
  const seen = { live: { epoch: '', seq: 0 }, next: { epoch: '', seq: 0 } };
  let curLive: Slide | null = null;
  let curNext: Slide | null = null;
  let helloSent = false;
  const asked = new Set<string>();

  function storedAsset(id: string): string | null {
    try {
      const raw = storage?.get(KEY_ASSET);
      const a = raw ? (JSON.parse(raw) as { id: string; data: string }) : null;
      return a?.id === id ? a.data : null;
    } catch {
      return null;
    }
  }

  function remember(id: string, data: string) {
    assets.delete(id);
    assets.set(id, data);
    if (assets.size > KEEP_ASSETS) assets.delete(assets.keys().next().value!);
  }

  /** Put the real background back into a wire slide (or none yet — then ask for it). */
  function resolve(slide: Slide | null): Slide | null {
    const ref = slide?.style?.bgImage;
    if (!slide || !ref?.startsWith(ASSET_PREFIX)) return slide;
    const id = ref.slice(ASSET_PREFIX.length);
    const data = assets.get(id) ?? storedAsset(id);
    if (data) remember(id, data);
    else if (!asked.has(id)) {
      asked.add(id);
      channel?.post({ t: 'need', id });
    }
    return { ...slide, style: { ...slide.style!, bgImage: data } };
  }

  const fresh = (t: 'live' | 'next', epoch: string, s: number) => {
    const last = seen[t];
    if (epoch === last.epoch && s <= last.seq) return false; // an older copy
    seen[t] = { epoch, seq: s };
    return true;
  };

  const cmdSubs = new Set<(cmd: PresenterCommand, id: string) => void>();

  channel?.listen((msg) => {
    switch (msg.t) {
      case 'live':
        if (!fresh('live', msg.epoch, msg.seq)) return;
        curLive = msg.slide;
        for (const cb of liveSubs) cb(resolve(curLive) ?? EMPTY);
        return;
      case 'next':
        if (!fresh('next', msg.epoch, msg.seq)) return;
        curNext = msg.slide;
        for (const cb of nextSubs) cb(resolve(curNext));
        return;
      case 'asset': {
        remember(msg.id, msg.data);
        asked.delete(msg.id);
        const ref = ASSET_PREFIX + msg.id;
        if (curLive?.style?.bgImage === ref) for (const cb of liveSubs) cb(resolve(curLive)!);
        if (curNext?.style?.bgImage === ref) for (const cb of nextSubs) cb(resolve(curNext));
        return;
      }
      case 'hello':
        answerHello();
        return;
      case 'need': {
        if (!publishing) return;
        const data = published.get(msg.id);
        if (data) channel?.post({ t: 'asset', id: msg.id, data });
        return;
      }
      case 'cmd':
        // older windows sent no id — give it one so the dispatcher can still track it
        for (const cb of cmdSubs) cb(msg.cmd, msg.id ?? `bus-${Date.now()}-${Math.random()}`);
    }
  });

  function read(key: string): Slide | null {
    try {
      const raw = storage?.get(key);
      return raw ? resolve(JSON.parse(raw) as Slide) : null;
    } catch {
      return null;
    }
  }

  /** First subscription of a receiver: ask the publisher for the current state. */
  function hello(): void {
    if (helloSent) return;
    helloSent = true;
    channel?.post({ t: 'hello' });
  }

  return {
    publishSlide: (slide: Slide) => publish('live', slide),
    /** Leader or standby (1.3.4); stopping also forgets what this window last sent. */
    setPublishing(on: boolean): void {
      publishing = on;
      if (!on) {
        live = next = undefined;
        lastJson.live = lastJson.next = '';
      }
    },
    publishNext: (slide: Slide | null) => publish('next', slide),
    readSlide: (): Slide => read(KEY_LIVE) ?? EMPTY,
    readNext: (): Slide | null => read(KEY_NEXT),
    subscribeSlide(cb: (s: Slide) => void): () => void {
      liveSubs.add(cb);
      hello();
      return () => liveSubs.delete(cb);
    },
    subscribeNext(cb: (s: Slide | null) => void): () => void {
      nextSubs.add(cb);
      hello();
      return () => nextSubs.delete(cb);
    },
    /** A command from an output window; `id` makes it apply once (lib/commands.ts). */
    sendCommand: (cmd: PresenterCommand, id = `${epoch}-${++cmdSeq}`) =>
      channel?.post({ t: 'cmd', cmd, id }),
    subscribeCommand(cb: (cmd: PresenterCommand, id: string) => void): () => void {
      cmdSubs.add(cb);
      return () => cmdSubs.delete(cb);
    },
  };
}

const EMPTY: Slide = { lines: [], reference: '', blank: false, visible: false };

export type Bus = ReturnType<typeof createBus>;
