import { describe, expect, it } from 'vitest';
import { encodeGif, medianCut } from './gif';

/** GIF's LZW, the decoder's side: codes → palette indices. */
function lzwDecode(data: number[], minCodeSize: number): number[] {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clear; i++) dict[i] = [i];
    dict[clear] = [];
    dict[eoi] = [];
    codeSize = minCodeSize + 1;
  };
  reset();
  const out: number[] = [];
  let pos = 0;
  let acc = 0;
  let bits = 0;
  let prev: number[] | null = null;
  const read = () => {
    while (bits < codeSize) {
      acc |= (data[pos++] ?? 0) << bits;
      bits += 8;
    }
    const c = acc & ((1 << codeSize) - 1);
    acc >>>= codeSize;
    bits -= codeSize;
    return c;
  };
  for (;;) {
    const code = read();
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (prev && code === dict.length) entry = [...prev, prev[0]];
    else throw new Error(`a code out of the table: ${code}`);
    for (const v of entry) out.push(v);
    if (prev) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length === 1 << codeSize && codeSize < 12) codeSize++;
  }
  return out;
}

interface Decoded {
  width: number;
  height: number;
  palette: number[];
  loops: boolean;
  frames: { indices: number[]; delayCs: number; transparent: number | null; disposal: number }[];
}

/** Just enough of a GIF reader to check what the writer wrote. */
function decodeGif(b: Uint8Array): Decoded {
  let p = 0;
  const word = () => b[p++] | (b[p++] << 8);
  const text = (n: number) => String.fromCharCode(...b.subarray(p, (p += n)));
  expect(text(6)).toBe('GIF89a');
  const width = word();
  const height = word();
  const flags = b[p++];
  p += 2;
  const palette = [...b.subarray(p, (p += 3 << ((flags & 7) + 1)))];
  const subBlocks = () => {
    const data: number[] = [];
    for (let n = b[p++]; n > 0; n = b[p++]) data.push(...b.subarray(p, (p += n)));
    return data;
  };
  const out: Decoded = { width, height, palette, loops: false, frames: [] };
  let gce = { delayCs: 0, transparent: null as number | null, disposal: 0 };
  for (;;) {
    const kind = b[p++];
    if (kind === 0x3b) break;
    if (kind === 0x21) {
      const label = b[p++];
      if (label === 0xf9) {
        p++; // block size 4
        const packed = b[p++];
        const delayCs = word();
        const index = b[p++];
        p++; // terminator
        gce = { delayCs, transparent: packed & 1 ? index : null, disposal: (packed >> 2) & 7 };
      } else if (label === 0xff) {
        const app = text(b[p++]);
        const data = subBlocks();
        if (app === 'NETSCAPE2.0' && data[0] === 1 && data[1] === 0 && data[2] === 0)
          out.loops = true;
      } else subBlocks();
      continue;
    }
    expect(kind).toBe(0x2c);
    p += 8; // left, top, width, height
    expect(b[p++]).toBe(0); // no local table, not interlaced
    const minCodeSize = b[p++];
    const indices = lzwDecode(subBlocks(), minCodeSize).slice(0, width * height);
    out.frames.push({ indices, ...gce });
  }
  return out;
}

/** RGBA pixels from a list of [r, g, b, a] colours. */
const rgba = (colours: number[][]) => Uint8ClampedArray.from(colours.flat());
const colourAt = (d: Decoded, index: number) => d.palette.slice(index * 3, index * 3 + 3);

describe('animated GIFs for the phones (1.7.4)', () => {
  it('writes every frame whole, with its delay, looping — the colours exact when few', () => {
    const red = [255, 0, 0, 255];
    const green = [0, 255, 0, 255];
    const blue = [0, 0, 255, 255];
    const white = [255, 255, 255, 255];
    const frames = [
      { rgba: rgba([red, green, blue, white, red, red]), delayMs: 100 },
      { rgba: rgba([white, white, red, green, blue, blue]), delayMs: 200 },
      { rgba: rgba([blue, red, red, red, green, white]), delayMs: 40 },
    ];
    const d = decodeGif(encodeGif(3, 2, frames));
    expect([d.width, d.height, d.loops, d.frames.length]).toEqual([3, 2, true, 3]);
    expect(d.frames.map((f) => f.delayCs)).toEqual([10, 20, 4]);
    d.frames.forEach((f, i) => {
      expect(f.transparent).toBeNull();
      expect(f.disposal).toBe(1);
      const want = [...frames[i].rgba].filter((_, k) => k % 4 !== 3);
      expect(f.indices.flatMap((x) => colourAt(d, x))).toEqual(want);
    });
  });

  it('a see-through pixel takes index 255, and each frame clears the one before', () => {
    const clear = [0, 0, 0, 0];
    const gold = [250, 200, 20, 255];
    const d = decodeGif(
      encodeGif(2, 2, [
        { rgba: rgba([gold, clear, clear, gold]), delayMs: 100 },
        { rgba: rgba([clear, gold, gold, clear]), delayMs: 100 },
      ]),
    );
    expect(d.frames.map((f) => [f.transparent, f.disposal])).toEqual([
      [255, 2],
      [255, 2],
    ]);
    expect(d.frames[0].indices[1]).toBe(255);
    expect(colourAt(d, d.frames[0].indices[0])).toEqual([250, 200, 20]);
  });

  it('a big noisy frame fills the LZW table and starts it again — and still reads back', () => {
    const w = 300;
    const h = 200;
    let seed = 7;
    const noise = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      // 64 colours: exact in a 256-colour palette
      noise.set([(seed >> 8) & 0xc0, (seed >> 16) & 0xc0, (seed >> 24) & 0xc0, 255], i * 4);
    }
    const d = decodeGif(
      encodeGif(w, h, [
        { rgba: noise, delayMs: 50 },
        { rgba: noise, delayMs: 50 },
      ]),
    );
    expect(d.frames).toHaveLength(2);
    for (const f of d.frames) {
      expect(f.indices).toHaveLength(w * h);
      for (let i = 0; i < w * h; i += 997)
        expect(colourAt(d, f.indices[i])).toEqual([...noise.subarray(i * 4, i * 4 + 3)]);
    }
  });

  it('chooses up to the asked number of colours', () => {
    const two = Uint8Array.from([0, 0, 0, 0, 0, 0, 255, 255, 255]);
    expect([...medianCut(two, 256)].sort((a, b) => a - b)).toEqual([0, 0, 0, 255, 255, 255]);
    const many = Uint8Array.from({ length: 3 * 4096 }, (_, i) => (i * 37) % 256);
    expect(medianCut(many, 16).length).toBe(16 * 3);
  });
});
