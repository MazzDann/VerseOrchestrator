import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { type QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type Translation } from '../../api';
import { type Appearance, useSettings } from '../../settingsStore';
import { type Slide, type SlideLine, type SlideStyle } from '../../presenterBus';
import { passageLines } from '../../lib/passageLines';
import { formatReference } from '../../lib/reference';
import { addPlace, type Place } from '../../lib/places';
import { numbersOn } from './slideText';
import { standbyNotice } from './standby';
import { noticeOnScreen } from '../../lib/onScreenNotice';
import { tr } from '../../i18n';

/**
 * Several places on one slide (1.23.0-beta.7, the users' F1114-07; the author: both ways) —
 * «Ів 3:16; Рим 5:8» in the search, and «Додати до слайда» gathering the selected verses, then
 * «Показати». Each place is a line of its own with its reference by it; the slide's reference
 * lists them. Like «На екран зі Стронгом» it holds the preview over the verse selection, which it
 * leaves as it was: «Далі» goes on with the verses in the list. With «Наживо» off it waits in the
 * preview for «На екран». No effects: the hook-call order of Control is untouched.
 */
export function usePlacesSlide({
  queryClient,
  translations,
  selectedIds,
  appearance,
  slideStyle,
  slideTemplate,
  liveFollow,
  pushLive,
  setPreviewOverride,
  setLive,
  leaderRef,
  liveSlideRef,
}: {
  queryClient: QueryClient;
  translations: Translation[];
  selectedIds: number[];
  appearance: Appearance;
  slideStyle: SlideStyle;
  slideTemplate: Slide['template'];
  liveFollow: boolean;
  pushLive: (slide: Slide) => void;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
  setLive: (live: boolean) => void;
  leaderRef: MutableRefObject<boolean>;
  /** what is on screen now: Ctrl+Enter adds to the verses there (1.24.0-beta.2) */
  liveSlideRef: MutableRefObject<Slide>;
}) {
  const [gathered, setGathered] = useState<Place[]>([]);
  /** the places of the last slide made here, to know it again on screen */
  const lastShown = useRef<{ slide: Slide; places: Place[] } | null>(null);

  const bookList = (id: number) =>
    queryClient.fetchQuery({ queryKey: ['books', id], queryFn: () => api.books(id) });

  /** A typed reference as a place, in the main translation's numbering (else the first that has it). */
  const resolve = async (ref: string): Promise<Place | null> => {
    const main = selectedIds[0];
    let res = main != null ? await api.search(ref, [main]) : null;
    if (!res || res.kind !== 'reference' || res.results.length === 0)
      res = await api.search(ref, [], { skip: useSettings.getState().archivedTranslations });
    if (res.kind !== 'reference' || res.results.length === 0) return null;
    const f = res.results[0];
    const verses = res.results
      .filter(
        (r) =>
          r.translationId === f.translationId &&
          r.bookNumber === f.bookNumber &&
          r.chapter === f.chapter,
      )
      .map((r) => r.verse);
    return { bookNumber: f.bookNumber, chapter: f.chapter, verses: [...new Set(verses)] };
  };

  const build = async (places: Place[]): Promise<Slide | null> => {
    const ids = selectedIds.length ? selectedIds : [];
    if (!ids.length || !places.length) return null;
    const books = await bookList(ids[0]);
    const single = ids.length === 1;
    const lines: SlideLine[] = [];
    const refs: string[] = [];
    for (const p of places) {
      const book = books.find((b) => b.bookNumber === p.bookNumber) ?? null;
      const ref = formatReference(book, p.chapter, p.verses);
      const short = formatReference(book, p.chapter, p.verses, true);
      const { lines: own } = await passageLines(
        queryClient,
        translations,
        ids,
        p.bookNumber,
        p.chapter,
        p.verses,
        numbersOn(appearance.verseNumbers, p.verses.length),
      );
      // a place none of the slide's translations has: the slide can't say it — none (the review)
      if (!own.length) return null;
      refs.push(ref);
      // its reference by each of its lines; one translation — no abbreviation, only the place
      for (const l of own)
        lines.push({ ...l, translationAbbr: single ? '' : l.translationAbbr, ownRef: short });
    }
    if (lines.length === 0) return null;
    return {
      lines,
      reference: refs.join('; '),
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
    };
  };

  /** false: a window on standby — nothing shown */
  /** `now`: on screen whatever «Наживо» says — Ctrl+Enter shows, as it always did */
  const show = (slide: Slide, places?: Place[], now = false): boolean => {
    if (!leaderRef.current) {
      standbyNotice();
      return false;
    }
    if (places) lastShown.current = { slide, places };
    setPreviewOverride(slide);
    const onScreen = liveFollow || now;
    if (onScreen) {
      pushLive(slide);
      setLive(true);
    }
    if (onScreen) noticeOnScreen(slide.reference, 2000);
    else
      notifications.show({
        message: tr('У прев’ю: {ref} — на екран кнопкою «На екран»', { ref: slide.reference }),
        color: 'cue',
        autoClose: 2000,
      });
    return true;
  };

  const say = (message: string) => {
    notifications.show({ message, color: 'gray', autoClose: 2500 });
  };

  /** «Ів 3:16; Рим 5:8» from the search: shown, or said why not. */
  const showTyped = async (refs: string[]): Promise<void> => {
    const places = (await Promise.all(refs.map(resolve))).filter((p): p is Place => !!p);
    if (places.length < refs.length) {
      say(tr('Не всі місця знайдено: перевірте посилання через «;»'));
      return;
    }
    const slide = await build(places);
    if (slide) show(slide, places);
    else say(tr('Не всі місця є в позначених перекладах: позначте переклад угорі'));
  };

  /**
   * The verses on screen as places (1.24.0-beta.2): a slide of places made here, or a verse
   * selection's slide — null when the screen shows no verses (empty, black, hidden, a song, a
   * cover, a picture…), when Ctrl+Enter shows a place as before.
   */
  const placesOnScreen = (): Place[] | null => {
    const s = liveSlideRef.current;
    if (!s.visible || s.blank || s.forceBlack || s.cover || s.qr || s.picture || s.video)
      return null;
    if (!s.lines.length) return null;
    const last = lastShown.current;
    if (last && last.slide.reference === s.reference && !s.source) return last.places;
    if (s.source?.kind === 'verses')
      return [
        { bookNumber: s.source.bookNumber, chapter: s.source.chapter, verses: s.source.verses },
      ];
    return null;
  };

  /**
   * Ctrl+Enter on a reference (1.24.0-beta.2, the author: «рим 2 3» + Ctrl+Enter, «ів 4 6» +
   * Ctrl+Enter — both on screen): added to the verses on screen; false when none are there (the
   * caller then goes and shows it as before).
   */
  const addTyped = async (ref: string): Promise<boolean> => {
    const now = placesOnScreen();
    if (!now) return false;
    const p = await resolve(ref);
    if (!p) {
      say(tr('Не всі місця знайдено: перевірте посилання через «;»'));
      return true;
    }
    const places = addPlace(now, p);
    const slide = await build(places);
    if (!slide) say(tr('Не всі місця є в позначених перекладах: позначте переклад угорі'));
    else show(slide, places, true);
    return true;
  };

  /** «Додати до слайда»: the selected verses gathered for one slide. */
  const gather = (p: Place) => {
    if (!p.verses.length) return;
    setGathered((g) => addPlace(g, p));
  };

  /** «Показати»: the gathered places on one slide, then the gathering starts afresh. */
  const showGathered = async () => {
    const slide = await build(gathered);
    if (!slide) {
      say(tr('Не всі місця є в позначених перекладах: позначте переклад угорі'));
      return;
    }
    // kept on a standby window: shown later from the one in charge (the review)
    if (show(slide, gathered)) setGathered([]);
  };

  return {
    gathered,
    gather,
    showGathered,
    clearGathered: () => setGathered([]),
    showTyped,
    addTyped,
  };
}
