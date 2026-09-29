import { describe, expect, it } from 'vitest';
import type { Slide } from '../presenterBus';
import {
  assetId,
  createBus,
  isSlide,
  KEY_ASSET,
  KEY_LIVE,
  type BusStorage,
  type Wire,
} from './bus';

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
    const ids = new Set<string>();
    control.subscribeCommand((c, id) => {
      cmds.push(c);
      ids.add(id);
    });
    presenter.sendCommand('next');
    presenter.sendCommand('black');
    await flush();
    expect(cmds).toEqual(['next', 'black']);
    expect(ids.size).toBe(2); // each press has its own id (the dispatcher applies an id once)
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

  it('a standby control window neither publishes nor answers a handshake', async () => {
    const h = hub();
    const standby = createBus(h.endpoint(), memory());
    standby.publishSlide(slide('A')); // it led before…
    standby.setPublishing(false); // …then another window took over
    standby.publishSlide(slide('B'));
    const output = createBus(h.endpoint(), memory());
    const got: string[] = [];
    output.subscribeSlide((s) => got.push(s.reference));
    await flush();
    await flush();
    expect(h.log.filter((m) => m.t === 'live')).toHaveLength(1); // only 'A', before standby
    expect(got).toEqual([]); // no stale 'A' in reply to the hello
  });

  it('a message that is not a slide is dropped and reported; the window keeps its slide (0.13.0)', async () => {
    const h = hub();
    let invalid = 0;
    const control = createBus(h.endpoint(), null);
    const output = createBus(h.endpoint(), null, () => invalid++);
    const got: string[] = [];
    output.subscribeSlide((s) => got.push(s.reference));
    control.publishSlide(slide('Ів 3:16'));
    await flush();
    // another window (another version, a bug) sends something the pages can't read
    const broken = { reference: 'broken', visible: true, blank: false, lines: null };
    h.endpoint().post({ t: 'live', epoch: 'other', seq: 1, slide: broken as unknown as Slide });
    await flush();
    expect(got).toEqual(['Ів 3:16']);
    expect(invalid).toBe(1);
    control.publishSlide(slide('Ів 3:17'));
    await flush();
    expect(got).toEqual(['Ів 3:16', 'Ів 3:17']);
  });

  it('a stored slide it cannot read starts the window empty, not broken', () => {
    const storage = memory();
    storage.set(KEY_LIVE, JSON.stringify({ reference: 'old', lines: 'text', visible: true }));
    expect(createBus(null, storage).readSlide()).toMatchObject({ visible: false, lines: [] });
  });

  it('tells a slide from other things', () => {
    expect(isSlide(slide('Ів 3:16'))).toBe(true);
    expect(isSlide({ ...slide('x'), template: null, reveal: null })).toBe(true);
    expect(isSlide(null)).toBe(false);
    expect(isSlide({ ...slide('x'), lines: [null] })).toBe(false);
    expect(isSlide({ ...slide('x'), reference: 3 })).toBe(false);
    expect(isSlide({ ...slide('x'), template: { objects: 'quote' } })).toBe(false);
    expect(isSlide({ ...slide('x'), reveal: { count: 1 } })).toBe(false);
  });

  it('content ids differ with content, not with the string instance', () => {
    expect(assetId(BG)).toBe(assetId(`${BG}`.slice(0)));
    expect(assetId(BG)).not.toBe(assetId(BG.replace('/9j/', '/9k/')));
  });
});
