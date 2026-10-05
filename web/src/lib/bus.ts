import type { PresenterCommand, Slide, SlideLine } from '../presenterBus';

/**
 * The window bus, protocol v2 (0.4.1) — control window ⇄ output windows (presenter,
 * stage). Measured in /bench (0.4.0): text slides cost nothing on any transport; the
 * background photo (a ≤1.5 MB data URL inside every slide's style) was the whole cost —
 * each slide change wrote it to localStorage (sync, ~16 ms frozen control window, plus a
 * 1.4 MB `storage` event in EVERY app window) and cloned it over BroadcastChannel; the
 * «next» preview did the same on every selection change. Now:
 *   - ASSETS: a background travels once, as `{ t: 'asset', id, data }` (id = length +
 *     FNV-1a of the data); slides carry `asset:<id>` and receivers resolve it back. So
 *     does «Заставка»'s image (1.4.2: it went inline — over the channel and into the
 *     stored slide — every time L put it on), and the images of the slide a QR slide or
 *     «Заставка» covers (`returnTo`).
 *   - ONE ordered channel for everything (live, next, assets, commands, handshake);
 *     publishes are numbered (`epoch` = this control window's session, `seq`), so a
 *     receiver drops stale copies (e.g. handshake replies) per stream.
 *   - HANDSHAKE: a window that opens or reloads sends `hello`; the publishing window
 *     answers with its assets + current live + next. A receiver that still misses an
 *     asset asks for it (`need`).
 *   - COLD START: localStorage keeps the last live/next slide (small, with the asset
 *     references) and the live slide's background (written only when it changes), so an
 *     output window opened while the control window is closed still shows the last slide.
 *     «Заставка»'s image is not copied (1.4.2): it is the logo the settings keep already
 *     (`kept`), found there by its id.
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
/** The live slide's background, for cold start: `{ id, data }`. */
export const KEY_ASSET = 'vo:asset';
const ASSET_PREFIX = 'asset:';
/** Receivers keep a few recent images (switching back and forth stays instant). */
const KEEP_ASSETS = 4;
/**
 * How deep `returnTo` may nest: the QR over «Заставка» over a verse is 2 (lib/slide.ts never
 * nests deeper); a deeper one, or a loop, is not a slide.
 */
const MAX_RETURN_DEPTH = 3;

/** Content id of a data URL: its length + FNV-1a (32-bit) over every char code. */
export function assetId(data: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data.charCodeAt(i), 0x01000193);
  return `${data.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

/**
 * Can the pages read this as a slide (0.13.0)? They use `lines`, `reference`, `visible`…
 * directly — a stage page that met `lines: null` broke as a whole. A message from a window
 * of another version (or a bug) that fails this is dropped: the window keeps what it shows.
 * What a valid slide still can't draw, `SlideCanvas` catches.
 */
export function isSlide(x: unknown): x is Slide {
  return slideAt(x, 0);
}

function slideAt(x: unknown, depth: number): x is Slide {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  const obj = (v: unknown) => v === undefined || v === null || typeof v === 'object';
  return (
    Array.isArray(s.lines) &&
    s.lines.every((l) => !!l && typeof (l as SlideLine).text === 'string') &&
    typeof s.reference === 'string' &&
    typeof s.visible === 'boolean' &&
    typeof s.blank === 'boolean' &&
    obj(s.style) &&
    obj(s.source) &&
    obj(s.template) &&
    (!s.template || Array.isArray((s.template as { objects: unknown }).objects)) &&
    obj(s.reveal) &&
    (!s.reveal || Array.isArray((s.reveal as { units: unknown }).units)) &&
    // «Відлік» (1.5.0): an end in ms — anything else would show NaN:NaN
    obj(s.countdown) &&
    (!s.countdown || Number.isFinite((s.countdown as { until: unknown }).until)) &&
    // a speaker's timer (1.8.4) and the corner countdown (1.8.7): the same
    obj(s.stageTimer) &&
    (!s.stageTimer || Number.isFinite((s.stageTimer as { until: unknown }).until)) &&
    obj(s.cornerCountdown) &&
    (!s.cornerCountdown || Number.isFinite((s.cornerCountdown as { until: unknown }).until)) &&
    // a picture (1.5.0): addresses, not images
    obj(s.picture) &&
    (!s.picture || typeof (s.picture as { src: unknown }).src === 'string') &&
    // what a QR slide or «Заставка» covers (1.4.2): brought back as it is, so a slide too
    (s.returnTo == null || (depth < MAX_RETURN_DEPTH && slideAt(s.returnTo, depth + 1)))
  );
}

const isInline = (bg: string | null | undefined): bg is string =>
  !!bg && !bg.startsWith(ASSET_PREFIX) && bg.length > 256; // data URLs; short URLs stay inline

/**
 * The images a slide carries (1.4.2): its background, «Заставка»'s image, and those of the
 * slide it covers (`returnTo`). Cold start stores the live slide's own background only: the
 * cover's image is the settings' logo (`kept`), and the covered slide's background is the
 * same one almost always (it is not on screen).
 */
type ImageSlot = 'bg' | 'cover';

/** The slide with each image passed through `fn` — a copy only where one changed. */
function mapImages(
  slide: Slide,
  fn: (image: string | null | undefined, slot: ImageSlot, top: boolean) => string | null,
  top = true,
): Slide {
  let out = slide;
  const bg = slide.style?.bgImage;
  const bgTo = fn(bg, 'bg', top);
  if (bgTo !== (bg ?? null)) out = { ...out, style: { ...out.style!, bgImage: bgTo } };
  const image = slide.cover?.image;
  const imageTo = fn(image, 'cover', top);
  if (imageTo !== (image ?? null)) out = { ...out, cover: { ...out.cover!, image: imageTo } };
  if (slide.returnTo) {
    const back = mapImages(slide.returnTo, fn, false);
    if (back !== slide.returnTo) out = { ...out, returnTo: back };
  }
  return out;
}

/** The asset ids a (wire) slide refers to, the covered slide's included. */
function assetRefs(slide: Slide | null | undefined, into = new Set<string>()): Set<string> {
  for (const ref of [slide?.style?.bgImage, slide?.cover?.image]) {
    if (ref?.startsWith(ASSET_PREFIX)) into.add(ref.slice(ASSET_PREFIX.length));
  }
  if (slide?.returnTo) assetRefs(slide.returnTo, into);
  return into;
}

export function createBus(
  channel: BusChannel | null,
  storage: BusStorage | null,
  /** a window sent something that isn't a slide (see `isSlide`), and this one listens */
  onInvalid: () => void = () => undefined,
  /**
   * Images the app stores anyway — the settings' logo (1.4.2). Cold start finds a slide's
   * image among them by its id, so the bus keeps no copy: one more of the logo, for good,
   * left a later background over Safari's quota.
   */
  kept: () => readonly (string | null | undefined)[] = () => [],
) {
  const epoch = Math.random().toString(36).slice(2, 10);
  let seq = 0;
  let cmdSeq = 0;

  // ---- publisher side (the control window)
  const published = new Map<string, string>(); // id → data, what we've announced
  /** Ids of the images last hashed — by string instance, so the same setting is never rehashed. */
  const hashed: { data: string; id: string }[] = [];
  /** The background this window last stored for cold start (its id). */
  let storedBg = '';
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

  function idOf(data: string): string {
    // The same string as before (the appearance setting) → no hashing at all; `===` on
    // another string compares lengths first, so a miss costs nothing either.
    const hit = hashed.find((h) => h.data === data);
    if (hit) return hit.id;
    const id = assetId(data);
    hashed.push({ data, id });
    if (hashed.length > KEEP_ASSETS) hashed.shift();
    return id;
  }

  /**
   * Replace the inline images (lib `mapImages`) with asset references; each is announced
   * once, and kept as the most recent (the background, in every slide, is never dropped for
   * an image used once). `store`: the live stream — its own background goes to cold start,
   * only when it changes.
   */
  function toWire(slide: Slide | null, store: boolean): Slide | null {
    if (!slide) return slide;
    return mapImages(slide, (image, slot, top) => {
      if (!isInline(image)) return image ?? null;
      const id = idOf(image);
      if (published.has(id)) published.delete(id);
      else channel?.post({ t: 'asset', id, data: image });
      published.set(id, image);
      if (published.size > KEEP_ASSETS) published.delete(published.keys().next().value!);
      if (store && top && slot === 'bg' && storedBg !== id) {
        storedBg = id;
        save(KEY_ASSET, JSON.stringify({ id, data: image })); // once per background change
      }
      return ASSET_PREFIX + id;
    });
  }

  /** The last wire JSON per stream: an identical publish is dropped (no message, no write). */
  const lastJson = { live: '', next: '' };
  /**
   * Is this window allowed to publish (0.4.4)? A standby control window (another one
   * leads — lib/leader.ts) neither publishes nor answers handshakes with stale state.
   */
  let publishing = true;

  function publish(t: 'live' | 'next', slide: Slide | null): void {
    if (!publishing) return;
    const wire = toWire(slide, t === 'live');
    const json = wire ? JSON.stringify(wire) : 'null'; // small: the images are references
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
    // each image once, though live and next share the background
    for (const id of assetRefs(next, assetRefs(live))) {
      const data = published.get(id);
      if (data) channel?.post({ t: 'asset', id, data });
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

  /** An image for cold start: the stored background, or one the app keeps (`kept`). */
  function storedAsset(id: string): string | null {
    try {
      const raw = storage?.get(KEY_ASSET);
      const a = raw ? (JSON.parse(raw) as { id: string; data: string }) : null;
      if (a?.id === id) return a.data;
    } catch {
      /* unreadable: the kept images, or the publisher (`need`) */
    }
    // the id starts with the length: only an image that long is hashed (by instance, once)
    const length = id.slice(0, id.indexOf('-'));
    for (const data of kept()) {
      if (isInline(data) && data.length.toString(36) === length && idOf(data) === id) return data;
    }
    return null;
  }

  function remember(id: string, data: string) {
    assets.delete(id);
    assets.set(id, data);
    if (assets.size > KEEP_ASSETS) assets.delete(assets.keys().next().value!);
  }

  /** Put the real images back into a wire slide (or none yet — then ask for them). */
  function resolve(slide: Slide | null): Slide | null {
    if (!slide) return slide;
    return mapImages(slide, (ref) => {
      if (!ref?.startsWith(ASSET_PREFIX)) return ref ?? null;
      const id = ref.slice(ASSET_PREFIX.length);
      const data = assets.get(id) ?? storedAsset(id);
      if (data) remember(id, data);
      else if (!asked.has(id)) {
        asked.add(id);
        channel?.post({ t: 'need', id });
      }
      return data;
    });
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
        if (msg.slide !== null && !isSlide(msg.slide)) {
          if (liveSubs.size > 0) onInvalid(); // a leading control window doesn't listen
          return;
        }
        if (!fresh('live', msg.epoch, msg.seq)) return;
        curLive = msg.slide;
        for (const cb of liveSubs) cb(resolve(curLive) ?? EMPTY);
        return;
      case 'next':
        if (msg.slide !== null && !isSlide(msg.slide)) {
          if (nextSubs.size > 0) onInvalid();
          return;
        }
        if (!fresh('next', msg.epoch, msg.seq)) return;
        curNext = msg.slide;
        for (const cb of nextSubs) cb(resolve(curNext));
        return;
      case 'asset': {
        remember(msg.id, msg.data);
        asked.delete(msg.id);
        if (assetRefs(curLive).has(msg.id)) for (const cb of liveSubs) cb(resolve(curLive)!);
        if (assetRefs(curNext).has(msg.id)) for (const cb of nextSubs) cb(resolve(curNext));
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
      const slide: unknown = raw ? JSON.parse(raw) : null;
      // an older version's copy it can't read: start empty rather than broken
      return isSlide(slide) ? resolve(slide) : null;
    } catch {
      return null;
    }
  }

  /**
   * Before «Повернути версію» (1.4.2): the stored live slide as an older version reads it.
   * 1.4.1 resolves the background only: a cover's `asset:` image stayed a broken picture — in
   * an output window's cold start and in what its control window projected again, until L
   * twice. So the image goes back inline, as 1.4.1 stored it. The rest stays: `returnTo`
   * means nothing to 1.4.1, and a version that knows it gives it back with L.
   */
  function storeForOlderVersion(): void {
    let slide: unknown;
    try {
      const raw = storage?.get(KEY_LIVE);
      slide = raw ? JSON.parse(raw) : null;
    } catch {
      return;
    }
    if (!isSlide(slide) || !slide.cover?.image?.startsWith(ASSET_PREFIX)) return;
    const id = slide.cover.image.slice(ASSET_PREFIX.length);
    // not found (the logo changed meanwhile): no picture rather than a broken one
    const image = published.get(id) ?? assets.get(id) ?? storedAsset(id);
    save(KEY_LIVE, JSON.stringify({ ...slide, cover: { ...slide.cover, image } }));
  }

  /** First subscription of a receiver: ask the publisher for the current state. */
  function hello(): void {
    if (helloSent) return;
    helloSent = true;
    channel?.post({ t: 'hello' });
  }

  return {
    publishSlide: (slide: Slide) => publish('live', slide),
    /** Leader or standby (0.4.4); stopping also forgets what this window last sent. */
    setPublishing(on: boolean): void {
      publishing = on;
      if (!on) {
        live = next = undefined;
        lastJson.live = lastJson.next = '';
        // the leader stores its own background; leading again, store this window's anew
        storedBg = '';
      }
    },
    publishNext: (slide: Slide | null) => publish('next', slide),
    storeForOlderVersion,
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
