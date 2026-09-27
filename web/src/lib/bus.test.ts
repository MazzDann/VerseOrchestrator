import { describe, expect, it } from 'vitest';
import type { Slide } from '../presenterBus';
import { assetId, createBus, KEY_ASSET, KEY_LIVE, type BusStorage, type Wire } from './bus';

/** An in-memory BroadcastChannel: a post reaches every OTHER endpoint, asynchronously. */
function hub(drop?: (m: Wire) => boolean) {
  const endpoints = new Set<(m: Wire) => void>();
  const log: Wire[] = [];
  const endpoint = () => {
    let mine: ((m: Wire) => void) | null = null;
    return {
      post: (m: Wire) => {
        log.push(m);
        if (drop?.(m)) return;
        for (const cb of endpoints) if (cb !== mine) queueMicrotask(() => cb(structuredClone(m)));
      },
      listen: (cb: (m: Wire) => void) => {
        mine = cb;
        endpoints.add(cb);
        return () => endpoints.delete(cb);
      },
    };
  };
  return { endpoint, log };
}

function memory(): BusStorage & { writes: string[] } {
  const m = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    get: (k) => m.get(k) ?? null,
    set: (k, v) => {
      writes.push(k);
      m.set(k, v);
    },
    remove: (k) => void m.delete(k),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const BG = `data:image/jpeg;base64,${'/9j/'.repeat(50_000)}`;
const slide = (reference: string, bgImage: string | null = null): Slide => ({
  lines: [{ translationAbbr: 'UKRK', text: 'Так бо Бог полюбив світ', rtl: false }],
  reference,
  blank: false,
  visible: true,
  style: {
    font: 'serif',
    color: '#fff',
    align: 'center',
    bgColor: '#000',
    bgImage,
    showVerseNumbers: false,
    padTop: 4,
    padRight: 4,
    padBottom: 4,
    padLeft: 4,
    padUnit: '%',
    redLetter: true,
    jesusColor: '#f00',
    highlightColor: '#ff0',
  },
});

describe('window bus v2', () => {
  it('delivers slides; a background travels once as an asset, slides carry a reference', async () => {
    const h = hub();
    const store = memory();
    const control = createBus(h.endpoint(), store);
    const presenter = createBus(h.endpoint(), memory());
    const got: Slide[] = [];
    presenter.subscribeSlide((s) => got.push(s));
    await flush();

    control.publishSlide(slide('Ів 3:16', BG));
    control.publishSlide(slide('Ів 3:17', BG));
    control.publishNext(slide('Ів 3:18', BG));
    await flush();

    expect(got.map((s) => s.reference)).toEqual(['Ів 3:16', 'Ів 3:17']);
    expect(got.every((s) => s.style?.bgImage === BG)).toBe(true); // resolved back
    const assets = h.log.filter((m) => m.t === 'asset');
    expect(assets).toHaveLength(1); // once, not per slide
    // the slide messages themselves stay small
    const live = h.log.filter((m) => m.t === 'live');
    expect(JSON.stringify(live[1]).length).toBeLessThan(1500);
    expect((live[1] as { slide: Slide }).slide.style?.bgImage).toBe(`asset:${assetId(BG)}`);
    // storage: the big value is written once; per slide only the small wire copy
    expect(store.writes.filter((k) => k === KEY_ASSET)).toHaveLength(1);
    expect(store.get(KEY_LIVE)!.length).toBeLessThan(1500);
  });

  it('a window that opens later gets the current state and background (hello)', async () => {
    const h = hub();
    const control = createBus(h.endpoint(), memory());
    control.publishSlide(slide('Ів 3:16', BG));
    control.publishNext(slide('Ів 3:17', BG));
    await flush();

    const stage = createBus(h.endpoint(), memory()); // separate storage: no cold-start copy
    let live: Slide | null = null;
    let next: Slide | null = null;
    stage.subscribeSlide((s) => (live = s));
    stage.subscribeNext((s) => (next = s));
    await flush();
    await flush();
    expect(live!.reference).toBe('Ів 3:16');
    expect(live!.style?.bgImage).toBe(BG);
    expect(next!.reference).toBe('Ів 3:17');
  });

  it('drops stale copies: a handshake reply never rolls an up-to-date window back', async () => {
    const h = hub();
    const control = createBus(h.endpoint(), memory());
    const presenter = createBus(h.endpoint(), memory());
    const got: string[] = [];
    presenter.subscribeSlide((s) => got.push(s.reference));
    await flush();
    control.publishSlide(slide('A'));
    control.publishSlide(slide('B'));
    await flush();
    createBus(h.endpoint(), memory()).subscribeSlide(() => undefined); // another hello
    await flush();
    await flush();
    expect(got).toEqual(['A', 'B']); // the re-sent 'B' (same seq) was ignored
  });

  it('a missed asset is asked for and re-sent', async () => {
    let dropFirst = true;
    const h = hub((m) => {
      if (m.t === 'asset' && dropFirst) {
        dropFirst = false;
        return true;
      }
      return false;
    });
    const control = createBus(h.endpoint(), memory());
    const presenter = createBus(h.endpoint(), memory());
    const bgs: (string | null)[] = [];
    presenter.subscribeSlide((s) => bgs.push(s.style?.bgImage ?? null));
    await flush();
    control.publishSlide(slide('Ів 3:16', BG));
    await flush();
    await flush();
    await flush();
    expect(h.log.some((m) => m.t === 'need')).toBe(true);
    expect(bgs).toEqual([null, BG]); // shown without it at once, then with it
  });

  it('cold start: an output window reads the last slide and background from storage', async () => {
    const store = memory();
    const control = createBus(null, store);
    control.publishSlide(slide('Ів 3:16', BG));
    const presenter = createBus(null, store);
    expect(presenter.readSlide().reference).toBe('Ів 3:16');
    expect(presenter.readSlide().style?.bgImage).toBe(BG);
    expect(presenter.readNext()).toBeNull();
  });

  it('commands travel back from an output window', async () => {
    const h = hub();
    const control = createBus(h.endpoint(), memory());
    const presenter = createBus(h.endpoint(), memory());
    const cmds: string[] = [];
    control.subscribeCommand((c) => cmds.push(c));
    presenter.sendCommand('next');
    presenter.sendCommand('black');
    await flush();
    expect(cmds).toEqual(['next', 'black']);
  });

  it('an identical publish is dropped: no message, no storage write', async () => {
    const h = hub();
    const store = memory();
    const control = createBus(h.endpoint(), store);
    control.publishSlide(slide('A', BG));
    control.publishSlide(slide('A', BG)); // a re-render re-sending the same slide
    control.publishNext(slide('B'));
    control.publishNext(slide('B'));
    control.publishSlide({ ...slide('A', BG), blank: true }); // a real change goes out
    expect(h.log.filter((m) => m.t === 'live')).toHaveLength(2); // A, then A blanked
    expect(h.log.filter((m) => m.t === 'next')).toHaveLength(1);
    expect(store.writes.filter((k) => k === KEY_LIVE)).toHaveLength(2);
  });

  it('content ids differ with content, not with the string instance', () => {
    expect(assetId(BG)).toBe(assetId(`${BG}`.slice(0)));
    expect(assetId(BG)).not.toBe(assetId(BG.replace('/9j/', '/9k/')));
  });
});
