import { afterEach, describe, expect, it } from 'vitest';
import {
  countdownOver,
  coverOver,
  forAudience,
  forDesk,
  pictureSlide,
  inPhoneWords,
  qrOver,
  sameSlide,
  showsSomething,
  summarize,
  toggleBlack,
  toggleHidden,
  uncover,
} from './slide';
import { DEFAULT_STYLE, type Slide } from '../presenterBus';
import { createBus, type Wire } from './bus';
import { useSettings } from '../settingsStore';

const base: Slide = {
  lines: [{ translationAbbr: 'UKRK', text: 'Так бо полюбив Бог сьвіт', rtl: false }],
  reference: 'Ів 3:16',
  blank: false,
  visible: true,
};

describe('summarize', () => {
  it('reports a visible slide as live with its first line', () => {
    expect(summarize(base)).toMatchObject({
      status: 'live',
      reference: 'Ів 3:16',
      text: 'Так бо полюбив Бог сьвіт',
    });
  });
  it('distinguishes blank, black and empty', () => {
    expect(summarize({ ...base, blank: true }).status).toBe('blank');
    expect(summarize({ ...base, forceBlack: true }).status).toBe('black');
    expect(summarize({ ...base, lines: [] }).status).toBe('empty');
    expect(summarize(null).status).toBe('empty');
  });
  it('caps long text', () => {
    const long = { ...base, lines: [{ ...base.lines[0], text: 'а'.repeat(2000) }] };
    expect(summarize(long).text).toHaveLength(400);
  });
});

describe('sameSlide', () => {
  const styled = (bgImage: string | null): Slide => ({
    ...base,
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
  const bg = `data:image/jpeg;base64,${'A'.repeat(10_000)}`;

  it('treats a re-built identical slide as the same', () => {
    expect(sameSlide(styled(bg), styled(bg))).toBe(true);
    expect(sameSlide(base, { ...base, lines: [...base.lines] })).toBe(true);
  });

  it('sees any real change — text, state, style or background', () => {
    expect(sameSlide(base, { ...base, blank: true })).toBe(false);
    expect(sameSlide(base, { ...base, reference: 'Ів 3:17' })).toBe(false);
    expect(sameSlide(styled(bg), styled(null))).toBe(false);
    expect(sameSlide(styled(bg), styled(`${bg}B`))).toBe(false);
    expect(
      sameSlide(styled(bg), { ...styled(bg), style: { ...styled(bg).style!, color: '#eee' } }),
    ).toBe(false);
  });
});

describe("the viewers' QR slide (0.6.16)", () => {
  it('counts as something on screen for the remotes', () => {
    const qr = {
      lines: [],
      reference: 'QR для глядачів',
      blank: false,
      visible: true,
      qr: 'http://192.168.0.2:5173/follow',
    };
    expect(summarize(qr)).toMatchObject({
      status: 'live',
      reference: 'QR для глядачів',
      text: 'QR для глядачів',
      kind: 'qr',
    });
    expect(summarize({ ...qr, blank: true }).status).toBe('blank');
  });
});

describe('«Заставка» (1.4.0)', () => {
  const cover: Slide = {
    lines: [],
    reference: 'Заставка',
    blank: false,
    visible: true,
    cover: { text: 'Недільне зібрання', image: null },
  };

  it('counts as something on screen, and «Сховати текст» can hide it', () => {
    expect(summarize(cover)).toMatchObject({ status: 'live', text: 'Заставка', kind: 'cover' });
    const hidden = toggleHidden(cover)!;
    expect(hidden.blank).toBe(true);
    expect(toggleHidden(hidden)).toEqual({ ...cover, blank: false });
  });

  it('is on screen for the stage display and the toggles, hidden or black is not (1.4.1)', () => {
    // the stage header read «Порожньо» over it, and black → back left the control window's
    // preview behind: both counted only lines
    expect(showsSomething(cover)).toBe(true);
    expect(showsSomething({ ...cover, cover: undefined, qr: 'http://x/follow' })).toBe(true);
    expect(showsSomething(toggleBlack(cover))).toBe(false);
    expect(showsSomething(toggleBlack(toggleBlack(cover)))).toBe(true);
    expect(showsSomething(toggleHidden(cover)!)).toBe(false);
    expect(showsSomething({ ...cover, visible: false })).toBe(false);
    expect(showsSomething({ ...cover, cover: undefined })).toBe(false);
  });

  it('a change of its text or image is a new slide', () => {
    expect(sameSlide(cover, { ...cover, cover: { text: 'Інше', image: null } })).toBe(false);
    expect(
      sameSlide(cover, { ...cover, cover: { text: 'Недільне зібрання', image: 'data:x' } }),
    ).toBe(false);
    expect(sameSlide(cover, { ...cover, cover: { ...cover.cover! } })).toBe(true);
  });
});

describe('«Відлік» (1.5.0)', () => {
  const verse: Slide = { ...base, style: DEFAULT_STYLE };
  const logo = { text: 'Недільне зібрання', image: 'data:image/png;base64,AAAA' };
  const at = { until: 1_790_000_000_000, caption: 'Починаємо за' };

  it('is «Заставка» with the time under it, and gives back what it covers', () => {
    const c = countdownOver(verse, logo, at, DEFAULT_STYLE, 'Відлік');
    expect(c).toMatchObject({ cover: logo, countdown: at, visible: true, lines: [] });
    expect(showsSomething(c)).toBe(true);
    expect(uncover(c)).toBe(verse);
    expect(summarize(c)).toMatchObject({ status: 'live', text: 'Відлік', kind: 'countdown' });
  });

  it('over a cover or another countdown covers what those cover: one L brings the text back', () => {
    const cover = coverOver(verse, logo, DEFAULT_STYLE, 'Заставка');
    const first = countdownOver(cover, logo, at, DEFAULT_STYLE, 'Відлік');
    expect(first.returnTo).toBe(verse);
    const again = countdownOver(
      first,
      logo,
      { ...at, until: at.until + 60000 },
      DEFAULT_STYLE,
      'Відлік',
    );
    expect(again.returnTo).toBe(verse);
  });

  it('reaches the phones without the logo, the time kept', () => {
    const c = countdownOver(verse, logo, at, DEFAULT_STYLE, 'Відлік');
    const phone = forAudience(c);
    expect(phone.cover).toBeUndefined();
    expect(phone.returnTo).toBeUndefined();
    expect(phone.countdown).toEqual(at);
  });

  it('reaches a desk (another computer, 1.9.0-beta.1) as «Заставка» words and time, no images', () => {
    const bg = { ...DEFAULT_STYLE, bgImage: 'data:image/png;base64,BBBB' };
    const c = countdownOver({ ...verse, style: bg }, logo, at, bg, 'Відлік');
    const desk = forDesk(c);
    expect(desk.cover).toEqual({ text: 'Недільне зібрання', image: null });
    expect(desk.countdown).toEqual(at);
    expect(desk.returnTo).toBeUndefined();
    expect(desk.style?.bgImage).toBeNull();
    expect(c.cover?.image).toBe(logo.image); // the screen's own slide is not touched
    expect(forDesk(verse)).toBe(verse); // nothing to strip: the same slide
  });

  it('a speaker’s timer is for «Сцена»: never on the phones, a change is a new slide (1.8.4)', () => {
    const timer = { until: at.until, afterZero: 'overtime' as const };
    const withTimer = { ...verse, stageTimer: timer };
    expect(forAudience(withTimer).stageTimer).toBeUndefined();
    expect(forAudience(withTimer).lines).toEqual(verse.lines);
    expect(sameSlide(withTimer, { ...verse, stageTimer: { ...timer } })).toBe(true);
    expect(sameSlide(withTimer, { ...verse, stageTimer: { ...timer, pausedLeft: 5000 } })).toBe(
      false,
    );
    expect(sameSlide(withTimer, verse)).toBe(false);
  });

  it('a new end or other words is a new slide; the same countdown is not', () => {
    const c = countdownOver(verse, logo, at, DEFAULT_STYLE, 'Відлік');
    expect(sameSlide(c, { ...c, countdown: { ...at } })).toBe(true);
    expect(sameSlide(c, { ...c, countdown: { ...at, until: at.until + 60000 } })).toBe(false);
    expect(sameSlide(c, { ...c, countdown: null })).toBe(false);
  });

  it('a phone in English names it in English', () => {
    const sent = JSON.parse(
      JSON.stringify(summarize(countdownOver(verse, logo, at, DEFAULT_STYLE, 'Відлік'))),
    ) as ReturnType<typeof summarize>;
    useSettings.setState({ language: 'en' });
    try {
      expect(inPhoneWords(sent)).toMatchObject({ reference: 'Countdown', text: 'Countdown' });
    } finally {
      useSettings.setState({ language: 'uk' });
    }
  });
});

describe('«Зображення» (1.5.0)', () => {
  const picture = {
    src: '/api/images/file/a.png',
    small: '/api/images/file/a.small.jpg',
    name: 'Оголошення',
    fit: 'contain' as const,
  };

  it('is something on screen, named by its file, for a remote in any language', () => {
    const p = pictureSlide(picture, DEFAULT_STYLE);
    expect(p).toMatchObject({ lines: [], reference: 'Оголошення', visible: true, picture });
    expect(showsSomething(p)).toBe(true);
    expect(showsSomething(toggleHidden(p)!)).toBe(false);
    const sent = summarize(p);
    expect(sent).toMatchObject({ status: 'live', text: 'Оголошення', kind: 'picture' });
    useSettings.setState({ language: 'en' });
    try {
      expect(inPhoneWords(sent)).toBe(sent); // the operator's file name, not the app's words
    } finally {
      useSettings.setState({ language: 'uk' });
    }
  });

  it('reaches the phones by address; another picture or fit is a new slide', () => {
    const p = pictureSlide(picture, DEFAULT_STYLE);
    expect(forAudience(p).picture).toEqual(picture);
    expect(sameSlide(p, pictureSlide({ ...picture }, DEFAULT_STYLE))).toBe(true);
    expect(sameSlide(p, pictureSlide({ ...picture, fit: 'cover' }, DEFAULT_STYLE))).toBe(false);
    expect(
      sameSlide(p, pictureSlide({ ...picture, src: '/api/images/file/b.png' }, DEFAULT_STYLE)),
    ).toBe(false);
  });

  it('a cover over a picture gives the picture back', () => {
    const p = pictureSlide(picture, DEFAULT_STYLE);
    const c = coverOver(p, { text: 'x', image: null }, DEFAULT_STYLE, 'Заставка');
    expect(uncover(c)).toBe(p);
  });
});

describe('a remote names «Заставка» and the QR in its own language (1.4.2)', () => {
  afterEach(() => useSettings.setState({ language: 'uk' }));

  it('the control window in Ukrainian, the phone in English', () => {
    const verse = { ...base, visible: true };
    const sent = (s: Slide) =>
      JSON.parse(JSON.stringify(summarize(s))) as ReturnType<typeof summarize>;
    const cover = sent(
      coverOver(verse, { text: 'Недільне зібрання', image: null }, DEFAULT_STYLE, 'Заставка'),
    );
    const qr = sent(
      qrOver(verse, 'http://192.168.0.2:4747/follow', DEFAULT_STYLE, 'QR для глядачів'),
    );
    const text = sent(verse);
    useSettings.setState({ language: 'en' }); // the phone
    expect(inPhoneWords(cover)).toMatchObject({
      reference: 'Cover',
      text: 'Cover',
      status: 'live',
    });
    expect(inPhoneWords(qr)).toMatchObject({ reference: 'QR for viewers', text: 'QR for viewers' });
    expect(inPhoneWords(text)).toBe(text); // the operator's text as it is
    expect(inPhoneWords(null)).toBeNull();
  });
});

describe('the QR and «Заставка» give back what they cover, from any control window (1.4.2)', () => {
  const verse: Slide = {
    ...base,
    style: DEFAULT_STYLE,
    source: {
      kind: 'verses',
      translationIds: [1],
      bookNumber: 500,
      chapter: 3,
      verses: [16],
      page: 0,
      reveal: 1,
    },
  };
  const logo = { text: 'Недільне зібрання', image: 'data:image/png;base64,iVBO' };
  const coverOn = (s: Slide) => coverOver(s, logo, DEFAULT_STYLE, 'Заставка');
  const qrOn = (s: Slide) => qrOver(s, 'http://192.168.0.2:4747/follow', DEFAULT_STYLE, 'QR');

  it('L, L: exactly the covered slide; hidden or black over the cover changes nothing', () => {
    const cover = coverOn(verse);
    expect(cover).toMatchObject({ visible: true, lines: [], cover: logo, returnTo: verse });
    expect(uncover(cover)).toBe(verse);
    expect(uncover(toggleHidden(cover)!)).toBe(verse);
    expect(uncover(toggleBlack(cover))).toBe(verse);
  });

  it('nothing to give back: an empty or black screen under it, or an older cover', () => {
    const empty: Slide = { lines: [], reference: '', blank: false, visible: false };
    expect(uncover(coverOn(empty))).toBeNull();
    expect(uncover(coverOn(toggleBlack(verse)))).toBeNull();
    expect(uncover({ ...coverOn(verse), returnTo: undefined })).toBeNull(); // made by 1.4.1
  });

  it('the QR over «Заставка» gives the cover back; «Заставка» over the QR, the text', () => {
    const cover = coverOn(verse);
    const qr = qrOn(cover);
    expect(uncover(qr)).toBe(cover);
    expect(uncover(uncover(qr)!)).toBe(verse);
    expect(uncover(coverOn(qrOn(verse)))).toBe(verse);
    expect(uncover(coverOn(qr))).toBe(verse); // never a cover under a cover
    expect(uncover(qrOn(qrOn(verse)))).toBe(verse); // the QR again keeps what it covers
  });

  it('a window that takes over gives back what another one covered', async () => {
    // A leads and covers Івана 3:16; B (standby) mirrors the bus and takes over. The covered
    // slide used to live in a ref of A's own: B's L emptied the screen, and A, leading
    // again, brought back its own stale slide.
    const endpoints = new Set<(m: Wire) => void>();
    const endpoint = () => {
      let mine: ((m: Wire) => void) | null = null;
      return {
        post: (m: Wire) => {
          for (const cb of endpoints) if (cb !== mine) queueMicrotask(() => cb(structuredClone(m)));
        },
        listen: (cb: (m: Wire) => void) => {
          mine = cb;
          endpoints.add(cb);
          return () => endpoints.delete(cb);
        },
      };
    };
    const bg = `data:image/jpeg;base64,${'/9j/'.repeat(20_000)}`;
    const shown: Slide = { ...verse, style: { ...DEFAULT_STYLE, bgImage: bg } };
    const a = createBus(endpoint(), null);
    const b = createBus(endpoint(), null);
    let mirrored: Slide | null = null;
    b.setPublishing(false);
    b.subscribeSlide((s) => (mirrored = s));
    a.publishSlide(shown);
    a.publishSlide(coverOn(shown));
    await new Promise((r) => setTimeout(r, 0));

    const back = uncover(mirrored!); // B's L
    expect(back).toMatchObject({ reference: 'Ів 3:16', source: verse.source });
    expect(back!.style?.bgImage).toBe(bg); // whole: the background came by reference
    expect(sameSlide(back!, shown)).toBe(true);
  });

  it('the phones get neither images nor what is covered: the hub takes 256 KB a frame', () => {
    // the hub closes a socket that sends more (server/src/live.ts `MAX_FRAME_BYTES`): with
    // the covered slide and its photo background in the frame, every L over a photo did
    const bg = `data:image/jpeg;base64,${'/9j/'.repeat(250_000)}`; // a photo: 1 M chars
    const shown: Slide = { ...verse, style: { ...DEFAULT_STYLE, bgImage: bg } };
    const image = `data:image/png;base64,${'iVBO'.repeat(100_000)}`;
    const cover = coverOver(shown, { ...logo, image }, shown.style!, 'Заставка');
    const hiddenQr = toggleHidden(qrOn(shown))!; // «Сховати текст» over the QR reaches them
    for (const s of [shown, cover, hiddenQr, qrOn(cover)]) {
      const sent = forAudience(s);
      expect(sent.returnTo).toBeUndefined();
      expect(sent.cover).toBeUndefined();
      expect(sent.style?.bgImage ?? null).toBeNull();
      expect(new TextEncoder().encode(JSON.stringify(sent)).length).toBeLessThan(2_000);
    }
    expect(forAudience(hiddenQr)).toMatchObject({ qr: 'http://192.168.0.2:4747/follow' });
    expect(forAudience(shown).lines).toBe(shown.lines);
    // the control windows' slide stays whole
    expect(cover.returnTo?.style?.bgImage).toBe(bg);
    expect(cover.cover?.image).toBe(image);
  });

  it('a slide compares with what it covers, the images by instance', () => {
    const cover = coverOn(verse);
    expect(sameSlide(cover, coverOn(verse))).toBe(true);
    expect(sameSlide(cover, coverOn({ ...verse, reference: 'Ів 3:17' }))).toBe(false);
    expect(sameSlide(cover, { ...cover, returnTo: null })).toBe(false);
    const image = `data:image/png;base64,${'iVBO'.repeat(10_000)}`;
    const big = coverOver(verse, { ...logo, image }, DEFAULT_STYLE, 'Заставка');
    expect(sameSlide(big, { ...big, cover: { ...logo, image: `${image}` } })).toBe(true);
    expect(sameSlide(big, { ...big, cover: { ...logo, image: `${image}A` } })).toBe(false);
  });
});

describe('«Сховати текст» / «Чорний екран» toggles (0.6.18)', () => {
  const verse = {
    lines: [{ translationAbbr: 'UKRK', text: 'На початку було Слово', rtl: false }],
    reference: 'Івана 1:1',
    blank: false,
    visible: true,
  };

  it('hide, then show exactly the same slide', () => {
    const hidden = toggleHidden(verse)!;
    expect(hidden.blank).toBe(true);
    expect(hidden.lines).toEqual(verse.lines);
    expect(toggleHidden(hidden)).toEqual({ ...verse, blank: false });
  });

  it('black keeps what was there and gives it back; from black «Сховати» goes to hidden', () => {
    const black = toggleBlack(verse);
    expect(black.forceBlack).toBe(true);
    expect(toggleBlack(black)).toEqual({ ...verse, forceBlack: false });
    expect(toggleHidden(black)).toMatchObject({
      forceBlack: false,
      blank: true,
      lines: verse.lines,
    });
    // black over hidden text → un-black → still hidden
    expect(toggleBlack(toggleBlack(toggleHidden(verse)!))).toMatchObject({
      blank: true,
      forceBlack: false,
    });
  });

  it('nothing to hide on an empty screen; black still works there', () => {
    const empty = { lines: [], reference: '', blank: false, visible: false };
    expect(toggleHidden(empty)).toBeNull();
    expect(toggleBlack(empty)).toMatchObject({ forceBlack: true, visible: true });
  });
});
