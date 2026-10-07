import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  Box,
  Center,
  Divider,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconArrowRight,
  IconDeviceTv,
  IconMoonStars,
  IconPhoto,
  IconSearch,
  IconSquareFilled,
  IconSquareOff,
  IconSun,
} from '@tabler/icons-react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type RemoteCommand, type SearchResult, type Verse } from '../api';
import { DEFAULT_STYLE, type Slide, type SlideLine } from '../presenterBus';
import { DEFAULT_APPEARANCE } from '../settingsStore';
import { DEFAULT_KEYMAP, matchesCombo, slashTyped, stepDirection } from '../hotkeys';
import {
  targetArgs,
  type PlaylistEntry,
  type RemotePassage,
  type RemoteTarget,
} from '../lib/commands';
import {
  chapterName,
  crossTarget,
  edgeNotice,
  landingVerse,
  pressAtEdge,
  translationEdge,
  type CrossArm,
} from '../lib/chapterCross';
import { deskTokenOf, liveCountdown, mayPress, stepVerses } from '../lib/desk';
import { showsTime } from '../lib/countdown';
import { formatReference } from '../lib/reference';
import { ToolButton, ToolIcon, ToolZone } from '../components/Toolbar';
import { TranslationPicker } from '../components/TranslationPicker';
import { VirtualList } from '../components/VirtualList';
import { VerseList } from './control/VerseList';
import { joinVerses, redLetterSegments } from './control/slideText';
import { useDesk } from './desk/deskStore';
import { useDeskHub } from './desk/useDeskHub';
import { DeskSearch } from './desk/DeskSearch';
import { DeskCountdown } from './desk/DeskCountdown';
import { DeskAside } from './desk/DeskAside';
import { tr, useLang } from '../i18n';

const KEYS = DEFAULT_KEYMAP;
const NO_VERSES: Verse[] = [];
const noop = () => {};

/**
 * A control window on another computer (`/desk#<token>`, 1.9.0-beta.10, F1005-10 — the author: a
 * real control window with permissions, not a wide /remote). Built from the control window's
 * parts (the books, the verse list, the monitors, the toolbar), but over the remote protocol:
 * it reads the library like a phone and sends commands the operator allowed; the control
 * window on the computer with the app turns them into slides in its own look and stays the only
 * one that puts anything on the output windows. Its own state lives under `vo:desk`.
 */
export function Desk() {
  const lang = useLang();
  const token = useMemo(() => deskTokenOf(window.location.hash) ?? '', []);
  // a new link pasted into an open tab only changes the #fragment: start over with it
  useEffect(() => {
    const onHash = () => window.location.reload();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const { link, live, next, playlist, rtt, press } = useDeskHub(token);
  const allowed: RemoteCommand[] =
    link.kind === 'ready' || link.kind === 'offline' ? (link.allowed ?? []) : [];
  const name = link.kind === 'ready' || link.kind === 'offline' ? (link.name ?? '') : '';
  useEffect(() => {
    document.title = name
      ? `VerseOrchestrator — ${tr('пульт «{remote}»', { remote: name })}`
      : 'VerseOrchestrator';
  }, [name]);

  const place = useDesk();
  const { mode, translationIds: ids, bookNumber, chapter, verses: chosen, songId, stanza } = place;
  const set = place.set;
  const primary = ids[0] ?? null;
  const queryClient = useQueryClient();

  const translations = useQuery({ queryKey: ['translations'], queryFn: api.translations });
  // The first visit: the translations on screen, else one in the interface's language, else the
  // library's first. A translation the library no longer has (a module removed) leaves the list.
  useEffect(() => {
    const all = translations.data;
    if (!all?.length) return;
    const known = ids.filter((id) => all.some((t) => t.id === id));
    if (known.length !== ids.length) return set({ translationIds: known });
    if (ids.length > 0) return;
    const src = live?.source;
    const fromScreen =
      src?.kind === 'verses' ? src.translationIds.filter((id) => all.some((t) => t.id === id)) : [];
    const ours = all.find((t) => t.language === lang) ?? all[0];
    set({ translationIds: fromScreen.length > 0 ? fromScreen.slice(0, 5) : [ours.id] });
  }, [ids, translations.data, live, set, lang]);

  const books = useQuery({
    queryKey: ['books', primary],
    queryFn: () => api.books(primary!),
    enabled: primary != null,
  });
  const chapters = useQuery({
    queryKey: ['chapters', primary, bookNumber],
    queryFn: () => api.chapters(primary!, bookNumber!),
    enabled: primary != null && bookNumber != null,
  });
  const verseQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['verses', id, bookNumber, chapter],
      queryFn: () => api.verses(id, bookNumber!, chapter!),
      enabled: bookNumber != null && chapter != null,
    })),
  });
  const primaryVerses = verseQueries[0]?.data ?? NO_VERSES;
  const currentBook = books.data?.find((b) => b.bookNumber === bookNumber) ?? null;
  const [bookFilter, setBookFilter] = useState('');
  const shownBooks = useMemo(() => {
    const q = bookFilter.trim().toLowerCase();
    return (books.data ?? []).filter(
      (b) => !q || b.longName.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q),
    );
  }, [books.data, bookFilter]);
  const [songFilter, setSongFilter] = useState('');
  const [songQuery, setSongQuery] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setSongQuery(songFilter.trim()), 250);
    return () => window.clearTimeout(t);
  }, [songFilter]);
  const songs = useQuery({
    queryKey: ['songs', songQuery],
    queryFn: () => api.songs(songQuery),
    enabled: mode === 'songs',
  });
  const song = useQuery({
    queryKey: ['song', songId],
    queryFn: () => api.song(songId!),
    enabled: songId != null && mode === 'songs',
    retry: false,
  });
  // a song the library no longer has: forget it
  useEffect(() => {
    if (song.isError) set({ songId: null, stanza: null });
  }, [song.isError, set]);
  // «Пісні» taken away by the operator (or never given): back to the Bible
  const songsAllowed = allowed.includes('songs');
  useEffect(() => {
    if (link.kind === 'ready' && !songsAllowed && mode === 'songs') set({ mode: 'bible' });
  }, [link.kind, songsAllowed, mode, set]);

  // what «На екран» sends: the verses chosen here, or a stanza
  const target: RemoteTarget | null =
    mode === 'songs'
      ? songId != null && stanza != null && song.data?.slides[stanza]
        ? { kind: 'song', song: { songId, stanza } }
        : null
      : primary != null && currentBook && chapter != null && chosen.length > 0
        ? {
            kind: 'verses',
            passage: {
              translationIds: ids,
              bookNumber: currentBook.bookNumber,
              chapter,
              verses: chosen,
            },
          }
        : null;
  const carries = mode === 'songs' ? 'song' : 'verses';

  // The preview, drawn as the screen looks now (its style and layout): the operator's control
  // window builds the real slide in its own settings — the verse numbers and red letters may differ.
  const style = live?.style ?? DEFAULT_STYLE;
  const template = live?.template ?? null;
  const preview: Slide | null = (() => {
    if (mode === 'songs') {
      const s = stanza != null ? song.data?.slides[stanza] : undefined;
      if (!s || !song.data) return null;
      return {
        lines: [{ translationAbbr: '', text: s.text, rtl: false }],
        reference: `№${song.data.number ?? ''} ${song.data.title}`.trim(),
        blank: false,
        visible: true,
        style,
        template,
      };
    }
    if (chosen.length === 0 || !currentBook) return null;
    const lines: SlideLine[] = [];
    ids.forEach((id, i) => {
      const vs = verseQueries[i]?.data;
      if (!vs) return;
      const text = joinVerses(vs, chosen, DEFAULT_APPEARANCE.showVerseNumbers);
      if (!text.trim()) return;
      const t = translations.data?.find((x) => x.id === id);
      const segments = redLetterSegments(vs, chosen, DEFAULT_APPEARANCE.showVerseNumbers);
      lines.push({ translationAbbr: t?.abbr ?? '', text, rtl: !!t?.rtl, segments });
    });
    if (lines.length === 0) return null;
    return {
      lines,
      reference: formatReference(currentBook, chapter, chosen),
      blank: false,
      visible: true,
      style,
      template,
    };
  })();

  const refused = () =>
    notifications.show({
      message: tr('Не дозволено оператором'),
      color: 'orange',
      autoClose: 2000,
    });
  const flash = (message: string) =>
    notifications.show({ message, color: 'gray', autoClose: 1800 });

  /**
   * The desk's cursor: what it last asked to put on screen — set at the press, so two quick
   * «Далі» step twice before the screen's frame comes back (review); dropped when refused.
   */
  const cursor = useRef<RemoteTarget | null>(null);
  const showTarget = (t: RemoteTarget | null) => {
    if (!t) return flash(tr('Спершу виберіть, що показати'));
    if (!mayPress(allowed, 'show', t.kind === 'song' ? 'song' : 'verses')) return refused();
    cursor.current = t;
    press('show', targetArgs(t), (ok) => {
      if (!ok && cursor.current === t) cursor.current = null;
    });
  };
  const show = () => showTarget(target);

  // What is on screen came from this desk: «Далі» / «Назад» walk it here, in its translations;
  // anything else steps as the operator's own «Далі» does. A slide is this desk's when it says so
  // (`by`: the pairing's name — one per pairing since this release, remote.ts uniqueName).
  const src = live?.source;
  const mine = !!name && src?.by === name;
  /** «Далі» past a chapter's edge: armed by the first press, crossed by the second (0.6.23) */
  const crossArm = useRef<CrossArm | null>(null);
  /** a held key (its repeats) steps on, never across a chapter's edge (1.9.5, Mac check) */
  const step = (delta: 1 | -1, held = false) =>
    walk(delta, held).catch(() => flash(tr('Не вдалося відкрити розділ — перевірте зв’язок')));
  const walk = async (delta: 1 | -1, held = false) => {
    // from the cursor (pressed, maybe not on screen yet); after a reload, from the screen
    const at =
      cursor.current ??
      (src?.kind === 'verses'
        ? ({
            kind: 'verses',
            passage: {
              translationIds: src.translationIds,
              bookNumber: src.bookNumber,
              chapter: src.chapter,
              verses: src.verses,
            },
          } as RemoteTarget)
        : src?.kind === 'song'
          ? ({ kind: 'song', song: { songId: src.songId, stanza: src.stanza } } as RemoteTarget)
          : null);
    if (mine && at?.kind === 'verses' && mayPress(allowed, 'show', 'verses')) {
      const p = at.passage;
      const tid = p.translationIds[0];
      const list = await queryClient.fetchQuery({
        queryKey: ['verses', tid, p.bookNumber, p.chapter],
        queryFn: () => api.verses(tid, p.bookNumber, p.chapter),
      });
      const to = stepVerses(
        list.map((v) => v.verse),
        p.verses,
        delta,
      );
      if (to) {
        crossArm.current = null;
        return walkTo({ ...p, verses: to });
      }
      return crossChapter(p, delta, held);
    }
    if (mine && at?.kind === 'song' && mayPress(allowed, 'show', 'song')) {
      const s = await queryClient.fetchQuery({
        queryKey: ['song', at.song.songId],
        queryFn: () => api.song(at.song.songId),
      });
      const to = at.song.stanza + delta;
      if (to < 0 || to >= s.slides.length) {
        return flash(delta > 0 ? tr('Це остання строфа') : tr('Це перша строфа'));
      }
      set({ mode: 'songs', songId: at.song.songId, stanza: to });
      return showTarget({ kind: 'song', song: { songId: at.song.songId, stanza: to } });
    }
    const cmd = delta > 0 ? 'next' : 'prev';
    if (!mayPress(allowed, cmd)) return refused();
    press(cmd);
  };
  const walkTo = (p: RemotePassage) => {
    set({ mode: 'bible', bookNumber: p.bookNumber, chapter: p.chapter, verses: p.verses });
    scrollTo.current = p.verses[0];
    showTarget({ kind: 'verses', passage: p });
  };
  // at the chapter's edge: the first press says where the next goes, a second one (5 s) goes —
  // into the next chapter, or the next book (as the operator's «Далі» and the phone's)
  const crossChapter = async (p: RemotePassage, delta: 1 | -1, held = false) => {
    const tid = p.translationIds[0];
    const step = pressAtEdge(
      crossArm.current,
      `${tid}:${p.bookNumber}:${p.chapter}:${delta}`,
      Date.now(),
      held,
    );
    crossArm.current = step.arm;
    const [chapterList, bookList] = await Promise.all([
      queryClient.fetchQuery({
        queryKey: ['chapters', tid, p.bookNumber],
        queryFn: () => api.chapters(tid, p.bookNumber),
      }),
      queryClient.fetchQuery({ queryKey: ['books', tid], queryFn: () => api.books(tid) }),
    ]);
    const to = await crossTarget(
      { book: p.bookNumber, chapter: p.chapter },
      chapterList,
      bookList.map((b) => b.bookNumber),
      delta,
      (b) =>
        queryClient.fetchQuery({
          queryKey: ['chapters', tid, b],
          queryFn: () => api.chapters(tid, b),
        }),
    );
    if (!to) {
      crossArm.current = null;
      return flash(translationEdge(delta));
    }
    const book = bookList.find((b) => b.bookNumber === to.book) ?? null;
    if (!step.cross) return flash(edgeNotice(delta, chapterName(book, to.chapter), to.newBook));
    const verses = await queryClient.fetchQuery({
      queryKey: ['verses', tid, to.book, to.chapter],
      queryFn: () => api.verses(tid, to.book, to.chapter),
    });
    const v = landingVerse(
      verses.map((x) => x.verse),
      delta,
    );
    if (v == null) return flash(tr('У цьому розділі немає віршів'));
    walkTo({ ...p, bookNumber: to.book, chapter: to.chapter, verses: [v] });
  };
  const toggle = (cmd: 'blank' | 'black' | 'cover') =>
    mayPress(allowed, cmd) ? press(cmd) : refused();
  const running = liveCountdown(live);
  const countdownKey = () => {
    if (!mayPress(allowed, 'countdown')) return refused();
    const showing = !!running && showsTime(running, Date.now());
    press('countdown', { countdown: { op: showing ? 'pause' : 'start' } });
  };

  const openBook = (bn: number) => {
    if (bn === bookNumber) return;
    // a book opens at its first chapter (1.4.4), nothing chosen yet
    set({ mode: 'bible', bookNumber: bn, chapter: null, verses: [] });
    void queryClient
      .fetchQuery({
        queryKey: ['chapters', primary, bn],
        queryFn: () => api.chapters(primary!, bn),
      })
      .then((list) => {
        if (useDesk.getState().bookNumber === bn && list.length > 0) set({ chapter: list[0] });
      });
  };
  // a search row opens its chapter at the verse; its own translation leads (its numbering)
  const openFound = (r: SearchResult) => {
    const lead =
      ids[0] === r.translationId
        ? ids
        : [r.translationId, ...ids.filter((id) => id !== r.translationId)].slice(0, 5);
    set({
      mode: 'bible',
      translationIds: lead,
      bookNumber: r.bookNumber,
      chapter: r.chapter,
      verses: [r.verse],
    });
    scrollTo.current = r.verse;
  };
  // the chosen verse comes into view: at the start, after a search, a step of «Далі» here
  const scrollTo = useRef<number | null>(chosen[0] ?? null);
  useEffect(() => {
    const v = scrollTo.current;
    if (v == null || primaryVerses.length === 0) return;
    const row = document.querySelector(`.vo-desk-verses [data-verse="${v}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center' });
    scrollTo.current = null;
  }, [primaryVerses, bookNumber, chapter, chosen]);

  // The keys (fixed: the control window's defaults, not rebindable here yet)
  const searchRef = useRef<HTMLInputElement>(null);
  const versesViewport = useRef<HTMLDivElement>(null);
  const keyHandler = useRef<(e: KeyboardEvent) => void>(noop);
  keyHandler.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || link.kind === 'denied') return;
    if (matchesCombo(e, KEYS.project)) {
      e.preventDefault();
      if (!e.repeat) show();
      return;
    }
    const el = e.target as HTMLElement | null;
    if (el?.closest('input, textarea, select, [contenteditable="true"], [role="option"]')) return;
    if (matchesCombo(e, KEYS.searchFocus) || slashTyped(e, KEYS)) {
      e.preventDefault();
      return searchRef.current?.focus();
    }
    // the toggles ignore a held key's repeats (a held «.» flickered the screen, 1.9.5)
    const toggles = [
      [KEYS.blank, () => toggle('blank')],
      [KEYS.black, () => toggle('black')],
      [KEYS.cover, () => toggle('cover')],
      [KEYS.countdown, () => countdownKey()],
    ] as const;
    for (const [combo, act] of toggles)
      if (matchesCombo(e, combo)) {
        if (!e.repeat) act();
        return;
      }
    const d = stepDirection(e, KEYS);
    if (d !== 0) {
      e.preventDefault();
      void step(d, e.repeat);
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('dark');

  if (link.kind === 'denied') return <Denied reason={link.reason} />;

  const canShow = !!target && mayPress(allowed, 'show', carries);
  const blankOn = !!live?.blank && !live.forceBlack;
  const blackOn = !!live?.forceBlack;
  const coverOn = !!live?.cover;
  const status =
    link.kind === 'ready'
      ? { color: 'var(--mantine-color-green-filled)', text: tr('на зв’язку') }
      : link.kind === 'offline' && link.off
        ? { color: 'var(--mantine-color-dimmed)', text: tr('застосунок вимкнено') }
        : { color: 'var(--mantine-color-orange-filled)', text: tr('підключаюся…') };
  const verseList = mode === 'bible';
  const verseVerses = verseQueries[0];

  return (
    <div className="vo-desk">
      <header className="vo-desk-head">
        <Tooltip
          label={
            rtt != null && link.kind === 'ready'
              ? tr('{status} · відповідь за {ms} мс', { status: status.text, ms: rtt })
              : status.text
          }
        >
          <Group gap={8} wrap="nowrap" style={{ minWidth: 0, maxWidth: '14rem' }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flex: 'none',
                background: status.color,
              }}
            />
            <Text size="sm" fw={600} truncate>
              {name || tr('Пульт')}
            </Text>
          </Group>
        </Tooltip>
        <DeskSearch
          translationIds={ids}
          translations={translations.data ?? []}
          inputRef={searchRef}
          onOpen={openFound}
        />
        <SegmentedControl
          size="xs"
          aria-label={tr('Режим')}
          value={mode}
          onChange={(v) => set({ mode: v as 'bible' | 'songs' })}
          data={[
            { value: 'bible', label: tr('Біблія') },
            { value: 'songs', label: tr('Пісні'), disabled: !allowed.includes('songs') },
          ]}
        />
        <ToolZone label={tr('Показ')}>
          <ToolIcon
            label={tr('Назад')}
            hint={mine ? tr('Попередні вірші того, що ви показали') : tr('Як «Назад» оператора')}
            combo={KEYS.advancePrev}
            icon={<IconArrowLeft size={18} stroke={1.5} />}
            disabled={!(mine || mayPress(allowed, 'prev'))}
            onClick={() => void step(-1)}
          />
          <ToolIcon
            label={tr('Далі')}
            hint={mine ? tr('Наступні вірші того, що ви показали') : tr('Як «Далі» оператора')}
            combo={KEYS.advanceNext}
            icon={<IconArrowRight size={18} stroke={1.5} />}
            disabled={!(mine || mayPress(allowed, 'next'))}
            onClick={() => void step(1)}
          />
          <ToolButton
            label={tr('На екран')}
            hint={canShow || !target ? tr('Показати прев’ю') : tr('Не дозволено оператором')}
            text={tr('На екран')}
            variant="filled"
            color="live"
            combo={KEYS.project}
            icon={<IconDeviceTv size={18} stroke={1.5} />}
            disabled={!canShow}
            onClick={show}
          />
        </ToolZone>
        <ToolZone label={tr('Екран')}>
          <ToolIcon
            label={blankOn ? tr('Показати текст') : tr('Сховати текст')}
            hint={mayPress(allowed, 'blank') ? undefined : tr('Не дозволено оператором')}
            combo={KEYS.blank}
            icon={<IconSquareOff size={18} stroke={1.5} />}
            active={blankOn}
            color={blankOn ? 'cue' : undefined}
            disabled={!mayPress(allowed, 'blank')}
            onClick={() => toggle('blank')}
          />
          <ToolIcon
            label={blackOn ? tr('Зняти чорний екран') : tr('Чорний екран')}
            hint={mayPress(allowed, 'black') ? undefined : tr('Не дозволено оператором')}
            combo={KEYS.black}
            icon={<IconSquareFilled size={16} />}
            color="dark"
            active={blackOn}
            disabled={!mayPress(allowed, 'black')}
            onClick={() => toggle('black')}
          />
          <ToolIcon
            label={coverOn ? tr('Прибрати заставку') : tr('Заставка')}
            hint={mayPress(allowed, 'cover') ? undefined : tr('Не дозволено оператором')}
            combo={KEYS.cover}
            icon={<IconPhoto size={18} stroke={1.5} />}
            active={coverOn}
            disabled={!mayPress(allowed, 'cover')}
            onClick={() => toggle('cover')}
          />
          <DeskCountdown
            running={running}
            allowed={mayPress(allowed, 'countdown')}
            combo={KEYS.countdown}
            onCountdown={(countdown) =>
              mayPress(allowed, 'countdown') ? press('countdown', { countdown }) : refused()
            }
          />
        </ToolZone>
        <ToolZone label={tr('Вигляд')}>
          <ToolIcon
            label={scheme === 'dark' ? tr('Світла тема') : tr('Темна тема')}
            icon={
              scheme === 'dark' ? (
                <IconSun size={18} stroke={1.5} />
              ) : (
                <IconMoonStars size={18} stroke={1.5} />
              )
            }
            onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
          />
        </ToolZone>
      </header>

      <div className="vo-desk-body">
        <nav className="vo-desk-col vo-desk-nav" aria-label={verseList ? tr('Книги') : tr('Пісні')}>
          {verseList ? (
            <ScrollArea h="100%" scrollbars="y">
              <TranslationPicker
                translations={translations.data ?? []}
                selectedIds={ids}
                onChange={(next) => set({ translationIds: next })}
                onMakePrimary={(id) =>
                  set({ translationIds: [id, ...ids.filter((x) => x !== id)] })
                }
              />
              <Divider />
              <Box p="xs" pb={4}>
                <TextInput
                  size="xs"
                  placeholder={tr('Фільтр книг…')}
                  aria-label={tr('Фільтр книг…')}
                  value={bookFilter}
                  onChange={(e) => setBookFilter(e.currentTarget.value)}
                  leftSection={<IconSearch size={14} />}
                />
              </Box>
              <Box style={{ height: '60vh', minHeight: 160, padding: '0 8px' }}>
                <VirtualList
                  items={shownBooks}
                  getKey={(b) => b.bookNumber}
                  isSelected={(b) => b.bookNumber === bookNumber}
                  onSelect={(b) => openBook(b.bookNumber)}
                  renderRow={(b) => b.longName || b.shortName}
                  estimateSize={30}
                  empty={
                    primary == null
                      ? tr('Позначте переклад угорі, щоб побачити його книги')
                      : tr('Немає книг, що збігаються з «{filter}»', { filter: bookFilter.trim() })
                  }
                />
              </Box>
            </ScrollArea>
          ) : (
            <Stack gap={0} h="100%">
              <Box p="xs">
                <TextInput
                  size="xs"
                  placeholder={tr('Назва чи номер пісні…')}
                  aria-label={tr('Назва чи номер пісні…')}
                  value={songFilter}
                  onChange={(e) => setSongFilter(e.currentTarget.value)}
                  leftSection={<IconSearch size={14} />}
                />
              </Box>
              <Box style={{ flex: 1, minHeight: 0, padding: '0 8px 8px' }}>
                <VirtualList
                  items={songs.data ?? []}
                  getKey={(s) => s.id}
                  isSelected={(s) => s.id === songId}
                  onSelect={(s) => set({ songId: s.id, stanza: 0 })}
                  renderRow={(s) => `${s.number != null ? `${s.number}. ` : ''}${s.title}`}
                  estimateSize={30}
                  empty={
                    songs.isLoading
                      ? ''
                      : songQuery
                        ? tr('Немає пісень за «{query}»', { query: songQuery })
                        : tr('Пісень у бібліотеці ще немає')
                  }
                />
              </Box>
            </Stack>
          )}
        </nav>

        <main className="vo-desk-col vo-desk-centre">
          {verseList ? (
            <>
              {currentBook && (
                <Box px="md" pt="xs" pb={6}>
                  <Text size="sm" fw={600} mb={6}>
                    {currentBook.longName}
                    {chapter != null ? ` ${chapter}` : ''}
                  </Text>
                  <div className="vo-chapter-grid" role="group" aria-label={tr('Розділи')}>
                    {(chapters.data ?? []).map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="vo-chip"
                        data-selected={c === chapter ? 'true' : undefined}
                        aria-current={c === chapter ? 'true' : undefined}
                        onClick={() => set({ chapter: c, verses: [] })}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </Box>
              )}
              <div className="vo-desk-verses">
                <VerseList
                  panelPlacement="aside"
                  verseViewport={versesViewport}
                  primaryVerses={primaryVerses}
                  selectedVerses={chosen}
                  toggleVerse={(v) =>
                    set({
                      verses: chosen.includes(v)
                        ? chosen.filter((x) => x !== v)
                        : [...chosen, v].sort((a, b) => a - b),
                    })
                  }
                  setSelectedVerses={(vs) => set({ verses: vs })}
                  keymap={KEYS}
                  projectVerseOnEnter={(v) => {
                    set({ verses: [v] });
                    if (primary != null && currentBook && chapter != null)
                      showTarget({
                        kind: 'verses',
                        passage: {
                          translationIds: ids,
                          bookNumber: currentBook.bookNumber,
                          chapter,
                          verses: [v],
                        },
                      });
                  }}
                  appearance={DEFAULT_APPEARANCE}
                  libraryGap={null}
                  openAppSettings={noop}
                  versesLoading={!!verseVerses?.isLoading}
                  currentBook={currentBook}
                  chapter={chapter}
                  concordanceStrong={null}
                  primaryId={primary}
                  jumpTo={noop}
                  setConcordanceStrong={noop}
                />
              </div>
            </>
          ) : (
            <ScrollArea h="100%" scrollbars="y">
              {song.data ? (
                <Stack gap={2} p="md">
                  <Text size="sm" fw={600} mb={6}>
                    {`№${song.data.number ?? ''} ${song.data.title}`.trim()}
                  </Text>
                  {song.data.slides.map((s, i) => (
                    <div
                      key={i}
                      className="vo-verse-item vo-stanza-row"
                      role="button"
                      tabIndex={0}
                      data-selected={i === stanza ? 'true' : undefined}
                      onClick={() => set({ stanza: i })}
                      onDoubleClick={() =>
                        showTarget({ kind: 'song', song: { songId: song.data.id, stanza: i } })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          set({ stanza: i });
                          showTarget({ kind: 'song', song: { songId: song.data.id, stanza: i } });
                        } else if (e.key === ' ') {
                          e.preventDefault();
                          set({ stanza: i });
                        }
                      }}
                    >
                      <span className="vo-verse-num">{i + 1}</span>
                      <span style={{ whiteSpace: 'pre-line' }}>{s.text}</span>
                    </div>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed" p="md">
                  {tr('Виберіть пісню ліворуч.')}
                </Text>
              )}
            </ScrollArea>
          )}
        </main>

        <aside className="vo-desk-col vo-desk-aside" aria-label={tr('Монітори')}>
          <DeskAside
            live={live}
            next={next}
            mine={mine}
            preview={preview}
            previewHint={
              verseList
                ? tr('Виберіть вірші — Enter чи «На екран» покаже їх.')
                : tr('Виберіть строфу — Enter чи «На екран» покаже її.')
            }
            onQueue={
              target && mayPress(allowed, 'queue', carries)
                ? () => press('queue', targetArgs(target))
                : undefined
            }
            playlist={playlist}
            canShowItem={mayPress(allowed, 'show', 'item')}
            onShowItem={(entry: PlaylistEntry) =>
              mayPress(allowed, 'show', 'item') ? press('show', { item: entry.id }) : refused()
            }
          />
        </aside>
      </div>
    </div>
  );
}

/** A link that no longer works (revoked, a new code issued, a bad one): what to do now. */
function Denied({ reason }: { reason: string }) {
  useLang();
  return (
    <Center mih="100vh" p="md">
      <Paper withBorder radius="md" p="lg" maw={480} w="100%">
        <Stack gap="sm">
          <Title order={4} fw={600}>
            {tr('Цей пульт не працює')}
          </Title>
          <Text size="sm">
            {reason
              ? tr(reason)
              : tr('У посиланні немає коду пульта. Відкрийте посилання, яке дав оператор.')}
          </Text>
          <Text size="sm">
            <Anchor href="/">{tr('Вставити нове посилання')}</Anchor>
          </Text>
        </Stack>
      </Paper>
    </Center>
  );
}
