import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from '@tabler/icons-react';
import { nextChorus, songParts, type SongPart } from '@vo/shared';
import { api, type SongStyle } from '../api';
import type { SlideSource } from '../presenterBus';
import { PRIORITY, useCommandHandler, type Outcome } from '../lib/commands';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { SongImport } from './SongImport';
import { SongBundles } from './SongBundles';
import { tr, useLang } from '../i18n';
import { formatCombo, matchesCombo, stepDirection } from '../hotkeys';
import { isFormField, isResizeKey, isTextEntry } from '../lib/keyScroll';
import { useSettings } from '../settingsStore';
import { SONG_KEYS } from '../lib/songKeys';

interface Props {
  open: boolean;
  /**
   * «Пісні» as a mode (1.8.12-beta.7): the search, the bundles and the list go to the left column
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
  onPastEnd?: (dir: 1 | -1, songId: number) => Outcome | null;
}

/** A slide's label in the list (1.3.0): «Заголовок», «Куплет 2», «Приспів», «Приспів 2 · 1/2». */
function partLabel(p: SongPart): string {
  if (p.kind === 'title') return tr('Заголовок');
  if (p.kind === 'verse') return tr('Куплет {n}', { n: p.verse });
  // a label that says more («Приспів (до 5-го куплету)») is the file's words — data
  const base = p.name ?? (p.variant ? tr('Приспів {n}', { n: p.variant }) : tr('Приспів'));
  return p.parts ? `${base} · ${p.part}/${p.parts}` : base;
}

/**
 * Songs panel: search by number or title, open a song, and project its
 * stanzas (one .pptx slide each) as text slides on the output window. The mode «Пісні»
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
  /** the import view (0.10.1) instead of the search */
  const [importing, setImporting] = useState(false);
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
  const listQuery = useQuery({
    queryKey: ['songs', debounced, inBundle],
    queryFn: () => api.songs(debounced, inBundle || undefined),
    enabled: open,
  });
  const songQuery = useQuery({
    queryKey: ['song', songId],
    queryFn: () => api.song(songId!),
    enabled: open && songId != null,
  });
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
    (idx: number) => {
      const s = songQuery.data;
      if (!s) return;
      onActiveStanzaChange(idx);
      onProjectStanza(
        s.slides[idx].text,
        `№${s.number ?? ''} ${s.title}`.trim(),
        faithful ? s.slides[idx].style : null,
        { kind: 'song', songId: s.id, stanza: idx, total: s.slides.length },
        s.slides[idx].style,
      );
    },
    [songQuery.data, faithful, onActiveStanzaChange, onProjectStanza],
  );

  // «До приспіву» (1.3.0): the next chorus of the open song — a different one where the song
  // has its own chorus after a verse; past the last chorus, the one before.
  const toChorus = useCallback((): Outcome => {
    if (!songQuery.data) return { ok: false, reason: tr('Пісня ще завантажується') };
    if (!parts.some((p) => p.kind === 'chorus')) {
      return { ok: false, reason: tr('У цій пісні немає приспіву') };
    }
    const idx = nextChorus(parts, activeStanza);
    if (idx === null) return { ok: false, reason: tr('Далі в пісні приспіву немає') };
    showStanza(idx);
    return { ok: true };
  }, [songQuery.data, parts, activeStanza, showStanza]);

  // Step to the next/previous stanza and project it.
  const stepStanza = useCallback(
    (dir: number): Outcome => {
      const s = songQuery.data;
      if (!s || s.slides.length === 0) return { ok: false, reason: tr('Пісня ще завантажується') };
      const count = s.slides.length;
      const cur = activeStanza ?? -1;
      // past the last stanza: an empty slide once, then the song is over (0.6.24);
      // «Назад» from there projects the last stanza again (the clamp below)
      // «Далі» past «Кінець», «Назад» at the first stanza: the running order's item, when the
      // switch is on (1.10.0-beta.1)
      const past = (d: 1 | -1) => (onPastEnd && s ? onPastEnd(d, s.id) : null);
      if (dir > 0 && activeStanza != null && cur >= count - 1) {
        if (cur >= count) return past(1) ?? { ok: false, reason: tr('Кінець пісні') };
        if (!onSongEnd) return { ok: false, reason: tr('Це остання строфа') };
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
        return { ok: false, reason: dir > 0 ? tr('Це остання строфа') : tr('Це перша строфа') };
      }
      showStanza(idx);
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
      const say = (o: Outcome) => {
        if (!o.ok && o.reason) {
          notifications.show({ message: o.reason, color: 'gray', autoClose: 2000 });
        }
      };
      // «До приспіву» (1.3.0) — not while typing
      const keymap = useSettings.getState().keymap;
      const { chorus } = keymap;
      if (chorus && matchesCombo(e, chorus) && !isFormField(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        say(toChorus());
        return;
      }
      if (!songQuery.data || songQuery.data.slides.length === 0) return;
      // the song search stays in sight beside the song (1.8.12-beta.7): its caret keeps its arrows
      if (isTextEntry(e.target)) return;
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
      say(stepStanza(dir));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, songId, stepStanza, toChorus, songQuery.data, keysPaused]);

  // Show commands from outside the keyboard — an output window's clicker keys and speaker
  // remotes (lib/commands.ts): while a song is open it owns next/prev, ahead of the verse
  // navigation, so a song advances instead of being clobbered by it.
  useCommandHandler(
    (cmd) => (cmd === 'next' ? stepStanza(1) : cmd === 'prev' ? stepStanza(-1) : null),
    PRIORITY.song,
    open && songId != null,
  );

  if (!open) return null;
  const songs = listQuery.data ?? [];
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

  // the left column: the search, the bundles, the list (a portal into the navbar's slot)
  const list = (
    <Box p="xs" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Group gap="xs" wrap="nowrap">
        <TextInput
          ref={inputRef}
          flex={1}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={tr('Пісня: номер або назва')}
          leftSection={<IconMusic size={18} />}
          rightSection={listQuery.isFetching ? <Loader size="xs" /> : null}
        />
        {several && (
          <Select
            w={120}
            aria-label={tr('Бандл пісень')}
            data={[
              { value: '', label: tr('Усі бандли') },
              ...bundles.map((b) => ({ value: b.name, label: `${b.name} (${b.count})` })),
            ]}
            value={inBundle}
            onChange={(v) => setBundle(v ?? '')}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
        )}
        <Tooltip
          label={serverAvailable === false ? tr(NEEDS_SERVER) : tr('Імпорт пісень з файлів .pptx')}
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
            aria-label={tr('Імпорт пісень')}
          >
            <IconFileImport size={18} />
          </ActionIcon>
        </Tooltip>
        {serverAvailable !== false && (
          <Tooltip label={tr('Бандли пісень: перейменувати, видалити')}>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => setManaging(true)}
              aria-label={tr('Бандли пісень')}
            >
              <IconStack2 size={18} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
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
          {songs.map((s) => (
            <Box
              key={s.id}
              className="vo-list-item"
              role="button"
              tabIndex={0}
              data-selected={s.id === songId ? 'true' : undefined}
              onClick={() => onSongIdChange(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSongIdChange(s.id);
                }
              }}
            >
              {several && !inBundle && s.bundle && (
                <Badge size="xs" variant="light" color="gray" mr={4}>
                  {s.bundle}
                </Badge>
              )}
              {s.number != null && (
                <Badge size="xs" variant="light" mr={6}>
                  {s.number}
                </Badge>
              )}
              {s.title}
            </Box>
          ))}
          {debounced && songs.length === 0 && !listQuery.isFetching && (
            <Text size="sm" c="dimmed" p="sm">
              {tr('Нічого не знайдено')}
            </Text>
          )}
          {!debounced && songs.length === 0 && listQuery.isSuccess && !inBundle && (
            <Text size="sm" c="dimmed" p="sm">
              {tr(
                'Пісень ще немає. Щоб додати їх з файлів .pptx, натисніть «Імпорт пісень» праворуч від пошуку.',
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
        ) : managing ? (
          <SongBundles
            onBack={() => setManaging(false)}
            onClose={() => setManaging(false)}
            onChanged={() => {
              setBundle('');
              setImported(null); // the undo of an import doesn't reach across a rename / delete
            }}
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
                    onClick={() => project(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        project(i);
                      }
                    }}
                  >
                    <span className="vo-verse-num">
                      {parts[i] ? partLabel(parts[i]) : tr('Куплет {n}', { n: i })}
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
            {tr('Виберіть пісню ліворуч — знайдіть її за номером чи назвою.')}
          </Text>
        )}
      </div>
    </>
  );
}
