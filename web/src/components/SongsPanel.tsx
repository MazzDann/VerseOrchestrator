import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  TextInput,
  ScrollArea,
  Stack,
  Text,
  Box,
  Group,
  ActionIcon,
  Loader,
  Badge,
  SegmentedControl,
  Select,
  TagsInput,
  Tooltip,
  Button,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconMusic,
  IconPlaylistAdd,
  IconFileImport,
  IconRepeat,
  IconStack2,
  IconArrowBackUp,
  IconChevronDown,
  IconChevronRight,
  IconLanguage,
  IconTag,
} from '@tabler/icons-react';
import {
  MEANING_PREFIX,
  nextChorus,
  songParts,
  withoutChordLines,
  type SongPart,
} from '@vo/shared';
import { api, type SongStyle } from '../api';
import type { SlideSource } from '../presenterBus';
import { PRIORITY, useCommandHandler, type Outcome } from '../lib/commands';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { SongImport } from './SongImport';
import { SongBundles } from './SongBundles';
import { SongTopics } from './SongTopics';
import { tr, useLang } from '../i18n';
import { formatCombo, matchesCombo, stepDirection } from '../hotkeys';
import { inOverlay, isFormField, isResizeKey, isTextEntry } from '../lib/keyScroll';
import { noticeOnce } from '../lib/noticeOnce';
import { useSettings } from '../settingsStore';
import { SONG_KEYS } from '../lib/songKeys';
import { useDrop } from '../lib/drop';
import { byMeaning } from '../lib/quickRef';
import { Closeness } from './SearchPanel';
import type { SongMeaning } from '../api';

/** A row of the list: a song found by meaning also says how close it is and its nearest slide. */
type SongRow =
  | SongMeaning['results'][number]
  | (Awaited<ReturnType<typeof api.songs>>[number] & {
      closeness?: undefined;
      stanza?: undefined;
      line?: undefined;
    });

interface Props {
  open: boolean;
  /**
   * «Презентації» as a mode (1.8.12-beta.7): the search, the bundles and the list go to the left column
   * (this element, the navbar's slot), the open song fills the centre.
   */
  listSlot: HTMLElement | null;
  /**
   * Project a stanza; `style` (when in faithful mode) reproduces the original pptx look;
   * `look` is the stanza's own style either way (its second part, 1.3.0).
   */
  onProjectStanza: (
    text: string,
    reference: string,
    style: SongStyle | null,
    source: SlideSource,
    look: SongStyle | null,
    /** a step («Далі / Назад», the arrows, a clicker), not a click on a stanza (F1114-18) */
    step?: boolean,
  ) => void;
  /** Open song (controlled by the parent so the playlist can open a specific song). */
  songId: number | null;
  onSongIdChange: (id: number | null) => void;
  /** Highlighted stanza (controlled by the parent so playlist activation can seed it). */
  activeStanza: number | null;
  onActiveStanzaChange: (idx: number | null) => void;
  /** Add the open song to the presentation sequence. */
  onAddToPlaylist?: (song: {
    songId: number;
    label: string;
    bundle: string;
    faithful: boolean;
  }) => void;
  /** Suspend the stanza arrow-key listener (e.g. while the command palette is open). */
  keysPaused?: boolean;
  /**
   * «Далі» after the last stanza (0.6.24): the parent empties the screen — the text goes,
   * the background stays. Without it the last stanza is where the song ends.
   */
  onSongEnd?: () => Outcome;
  /** past «Кінець» or before the first stanza: the running order's next / previous item, or null */
  onPastEnd?: (dir: 1 | -1, songId: number, held?: boolean) => Outcome | null;
}

/** A slide's label in the list (1.3.0): «Заголовок», «Куплет 2», «Приспів», «Приспів 2 · 1/2»; a presentation
 * with no chorus counts «Слайд 2» (1.19.0-beta.5: neutral names — not every presentation is a song) */
function partLabel(p: SongPart, song: boolean): string {
  if (p.kind === 'title') return tr('Заголовок');
  if (p.kind === 'verse')
    return song ? tr('Куплет {n}', { n: p.verse }) : tr('Слайд {n}', { n: p.verse });
  // a label that says more («Приспів (до 5-го куплету)») is the file's words — data
  const base = p.name ?? (p.variant ? tr('Приспів {n}', { n: p.variant }) : tr('Приспів'));
  return p.parts ? `${base} · ${p.part}/${p.parts}` : base;
}

/**
 * Songs panel: search by number or title, open a song, and project its
 * stanzas (one .pptx slide each) as text slides on the output window. The mode «Презентації»
 * (1.8.12-beta.7): the list on the left, the song in the centre at full height.
 */
export function SongsPanel({
  open,
  listSlot,
  onProjectStanza,
  songId,
  onSongIdChange,
  activeStanza,
  onActiveStanzaChange,
  onAddToPlaylist,
  keysPaused,
  onSongEnd,
  onPastEnd,
}: Props) {
  useLang();
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 200);
  const [faithful, setFaithful] = useState(true);
  /** '' = every bundle (0.10.0) */
  const [bundle, setBundle] = useState('');
  /**
   * The list in groups (1.25.0-beta.3, the author: «розбивало за категоріями в пачки які можуть буть
   * розгорнуті»): by bundle or by topic, each group folded until opened — when nothing is typed.
   */
  const [grouping, setGrouping] = useState<Grouping>(readGrouping);
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());
  /** the song whose topics field was opened by «Додати тему» (1.25.0-beta.5) */
  const [topicsFor, setTopicsFor] = useState<number | null>(null);
  /** «Теми набору» open for this bundle (1.25.0-beta.2), instead of the bundles' list */
  const [topicsOf, setTopicsOf] = useState<{ id: string; name: string } | null>(null);
  /** the import view (0.10.1) instead of the search */
  const [importing, setImporting] = useState(false);
  /** presentations dropped anywhere on the window (1.17.1): the import opens with them */
  const [dropped, setDropped] = useState<File[] | undefined>(undefined);
  const droppedSongs = useDrop((s) => s.songs.length);
  useEffect(() => {
    if (!open || droppedSongs === 0) return;
    setDropped(useDrop.getState().takeSongs());
    setManaging(false);
    setImporting(true);
  }, [open, droppedSongs]);
  // the import closed: the next one opens empty
  useEffect(() => {
    if (!importing) setDropped(undefined);
  }, [importing]);
  /** «Бандли пісень» (1.4.0): rename / delete bundles, instead of the search */
  const [managing, setManaging] = useState(false);
  /** the last import, with its «Скасувати» (1.4.0), until the panel closes */
  const [imported, setImported] = useState<{
    bundle: string;
    added: number;
    updated: number;
  } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const serverAvailable = useServer((s) => s.available);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const bundlesQuery = useQuery({
    queryKey: ['song-bundles'],
    queryFn: api.songBundles,
    enabled: open,
  });
  const bundles = [...(bundlesQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  // with one bundle its name says nothing: no filter, no name on the rows
  const several = bundles.length > 1;
  const inBundle = several && bundles.some((b) => b.name === bundle) ? bundle : '';
  // «~ спасіння» (1.25.0-beta.1): the songs by meaning, the nearest first
  const meaning = MEANING_PREFIX.test(debounced) && !!debounced.replace(MEANING_PREFIX, '').trim();
  // the topics the songs of this bundle (or all) hold (1.25.0-beta.2): the filter under the search
  const topicsQuery = useQuery({
    queryKey: ['song-topics', inBundle],
    queryFn: () => api.songTopics(inBundle || undefined),
    enabled: open,
  });
  const topicList = topicsQuery.data ?? [];
  // the groups there can be: bundles when there are several (and none chosen), topics when any
  const groupings: Grouping[] = [
    'none',
    ...(several && !inBundle ? (['bundles'] as const) : []),
    ...(topicList.length ? (['topics'] as const) : []),
  ];
  // the field typed into: a plain list at once, not after the debounce (Enter must find a song)
  const groupedBy: Grouping = !query.trim() && groupings.includes(grouping) ? grouping : 'none';
  const listQuery = useQuery({
    queryKey: ['songs', debounced, inBundle],
    queryFn: () => api.songs(debounced, inBundle || undefined),
    enabled: open && !meaning && groupedBy === 'none',
  });
  const meaningQuery = useQuery({
    queryKey: ['songs-meaning', debounced, inBundle],
    queryFn: () => api.songsByMeaning(debounced, inBundle || undefined),
    enabled: open && meaning,
    // still being computed: look again as more songs get their vectors
    refetchInterval: (q) => (q.state.data?.pending ? 5000 : false),
  });
  /** the slide that matched «~ …» in the song opened from it: marked and brought into sight */
  const [hint, setHint] = useState<{ songId: number; stanza: number } | null>(null);
  const songQuery = useQuery({
    queryKey: ['song', songId],
    queryFn: () => api.song(songId!),
    enabled: open && songId != null,
  });
  useEffect(() => {
    if (!hint || songQuery.data?.id !== hint.songId) return;
    const t = setTimeout(
      () =>
        document.querySelector('.vo-stanza-row[data-hint]')?.scrollIntoView({ block: 'center' }),
      50,
    );
    return () => clearTimeout(t);
  }, [hint, songQuery.data?.id]);
  // title, verses, choruses (1.3.0): the labels and «До приспіву»
  const parts = useMemo(
    () => (songQuery.data ? songParts(songQuery.data.slides.map((sl) => sl.text)) : []),
    [songQuery.data],
  );
  const hasChorus = parts.some((p) => p.kind === 'chorus');
  const chorusKey = useSettings((st) => st.keymap.chorus);

  useEffect(() => {
    if (open && songId == null && !importing) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, songId, importing]);
  // «Презентації» chosen: the keyboard goes to their search, even with one open (F1107-10) — the
  // last query selected, so typing starts a new one
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => clearTimeout(t);
  }, [open]);
  // a closed panel opens on the search again
  useEffect(() => {
    if (!open) {
      setImporting(false);
      setManaging(false);
      setImported(null);
    }
  }, [open]);

  // Put stanza `idx` of the open song on screen.
  const showStanza = useCallback(
    (idx: number, step = false) => {
      const s = songQuery.data;
      if (!s) return;
      onActiveStanzaChange(idx);
      // chord-only lines stay in this list, not on the screen (1.25.0-beta.5)
      const sl = s.slides[idx];
      const clean = withoutChordLines(sl.text, sl.style?.second?.text);
      const look =
        sl.style?.second && clean.second !== undefined
          ? { ...sl.style, second: { ...sl.style.second, text: clean.second } }
          : sl.style;
      onProjectStanza(
        clean.text,
        `№${s.number ?? ''} ${s.title}`.trim(),
        faithful ? look : null,
        { kind: 'song', songId: s.id, stanza: idx, total: s.slides.length },
        look,
        step,
      );
    },
    [songQuery.data, faithful, onActiveStanzaChange, onProjectStanza],
  );

  // Enter on a found song (F1017-01): it opens and its first stanza goes on screen — once it has
  // loaded, when it wasn't open yet
  const showOnLoad = useRef<{ id: number; stanza: number } | null>(null);
  /** a plain open (a click, Space) drops a show still waiting for another song (review) */
  const openOnly = (id: number) => {
    showOnLoad.current = null;
    onSongIdChange(id);
  };
  const openAndShow = (id: number) => {
    if (songQuery.data?.id === id) {
      showOnLoad.current = null;
      showStanza(0);
      return;
    }
    showOnLoad.current = { id, stanza: 0 };
    onSongIdChange(id);
  };
  /**
   * «Іншою мовою» (1.25.0-beta.4): the same song in the paired bundle — and, when one of this song's
   * slides is on, the same slide of it (the stanzas go alike in both).
   */
  const openOther = (id: number) => {
    const at = activeStanza;
    const len = songQuery.data?.slides.length ?? 0;
    if (at != null && at < len) {
      showOnLoad.current = { id, stanza: at };
      onSongIdChange(id);
    } else openOnly(id);
  };
  useEffect(() => {
    const s = songQuery.data;
    const want = showOnLoad.current;
    if (!s || want?.id !== s.id) return;
    showOnLoad.current = null;
    if (s.slides.length > 0) showStanza(Math.min(want.stanza, s.slides.length - 1));
  }, [songQuery.data, showStanza]);

  // «До приспіву» (1.3.0): the next chorus of the open song — a different one where the song
  // has its own chorus after a verse; past the last chorus, the one before.
  const toChorus = useCallback((): Outcome => {
    if (!songQuery.data) return { ok: false, reason: tr('Презентація ще завантажується') };
    if (!parts.some((p) => p.kind === 'chorus')) {
      return { ok: false, reason: tr('У цій презентації немає приспіву') };
    }
    const idx = nextChorus(parts, activeStanza);
    if (idx === null) return { ok: false, reason: tr('Далі в презентації приспіву немає') };
    showStanza(idx);
    return { ok: true };
  }, [songQuery.data, parts, activeStanza, showStanza]);

  // Step to the next/previous stanza and project it.
  const stepStanza = useCallback(
    /** `held`: a key held down (its repeats) stops at the last stanza — «Кінець» and the next item
     * take a new press (1.10.6, the Mac's round) */
    (dir: number, held = false): Outcome => {
      const s = songQuery.data;
      if (!s || s.slides.length === 0)
        return { ok: false, reason: tr('Презентація ще завантажується') };
      const count = s.slides.length;
      const cur = activeStanza ?? -1;
      // past the last stanza: an empty slide once, then the song is over (0.6.24);
      // «Назад» from there projects the last stanza again (the clamp below)
      // «Далі» past «Кінець», «Назад» at the first stanza: the running order's item, when the
      // switch is on (1.10.0-beta.1)
      const past = (d: 1 | -1) => (onPastEnd && s ? onPastEnd(d, s.id, held) : null);
      if (dir > 0 && activeStanza != null && cur >= count - 1) {
        if (cur >= count) return past(1) ?? { ok: false, reason: tr('Кінець презентації') };
        if (!onSongEnd || held) return { ok: false, reason: tr('Це останній слайд') };
        const done = onSongEnd();
        if (done.ok) onActiveStanzaChange(count);
        return done;
      }
      const idx = Math.max(0, Math.min(count - 1, cur + dir));
      if (activeStanza != null && idx === cur) {
        if (dir < 0) {
          const o = past(-1);
          if (o) return o;
        }
        return { ok: false, reason: dir > 0 ? tr('Це останній слайд') : tr('Це перший слайд') };
      }
      showStanza(idx, true);
      return { ok: true };
    },
    [songQuery.data, activeStanza, onActiveStanzaChange, onSongEnd, onPastEnd, showStanza],
  );

  // While a song is open, arrows / PageUp-PageDown step through its stanzas.
  // Capture phase + stopPropagation so the verse-navigation hotkeys don't also fire.
  useEffect(() => {
    if (!open || songId == null || keysPaused) return;
    const onKey = (e: KeyboardEvent) => {
      // a focused resize handle's own arrows resize it, not the song (1.4.6)
      if (isResizeKey(e)) return;
      // nor the keys of an open menu, list or editor (1.10.5)
      if (inOverlay(e.target)) return;
      // one notice for the song's edge, however long the key is held (1.10.6)
      const say = (o: Outcome) => {
        if (!o.ok && o.reason) noticeOnce('song-edge', o.reason, 2000);
      };
      // «До приспіву» (1.3.0) — not while typing; a held C goes once, not chorus after chorus (1.10.6)
      const keymap = useSettings.getState().keymap;
      const { chorus } = keymap;
      if (chorus && matchesCombo(e, chorus) && !isFormField(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) say(toChorus());
        return;
      }
      if (!songQuery.data || songQuery.data.slides.length === 0) return;
      // the song search stays in sight beside the song (1.8.12-beta.7): its caret keeps ← → — but
      // ↑ ↓ and PageUp / PageDown (what a clicker sends) step the song from there too (F1114-05:
      // «після відкриття презентації, і ентера неможливо стрілками клацати»)
      if (isTextEntry(e.target)) {
        const vertical = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key);
        if (e.target !== inputRef.current || !vertical) return;
      }
      // the arrows and «Далі / Назад», but not the running order's keys (1.8.12-beta.6)
      const dir = stepDirection(e, keymap);
      if (!dir) {
        // the verses' preview-only step (1.1.0) does nothing while a song owns the keys — not
        // the stanza, not the verses behind it; Alt+↑/↓ scroll, the rest is the browser's
        if (
          (e.ctrlKey || e.altKey || e.metaKey) &&
          (matchesCombo(e, keymap.previewNext) || matchesCombo(e, keymap.previewPrev))
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      // the song's own end says so («Кінець пісні») — like the verses' edges (0.6.23)
      say(stepStanza(dir, e.repeat));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, songId, stepStanza, toChorus, songQuery.data, keysPaused]);

  // Show commands from outside the keyboard — an output window's clicker keys and speaker
  // remotes (lib/commands.ts): while a song is open it owns next/prev, ahead of the verse
  // navigation, so a song advances instead of being clobbered by it.
  useCommandHandler(
    (cmd, _source, args) =>
      cmd === 'next' ? stepStanza(1, args.held) : cmd === 'prev' ? stepStanza(-1, args.held) : null,
    PRIORITY.song,
    open && songId != null,
  );

  if (!open) return null;
  const found = meaning ? meaningQuery.data : undefined;
  const songs: SongRow[] = meaning ? (found?.results ?? []) : (listQuery.data ?? []);
  const fetching = meaning ? meaningQuery.isFetching : listQuery.isFetching;
  const song = songQuery.data;

  const project = (idx: number) => showStanza(idx);
  // the «Кінець» row: the empty slide after the last stanza, by click as well (0.6.24)
  const endSong = () => {
    if (!song || !onSongEnd) return;
    const done = onSongEnd();
    if (done.ok) onActiveStanzaChange(song.slides.length);
    else if (done.reason) {
      notifications.show({ message: done.reason, color: 'gray', autoClose: 2000 });
    }
  };

  /** One song of the list: its number and title first, its bundle quiet at the end (1.25.0-beta.3) */
  const row = (s: SongRow) => (
    <Box
      key={s.id}
      className="vo-list-item"
      role="button"
      tabIndex={0}
      data-selected={s.id === songId ? 'true' : undefined}
      onClick={() => {
        openOnly(s.id);
        setHint(s.stanza !== undefined ? { songId: s.id, stanza: s.stanza } : null);
      }}
      onKeyDown={(e) => {
        // Enter: open it and show its first stanza (F1017-01); Space: only open it
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          openAndShow(s.id);
          setHint(s.stanza !== undefined ? { songId: s.id, stanza: s.stanza } : null);
        } else if (e.key === ' ') {
          e.preventDefault();
          openOnly(s.id);
          setHint(s.stanza !== undefined ? { songId: s.id, stanza: s.stanza } : null);
        }
      }}
    >
      <Group gap={6} wrap="nowrap" justify="space-between">
        <Text size="sm" truncate style={{ minWidth: 0 }}>
          {s.number != null && (
            <Badge size="xs" variant="light" mr={6}>
              {s.number}
            </Badge>
          )}
          {s.title}
          {s.closeness !== undefined && (
            <>
              {' '}
              <Closeness level={s.closeness as 1 | 2 | 3} />
            </>
          )}
        </Text>
        {several && !inBundle && s.bundle && (
          <Text size="xs" c="dimmed" truncate maw="40%" style={{ flexShrink: 0 }}>
            {s.bundle}
          </Text>
        )}
      </Group>
      {s.line && (
        <Text size="xs" c="dimmed" lineClamp={1}>
          {s.line}
        </Text>
      )}
    </Box>
  );

  // the left column: the search, the bundles, the list (a portal into the navbar's slot)
  const list = (
    <Box p="xs" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* the search on a row of its own (1.25.0-beta.5): beside the bundle filter it was a few letters wide */}
      <TextInput
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        // Enter: the song found first (or the one chosen in the list) on screen (F1017-01)
        onKeyDown={(e) => {
          // Shift+Enter: the same words by meaning (1.25.0-beta.1, as in the verses' search)
          const byWords = byMeaning(e, query);
          if (byWords) {
            e.preventDefault();
            e.stopPropagation();
            setQuery(byWords);
            return;
          }
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
          // grouped (nothing typed): the open song, the groups hold the rest (review)
          const pick =
            songs.find((x) => x.id === songId) ??
            songs[0] ??
            (songId != null ? { id: songId, stanza: undefined } : undefined);
          if (!pick) return;
          e.preventDefault();
          e.stopPropagation();
          openAndShow(pick.id);
          setHint(pick.stanza !== undefined ? { songId: pick.id, stanza: pick.stanza } : null);
          // shown: the keyboard leaves the field, so ← → step it too (F1114-05)
          e.currentTarget.blur();
        }}
        placeholder={tr('Презентація: номер, назва або ~ тема')}
        leftSection={<IconMusic size={18} />}
        rightSection={fetching ? <Loader size="xs" /> : null}
      />
      <Group gap="xs" wrap="nowrap" mt="xs" justify={several ? undefined : 'flex-end'}>
        {several && (
          <Select
            size="xs"
            flex={1}
            aria-label={tr('Набір презентацій')}
            data={[
              { value: '', label: tr('Усі набори') },
              ...bundles.map((b) => ({ value: b.name, label: `${b.name} (${b.count})` })),
            ]}
            value={inBundle}
            onChange={(v) => setBundle(v ?? '')}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
        )}
        <Tooltip
          label={serverAvailable === false ? tr(NEEDS_SERVER) : tr('Імпорт презентацій з файлів')}
          multiline={serverAvailable === false}
          w={serverAvailable === false ? 280 : undefined}
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            // data-disabled, not disabled: a disabled button shows no tooltip saying why
            data-disabled={serverAvailable === false || undefined}
            aria-disabled={serverAvailable === false || undefined}
            onClick={() => serverAvailable !== false && setImporting(true)}
            aria-label={tr('Імпорт презентацій')}
          >
            <IconFileImport size={18} />
          </ActionIcon>
        </Tooltip>
        {serverAvailable !== false && (
          <Tooltip label={tr('Набори презентацій: перейменувати, видалити')}>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => setManaging(true)}
              aria-label={tr('Набори презентацій')}
            >
              <IconStack2 size={18} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      {groupings.length > 1 && !query.trim() && (
        <SegmentedControl
          size="xs"
          mt="xs"
          fullWidth
          aria-label={tr('Групувати')}
          value={groupedBy}
          onChange={(v) => {
            setGrouping(v as Grouping);
            keepGrouping(v as Grouping);
          }}
          data={groupings.map((g) => ({
            value: g,
            label: g === 'none' ? tr('Без груп') : g === 'bundles' ? tr('Набори') : tr('Теми'),
          }))}
        />
      )}
      {imported && (
        <Group justify="space-between" wrap="nowrap" gap="xs" mt="xs" className="vo-import-done">
          <Text size="xs" style={{ minWidth: 0 }}>
            {tr('Імпортовано в «{bundle}»: нових {added}, оновлено {updated}', imported)}
          </Text>
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconArrowBackUp size={14} />}
            loading={undoing}
            onClick={async () => {
              setUndoing(true);
              try {
                await api.undoSongImport();
                for (const key of SONG_KEYS) {
                  void queryClient.invalidateQueries({ queryKey: [key] });
                }
                setBundle('');
                notifications.show({
                  message: tr('Імпорт скасовано'),
                  color: 'green',
                  autoClose: 1500,
                });
              } catch (e) {
                notifications.show({ message: tr((e as Error).message), color: 'red' });
              } finally {
                setUndoing(false);
                setImported(null);
              }
            }}
          >
            {tr('Скасувати')}
          </Button>
        </Group>
      )}
      <ScrollArea style={{ flex: 1 }} mt="xs" scrollbars="y" className="vo-scroll-rows">
        <Stack gap={0}>
          {groupedBy !== 'none' &&
            (groupedBy === 'bundles'
              ? bundles.map(
                  (b): GroupOf => ({
                    key: `b:${b.name}`,
                    name: b.name,
                    count: b.count,
                    bundle: b.name,
                  }),
                )
              : topicList.map(
                  (t): GroupOf => ({
                    key: `t:${t.name}`,
                    name: t.name,
                    count: t.count,
                    bundle: inBundle,
                    topic: t.name,
                  }),
                )
            ).map((g) => (
              <SongGroup
                key={g.key}
                name={g.name}
                count={g.count}
                open={unfolded.has(g.key)}
                onToggle={() =>
                  setUnfolded((u) => {
                    const next = new Set(u);
                    if (!next.delete(g.key)) next.add(g.key);
                    return next;
                  })
                }
                bundle={g.bundle || undefined}
                topic={g.topic}
                row={row}
              />
            ))}
          {groupedBy === 'none' && songs.map((s) => row(s))}
          {/* the songs' vectors still being made (1.25.0-beta.1): what is found is not all yet */}
          {meaning && found?.pending && (
            <Text size="xs" c="dimmed" p="sm">
              {tr('Ще обчислюється ({done} з {total}) — знайдено не все', found.pending)}
            </Text>
          )}
          {debounced && songs.length === 0 && !fetching && (
            <Text size="sm" c="dimmed" p="sm">
              {found?.missing === 'model'
                ? tr(
                    'Пошук за змістом ще не налаштовано: виберіть і завантажте модель у «Налаштування вигляду → Дані → Пошук за змістом».',
                  )
                : found?.missing === 'vectors'
                  ? tr(
                      'Презентації ще не мають векторів: вони обчислюються самі, щойно модель завантажено.',
                    )
                  : found?.missing === 'server'
                    ? tr(NEEDS_SERVER)
                    : tr('Нічого не знайдено')}
            </Text>
          )}
          {!debounced && songs.length === 0 && listQuery.isSuccess && !inBundle && (
            <Text size="sm" c="dimmed" p="sm">
              {tr(
                'Презентацій ще немає. Щоб додати їх з файлів, натисніть «Імпорт презентацій» під пошуком.',
              )}
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </Box>
  );
  return (
    <>
      {listSlot && createPortal(list, listSlot)}
      <div className="vo-workspace">
        {importing ? (
          <SongImport
            initialFiles={dropped}
            preferred={inBundle}
            onBack={() => setImporting(false)}
            onClose={() => setImporting(false)}
            onDone={(name, counts) => {
              setImporting(false);
              setQuery('');
              setBundle(name);
              setImported({ bundle: name, ...counts });
            }}
          />
        ) : managing && topicsOf ? (
          <SongTopics
            key={topicsOf.id}
            bundle={topicsOf}
            onBack={() => setTopicsOf(null)}
            onClose={() => {
              setTopicsOf(null);
              setManaging(false);
            }}
          />
        ) : managing ? (
          <SongBundles
            onBack={() => setManaging(false)}
            onClose={() => setManaging(false)}
            onChanged={() => {
              setBundle('');
              setImported(null); // the undo of an import doesn't reach across a rename / delete
            }}
            onTopics={setTopicsOf}
          />
        ) : song ? (
          <>
            <Group justify="space-between" wrap="nowrap" mb="xs">
              <Group gap={6} wrap="nowrap">
                <Text fw={600} size="sm" truncate>
                  {song.number != null ? `№${song.number} ` : ''}
                  {song.title}
                </Text>
              </Group>
              <Group gap={4} wrap="nowrap">
                {serverAvailable !== false && song.topics.length === 0 && (
                  <Tooltip label={tr('Додати тему')} withArrow>
                    <ActionIcon
                      variant={topicsFor === song.id ? 'light' : 'subtle'}
                      color="gray"
                      onClick={() => setTopicsFor((t) => (t === song.id ? null : song.id))}
                      aria-label={tr('Додати тему')}
                      aria-pressed={topicsFor === song.id}
                    >
                      <IconTag size={18} />
                    </ActionIcon>
                  </Tooltip>
                )}
                {song.other && (
                  <Tooltip
                    label={tr('Іншою мовою: №{number} {title} · {bundle}', {
                      number: String(song.other.number ?? ''),
                      title: song.other.title,
                      bundle: song.other.bundle,
                    })}
                    withArrow
                  >
                    <Button
                      size="compact-xs"
                      variant="light"
                      color="gray"
                      leftSection={<IconLanguage size={14} />}
                      onClick={() => openOther(song.other!.id)}
                      aria-label={tr('Іншою мовою: {bundle}', { bundle: song.other.bundle })}
                      data-song-other
                    >
                      {song.other.bundle}
                    </Button>
                  </Tooltip>
                )}
                {hasChorus && (
                  <Tooltip
                    label={`${tr('До приспіву')}${chorusKey ? ` · ${formatCombo(chorusKey)}` : ''}`}
                    withArrow
                  >
                    <ActionIcon
                      variant="subtle"
                      onClick={() => {
                        const o = toChorus();
                        if (!o.ok && o.reason) {
                          notifications.show({ message: o.reason, color: 'gray', autoClose: 2000 });
                        }
                      }}
                      aria-label={tr('До приспіву')}
                    >
                      <IconRepeat size={18} />
                    </ActionIcon>
                  </Tooltip>
                )}
                {onAddToPlaylist && (
                  <ActionIcon
                    variant="subtle"
                    color="brand"
                    onClick={() =>
                      onAddToPlaylist({
                        songId: song.id,
                        label:
                          `${song.number != null ? `№${song.number} ` : ''}${song.title}`.trim(),
                        bundle: song.bundle,
                        faithful,
                      })
                    }
                    aria-label={tr('Додати у показ')}
                    title={tr('Додати у показ')}
                  >
                    <IconPlaylistAdd size={18} />
                  </ActionIcon>
                )}
              </Group>
            </Group>
            {/* the topics only when it has some or one is being added (1.25.0-beta.5: an empty row
                above every song, for operators who never use topics) */}
            {serverAvailable !== false && (song.topics.length > 0 || topicsFor === song.id) && (
              <SongTopicsInput songId={song.id} topics={song.topics} bundle={song.bundle} />
            )}
            <SegmentedControl
              fullWidth
              size="xs"
              mb="xs"
              value={faithful ? 'faithful' : 'text'}
              onChange={(v) => setFaithful(v === 'faithful')}
              data={[
                { label: tr('Точний показ'), value: 'faithful' },
                { label: tr('Простий текст'), value: 'text' },
              ]}
            />
            <ScrollArea style={{ flex: 1 }} scrollbars="y" className="vo-scroll-rows">
              <Stack gap={4}>
                {song.slides.map((s, i) => (
                  <Box
                    key={i}
                    className="vo-verse-item vo-stanza-row"
                    role="button"
                    tabIndex={0}
                    data-selected={activeStanza === i ? 'true' : undefined}
                    data-part={parts[i]?.kind}
                    data-hint={hint?.songId === song.id && hint.stanza === i ? 'true' : undefined}
                    onClick={() => project(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        project(i);
                      }
                    }}
                  >
                    <span className="vo-verse-num">
                      {parts[i] ? partLabel(parts[i], hasChorus) : tr('Слайд {n}', { n: i })}
                    </span>
                    <Text size="sm" style={{ whiteSpace: 'pre-line' }} lineClamp={5}>
                      {s.text}
                    </Text>
                  </Box>
                ))}
                {onSongEnd && (
                  <Box
                    className="vo-verse-item vo-stanza-row"
                    role="button"
                    tabIndex={0}
                    data-selected={activeStanza === song.slides.length ? 'true' : undefined}
                    onClick={endSong}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        endSong();
                      }
                    }}
                  >
                    <span className="vo-verse-num">{tr('Кінець')}</span>
                    <Text size="sm" c="dimmed">
                      {tr('Порожній слайд: текст сховано, фон лишається')}
                    </Text>
                  </Box>
                )}
              </Stack>
            </ScrollArea>
          </>
        ) : (
          <Text size="sm" c="dimmed" p="sm">
            {tr('Виберіть презентацію ліворуч — знайдіть її за номером чи назвою.')}
          </Text>
        )}
      </div>
    </>
  );
}

/**
 * An open song's topics (1.25.0-beta.2): chips to take one off, a field to add one — from its
 * bundle's list, or a new one, which joins the list. The model never changes what is set here.
 */
function SongTopicsInput({
  songId,
  topics,
  bundle,
}: {
  songId: number;
  topics: string[];
  bundle: string;
}) {
  useLang();
  const queryClient = useQueryClient();
  const known = useQuery({
    queryKey: ['song-topics', bundle],
    queryFn: () => api.songTopics(bundle || undefined),
  });
  const [value, setValue] = useState(topics);
  useEffect(() => setValue(topics), [topics]);
  const change = async (next: string[]) => {
    const before = value;
    setValue(next);
    try {
      await api.setSongTopics(songId, next);
      for (const key of SONG_KEYS) void queryClient.invalidateQueries({ queryKey: [key] });
    } catch (e) {
      setValue(before);
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    }
  };
  return (
    <TagsInput
      size="xs"
      mb="xs"
      aria-label={tr('Теми презентації')}
      placeholder={value.length ? undefined : tr('Теми: додайте або виберіть')}
      data={(known.data ?? []).map((t) => t.name)}
      value={value}
      onChange={(next) => void change(next)}
      maxTags={20}
      clearable={false}
      comboboxProps={{ withinPortal: true }}
    />
  );
}

type Grouping = 'none' | 'bundles' | 'topics';
/** A group of the songs list: a bundle, or a topic (of the bundle chosen, if one is). */
interface GroupOf {
  key: string;
  name: string;
  count: number;
  bundle: string;
  topic?: string;
}
const GROUPING_KEY = 'vo:songGrouping';
/** The grouping last chosen (this browser's convenience; none when storage is unavailable). */
function readGrouping(): Grouping {
  try {
    const v = localStorage.getItem(GROUPING_KEY);
    return v === 'bundles' || v === 'topics' ? v : 'none';
  } catch {
    return 'none';
  }
}
function keepGrouping(g: Grouping): void {
  try {
    localStorage.setItem(GROUPING_KEY, g);
  } catch {
    /* private window: the choice lasts this visit */
  }
}

/** A folded group of the songs list (1.25.0-beta.3): its songs asked for only when it opens. */
function SongGroup({
  name,
  count,
  open,
  onToggle,
  bundle,
  topic,
  row,
}: {
  name: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  bundle?: string;
  topic?: string;
  row: (s: SongRow) => ReactNode;
}) {
  useLang();
  const songs = useQuery({
    queryKey: ['songs', '', bundle ?? '', topic ?? ''],
    queryFn: () => api.songs('', bundle, topic),
    enabled: open,
  });
  return (
    <>
      <Box
        className="vo-list-item"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        data-song-group={name}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <Group gap={6} wrap="nowrap" justify="space-between">
          <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
            {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <Text size="sm" fw={500} truncate>
              {name}
            </Text>
          </Group>
          <Badge size="xs" variant="light" color="gray">
            {count}
          </Badge>
        </Group>
      </Box>
      {open && (
        <Box pl="md">
          {songs.isPending ? <Loader size="xs" m="xs" /> : (songs.data ?? []).map((s) => row(s))}
        </Box>
      )}
    </>
  );
}
