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

function memory(): BusStorage & { writes: string[]; sizes: number[] } {
  const m = new Map<string, string>();
  const writes: string[] = [];
  const sizes: number[] = []; // of each write, in chars
  return {
    writes,
    sizes,
    get: (k) => m.get(k) ?? null,
    set: (k, v) => {
      writes.push(k);
      sizes.push(v.length);
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

/** «Заставка» (1.4.0) over `returnTo`, as lib/slide.ts `coverOver` builds it. */
const LOGO = `data:image/png;base64,${'iVBO'.repeat(100_000)}`; // the 1.4.1 cap: 400 000
const cover = (image: string | null, returnTo: Slide | null): Slide => ({
  ...slide('Заставка', BG),
  lines: [],
  cover: { text: 'Недільне зібрання', image },
  returnTo,
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
    // «Відлік» (1.5.0): an end that is a number, or none
    expect(isSlide({ ...slide('x'), countdown: { until: 1, caption: 'x' } })).toBe(true);
    expect(isSlide({ ...slide('x'), countdown: null })).toBe(true);
    expect(isSlide({ ...slide('x'), countdown: { until: 'soon', caption: 'x' } })).toBe(false);
    // a picture (1.5.0): an address
    expect(
      isSlide({
        ...slide('x'),
        picture: { src: '/api/images/file/a.png', small: '', name: 'a', fit: 'contain' },
      }),
    ).toBe(true);
    expect(isSlide({ ...slide('x'), picture: { src: 7 } })).toBe(false);
  });

  it('«Заставка»: its image crosses once as an asset, as the background does (1.4.2)', async () => {
    // it went inline every time L put it on: 400 436 chars over the channel and 400 388 into
    // vo:slide per press with a logo at the 1.4.1 cap
    const h = hub();
    const store = memory();
    const control = createBus(h.endpoint(), store);
    const presenter = createBus(h.endpoint(), memory());
    const got: Slide[] = [];
    presenter.subscribeSlide((s) => got.push(s));
    await flush();

    const verse = slide('Ів 3:16', BG);
    // L four times: on, off, on, off — as Control publishes them
    for (const s of [verse, cover(LOGO, verse), verse, cover(LOGO, verse), verse]) {
      control.publishSlide(s);
    }
    await flush();

    const assets = h.log.filter((m) => m.t === 'asset');
    expect(assets.map((m) => m.data)).toEqual([BG, LOGO]); // each image once
    const live = h.log.filter((m) => m.t === 'live') as { slide: Slide }[];
    expect(live).toHaveLength(5);
    expect(Math.max(...live.map((m) => JSON.stringify(m).length))).toBeLessThan(2000);
    expect(live[1].slide.cover?.image).toBe(`asset:${assetId(LOGO)}`);
    expect(live[1].slide.returnTo?.style?.bgImage).toBe(`asset:${assetId(BG)}`);
    // storage: the background once; the logo never (the settings keep it — `kept`); the
    // slide itself stays small
    expect(store.writes.filter((k) => k === KEY_ASSET)).toHaveLength(1);
    expect(store.writes.filter((k) => k !== KEY_ASSET && k !== KEY_LIVE)).toEqual([]);
    const slideWrites = store.sizes.filter((_, i) => store.writes[i] === KEY_LIVE);
    expect(slideWrites).toHaveLength(5);
    expect(Math.max(...slideWrites)).toBeLessThan(2000);
    // the output window draws it with both images, and the covered slide comes whole
    expect(got.map((s) => !!s.cover)).toEqual([false, true, false, true, false]);
    expect(got[3].cover?.image).toBe(LOGO);
    expect(got[3].style?.bgImage).toBe(BG);
    expect(got[3].returnTo?.style?.bgImage).toBe(BG);
  });

  it('a window that opens later gets each image once, the cover’s too (1.4.2)', async () => {
    const h = hub();
    const control = createBus(h.endpoint(), memory());
    control.publishSlide(cover(LOGO, slide('Ів 3:16', BG)));
    control.publishNext(slide('Ів 3:17', BG)); // the same background as live
    await flush();
    const before = h.log.length;

    const stage = createBus(h.endpoint(), memory());
    let live: Slide | null = null;
    stage.subscribeSlide((s) => (live = s));
    await flush();
    await flush();
    const reply = h.log.slice(before).filter((m) => m.t === 'asset');
    expect(reply.map((m) => m.data)).toEqual([BG, LOGO]); // was: once per stream
    expect(live!.cover?.image).toBe(LOGO);
    expect(live!.returnTo?.reference).toBe('Ів 3:16');
  });

  it('a missed cover image is asked for, then the cover is drawn again with it', async () => {
    let dropLogo = true;
    const h = hub((m) => {
      if (m.t === 'asset' && m.data === LOGO && dropLogo) {
        dropLogo = false;
        return true;
      }
      return false;
    });
    const control = createBus(h.endpoint(), memory());
    const presenter = createBus(h.endpoint(), memory());
    const images: (string | null)[] = [];
    presenter.subscribeSlide((s) => images.push(s.cover?.image ?? null));
    await flush();
    control.publishSlide(cover(LOGO, null));
    await flush();
    await flush();
    await flush();
    expect(h.log.filter((m) => m.t === 'need')).toHaveLength(1);
    expect(images).toEqual([null, LOGO]);
  });

  it('cold start: the cover with the settings’ logo, no copy of it, and what it covers', () => {
    const store = memory();
    const control = createBus(null, store, undefined, () => [LOGO]);
    const verse = slide('Ів 3:16', BG);
    control.publishSlide(verse);
    control.publishSlide(cover(LOGO, verse));
    expect(store.writes).toEqual([KEY_ASSET, KEY_LIVE, KEY_LIVE]);
    // an output window: its settings read from the same storage — another string, same logo
    const s = createBus(null, store, undefined, () => [null, BG, LOGO.slice(0)]).readSlide();
    expect(s.cover?.image).toBe(LOGO);
    expect(s.style?.bgImage).toBe(BG);
    expect(s.returnTo?.reference).toBe('Ів 3:16');
    expect(s.returnTo?.style?.bgImage).toBe(BG);
  });

  it('cold start with another logo in the settings: the publisher is asked for this one', () => {
    const store = memory();
    createBus(null, store).publishSlide(cover(LOGO, slide('Ів 3:16', BG)));
    const posted: Wire[] = [];
    const other = LOGO.replace('iVBO', 'jVBO'); // the same length, another image
    const s = createBus(
      { post: (m) => posted.push(m), listen: () => () => undefined },
      store,
      undefined,
      () => [other],
    ).readSlide();
    expect(s.cover?.image).toBeNull();
    expect(s.style?.bgImage).toBe(BG);
    expect(posted).toEqual([{ t: 'need', id: assetId(LOGO) }]);
  });

  it('before «Повернути версію»: the stored cover as 1.4.1 reads it, its image inline', () => {
    // 1.4.1 resolves the background only: the cover came back without its logo (review)
    const store = memory();
    const control = createBus(null, store, undefined, () => [LOGO]);
    const verse = slide('Ів 3:16', BG);
    const stored = () => JSON.parse(store.get(KEY_LIVE)!) as Slide;
    control.publishSlide(verse);
    control.storeForOlderVersion(); // no cover on screen: nothing to change
    expect(store.writes).toEqual([KEY_ASSET, KEY_LIVE]);
    control.publishSlide(cover(LOGO, verse));
    expect(stored().cover?.image).toBe(`asset:${assetId(LOGO)}`);

    // from the settings window, whose bus published nothing: the logo from the settings
    createBus(null, store, undefined, () => [LOGO]).storeForOlderVersion();
    expect(stored().cover?.image).toBe(LOGO);
    expect(stored().style?.bgImage).toBe(`asset:${assetId(BG)}`); // 1.4.1 resolves this one
    expect(stored().returnTo?.reference).toBe('Ів 3:16'); // a version that knows it gives it back
    // a reader that resolves only the background, as 1.4.1 does, draws it whole
    const old = createBus(null, store).readSlide();
    expect(old.cover?.image).toBe(LOGO);
    expect(old.style?.bgImage).toBe(BG);
    // the logo changed meanwhile: no picture rather than a broken one
    control.publishSlide(verse);
    control.publishSlide(cover(LOGO, verse));
    createBus(null, store).storeForOlderVersion();
    expect(stored().cover).toEqual({ text: 'Недільне зібрання', image: null });
  });

  it('what a slide covers must be a slide too, and never nest without end', () => {
    expect(isSlide({ ...slide('x'), returnTo: slide('y') })).toBe(true);
    expect(isSlide({ ...slide('x'), returnTo: null })).toBe(true);
    expect(isSlide({ ...slide('x'), returnTo: { ...slide('y'), lines: null } })).toBe(false);
    const loop: Slide = slide('x');
    loop.returnTo = loop;
    expect(isSlide(loop)).toBe(false);
  });

  it('content ids differ with content, not with the string instance', () => {
    expect(assetId(BG)).toBe(assetId(`${BG}`.slice(0)));
    expect(assetId(BG)).not.toBe(assetId(BG.replace('/9j/', '/9k/')));
  });
});
