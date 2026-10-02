/**
 * Animated GIFs for the phones (1.7.4). A GIF of up to 40 MB moves on the screen as it is, but
 * the phones' small copy of one over 2 MB or 1280 px was its first frame, still. Here the
 * browser decodes the frames (ImageDecoder: Chrome, Edge), scales them down and writes a small
 * animated GIF of its own: one palette of up to 256 colours for the whole animation (a median
 * cut over a sample of its pixels), every frame whole, its delays kept, looping forever. One
 * frame at a time — a long animation never sits in memory whole. Where the browser can't decode
 * frames, or the result would still be too big, the phones keep the still frame.
 */

/** The longer side of a phone's animated copy, then the smaller try. */
export const PHONE_GIF_SIDES = [720, 480];
/** What the server takes for a small copy (server/src/images.ts MAX_SMALL_BYTES). */
export const PHONE_GIF_MAX_BYTES = 4 * 1024 * 1024;
/** More frames than this: the still frame (a long animation costs the phones more than it gives). */
export const PHONE_GIF_MAX_FRAMES = 400;
/** How many pixels the palette is chosen from, at most. */
const SAMPLE = 120_000;

/** Up to `max` colours: median cut over RGB triples (the widest box splits on its widest channel). */
export function medianCut(samples: Uint8Array, max: number): Uint8Array {
  const n = samples.length / 3;
  if (n === 0) return new Uint8Array(3);
  interface Box {
    idx: Uint32Array;
    spread: number;
    channel: number;
  }
  const box = (idx: Uint32Array): Box => {
    let spread = -1;
    let channel = 0;
    for (let c = 0; c < 3; c++) {
      let lo = 255;
      let hi = 0;
      for (const i of idx) {
        const v = samples[i * 3 + c];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > spread) {
        spread = hi - lo;
        channel = c;
      }
    }
    return { idx, spread, channel };
  };
  const boxes: Box[] = [box(Uint32Array.from({ length: n }, (_, i) => i))];
  while (boxes.length < max) {
    // the box whose split helps most: its spread, weighted by how many pixels it holds
    let pick = -1;
    let score = 0;
    boxes.forEach((b, i) => {
      const s = b.idx.length > 1 ? b.spread * b.idx.length : 0;
      if (s > score) {
        score = s;
        pick = i;
      }
    });
    if (pick < 0) break;
    const { idx, channel } = boxes[pick];
    const sorted = Uint32Array.from(idx).sort(
      (a, b) => samples[a * 3 + channel] - samples[b * 3 + channel],
    );
    // split at the median — moved to where the value changes, so one colour never ends up in
    // both halves (a wasted, doubled palette entry)
    const value = (k: number) => samples[sorted[k] * 3 + channel];
    const mid = sorted.length >> 1;
    let cut = -1;
    for (let d = 0; d < sorted.length && cut < 0; d++) {
      if (mid + d < sorted.length && value(mid + d - 1) !== value(mid + d)) cut = mid + d;
      else if (mid - d > 0 && value(mid - d - 1) !== value(mid - d)) cut = mid - d;
    }
    boxes.splice(pick, 1, box(sorted.subarray(0, cut)), box(sorted.subarray(cut)));
  }
  const palette = new Uint8Array(boxes.length * 3);
  boxes.forEach((b, k) => {
    const sum = [0, 0, 0];
    for (const i of b.idx) for (let c = 0; c < 3; c++) sum[c] += samples[i * 3 + c];
    for (let c = 0; c < 3; c++) palette[k * 3 + c] = Math.round(sum[c] / b.idx.length);
  });
  return palette;
}

/**
 * The nearest palette colour of every 18-bit RGB (6 bits a channel), found once each — frames
 * repeat colours. 5 bits a channel made a smooth gradient visibly banded.
 */
function nearest(palette: Uint8Array) {
  const cache = new Int16Array(1 << 18).fill(-1);
  const colours = palette.length / 3;
  return (r: number, g: number, b: number): number => {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let hit = cache[key];
    if (hit >= 0) return hit;
    let best = Infinity;
    hit = 0;
    for (let i = 0; i < colours; i++) {
      const dr = palette[i * 3] - r;
      const dg = palette[i * 3 + 1] - g;
      const db = palette[i * 3 + 2] - b;
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < best) {
        best = d;
        hit = i;
      }
    }
    cache[key] = hit;
    return hit;
  };
}

/** Bytes, growing as written. */
class Bytes {
  buf = new Uint8Array(1 << 16);
  length = 0;
  byte(b: number) {
    if (this.length === this.buf.length) {
      const grown = new Uint8Array(this.buf.length * 2);
      grown.set(this.buf);
      this.buf = grown;
    }
    this.buf[this.length++] = b;
  }
  word(w: number) {
    this.byte(w & 0xff);
    this.byte((w >> 8) & 0xff);
  }
  bytes(list: ArrayLike<number>) {
    for (let i = 0; i < list.length; i++) this.byte(list[i]);
  }
  text(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

/**
 * GIF's LZW: palette indices → codes of 9 to 12 bits, in sub-blocks of at most 255 bytes; the
 * table starts again with a clear code once full. The code size grows as omggif's encoder grows
 * it: before the first table entry that wouldn't fit.
 */
function lzw(
  indices: Uint8Array,
  minCodeSize: number,
  out: Bytes,
  table: Int16Array,
  stamp: Int32Array,
  gen: { n: number },
): void {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let next = eoi + 1;
  let codeSize = minCodeSize + 1;
  let generation = ++gen.n;
  let block: number[] = [];
  let acc = 0;
  let bits = 0;
  const flush = () => {
    out.byte(block.length);
    out.bytes(block);
    block = [];
  };
  const emit = (code: number) => {
    acc |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      block.push(acc & 0xff);
      acc >>>= 8;
      bits -= 8;
      if (block.length === 255) flush();
    }
  };
  out.byte(minCodeSize);
  emit(clear);
  if (indices.length > 0) {
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = prefix * 256 + k;
      if (stamp[key] === generation) {
        prefix = table[key];
        continue;
      }
      emit(prefix);
      if (next === 4096) {
        emit(clear);
        next = eoi + 1;
        codeSize = minCodeSize + 1;
        generation = ++gen.n;
      } else {
        if (next >= 1 << codeSize) codeSize++;
        table[key] = next++;
        stamp[key] = generation;
      }
      prefix = k;
    }
    emit(prefix);
  }
  emit(eoi);
  if (bits > 0) {
    block.push(acc & 0xff);
    if (block.length === 255) flush();
  }
  if (block.length > 0) flush();
  out.byte(0);
}

/**
 * A GIF written frame by frame: the header, one palette (`palette`, up to 256 RGB triples; with
 * `transparent`, index 255 is see-through) and the loop come first; each `frame` adds a whole
 * frame of RGBA pixels and its delay.
 */
export class GifWriter {
  private out = new Bytes();
  private pick: (r: number, g: number, b: number) => number;
  private indices: Uint8Array;
  // the LZW table, kept between frames (generations tell old entries from new)
  private table = new Int16Array(4096 * 256);
  private stamp = new Int32Array(4096 * 256);
  private gen = { n: 0 };
  frames = 0;

  constructor(
    private width: number,
    private height: number,
    palette: Uint8Array,
    private transparent: boolean,
  ) {
    this.pick = nearest(palette);
    this.indices = new Uint8Array(width * height);
    const o = this.out;
    o.text('GIF89a');
    o.word(width);
    o.word(height);
    o.byte(0xf7); // a global table of 256 colours, 8 bits each
    o.byte(0);
    o.byte(0);
    const table = new Uint8Array(768);
    table.set(palette.subarray(0, 768));
    o.bytes(table);
    // NETSCAPE2.0: loop forever
    o.bytes([0x21, 0xff, 0x0b]);
    o.text('NETSCAPE2.0');
    o.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);
  }

  /** The bytes so far. */
  get size(): number {
    return this.out.length;
  }

  frame(rgba: ArrayLike<number>, delayMs: number): void {
    const { indices, transparent, width } = this;
    for (let p = 0; p < indices.length; p++) {
      if (transparent && rgba[p * 4 + 3] < 128) {
        indices[p] = 255;
        continue;
      }
      // ordered dithering: a fixed pattern, the same in every frame, so a gradient doesn't band
      // and a still part of the picture doesn't shimmer
      const t = BAYER[((p / width) & 7) * 8 + ((p % width) & 7)];
      indices[p] = this.pick(
        clamp(rgba[p * 4] + t),
        clamp(rgba[p * 4 + 1] + t),
        clamp(rgba[p * 4 + 2] + t),
      );
    }
    const o = this.out;
    // each frame is whole: with transparency it clears what was before (disposal 2), else it
    // just stays (disposal 1)
    o.bytes([0x21, 0xf9, 0x04, transparent ? (2 << 2) | 1 : 1 << 2]);
    o.word(Math.max(2, Math.round(delayMs / 10)));
    o.byte(transparent ? 255 : 0);
    o.byte(0);
    o.byte(0x2c);
    o.word(0);
    o.word(0);
    o.word(this.width);
    o.word(this.height);
    o.byte(0);
    lzw(indices, 8, o, this.table, this.stamp, this.gen);
    this.frames++;
  }

  done(): Uint8Array {
    this.out.byte(0x3b);
    return this.out.done();
  }
}

/** An 8×8 Bayer matrix, as offsets of about ±6 levels around 0. */
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7,
  39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => ((v + 0.5) / 64 - 0.5) * 12);
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** Every `step`-th opaque pixel's RGB into `sample`; says whether any pixel is see-through. */
function sampleFrom(
  rgba: ArrayLike<number>,
  step: number,
  offset: number,
  sample: number[],
): boolean {
  let transparent = false;
  for (let p = 0; p * 4 < rgba.length; p++) {
    if (rgba[p * 4 + 3] < 128) transparent = true;
    else if ((offset + p) % step === 0) sample.push(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]);
  }
  return transparent;
}

/** An animated GIF of frames held in memory (the tests; the phones' copy streams). */
export function encodeGif(
  width: number,
  height: number,
  frames: { rgba: ArrayLike<number>; delayMs: number }[],
): Uint8Array {
  const pixels = width * height;
  const step = Math.max(1, Math.floor((pixels * frames.length) / SAMPLE));
  const sample: number[] = [];
  let transparent = false;
  frames.forEach((f, i) => {
    if (sampleFrom(f.rgba, step, i * pixels, sample)) transparent = true;
  });
  const writer = new GifWriter(
    width,
    height,
    medianCut(Uint8Array.from(sample), transparent ? 255 : 256),
    transparent,
  );
  for (const f of frames) writer.frame(f.rgba, f.delayMs);
  return writer.done();
}

const toDataUrl = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/gif;base64,${btoa(s)}`;
};

/**
 * The phones' copy of an animated GIF: its frames at most `PHONE_GIF_SIDES` px on the longer
 * side, as a GIF of at most 4 MB — or null: one frame, too many, too big at the smaller size
 * too, or a browser without ImageDecoder (the phones then get the still frame as before).
 */
export async function phoneGif(file: File): Promise<string | null> {
  if (typeof ImageDecoder === 'undefined') return null;
  let decoder: ImageDecoder | null = null;
  try {
    decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: 'image/gif' });
    // the tracks first, then every frame parsed: only then is the frame count final
    await decoder.tracks.ready;
    await decoder.completed;
    const count = decoder.tracks.selectedTrack?.frameCount ?? 0;
    if (count < 2 || count > PHONE_GIF_MAX_FRAMES) return null;
    const first = (await decoder.decode({ frameIndex: 0 })).image;
    const [w0, h0] = [first.displayWidth, first.displayHeight];
    first.close();
    for (const side of PHONE_GIF_SIDES) {
      const scale = Math.min(1, side / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const dec = decoder;
      /** Frame `i`, drawn at this size: its pixels and delay. */
      const draw = async (i: number) => {
        const { image } = await dec.decode({ frameIndex: i });
        try {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(image, 0, 0, w, h);
          return {
            rgba: ctx.getImageData(0, 0, w, h).data,
            delayMs: (image.duration ?? 100_000) / 1000,
          };
        } finally {
          image.close();
        }
      };
      // one pass for the palette, one for the frames: never all of them at once
      const step = Math.max(1, Math.floor((w * h * count) / SAMPLE));
      const sample: number[] = [];
      let transparent = false;
      for (let i = 0; i < count; i++)
        if (sampleFrom((await draw(i)).rgba, step, i * w * h, sample)) transparent = true;
      const writer = new GifWriter(
        w,
        h,
        medianCut(Uint8Array.from(sample), transparent ? 255 : 256),
        transparent,
      );
      let fits = true;
      for (let i = 0; i < count && fits; i++) {
        const f = await draw(i);
        writer.frame(f.rgba, f.delayMs);
        fits = writer.size <= PHONE_GIF_MAX_BYTES;
      }
      if (fits) {
        const gif = writer.done();
        if (gif.length <= PHONE_GIF_MAX_BYTES) return toDataUrl(gif);
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    decoder?.close();
  }
}
