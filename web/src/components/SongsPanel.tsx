import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Paper,
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
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconMusic,
  IconX,
  IconChevronLeft,
  IconPlaylistAdd,
  IconFileImport,
} from '@tabler/icons-react';
import { api, type SongStyle } from '../api';
import type { SlideSource } from '../presenterBus';
import { PRIORITY, useCommandHandler, type Outcome } from '../lib/commands';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { SongImport } from './SongImport';
import { tr, useLang } from '../i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Project a stanza; `style` (when in faithful mode) reproduces the original pptx look. */
  onProjectStanza: (
    text: string,
    reference: string,
    style: SongStyle | null,
    source: SlideSource,
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
}

/**
 * Songs panel: search by number or title, open a song, and project its
 * stanzas (one .pptx slide each) as text slides on the output window.
 */
export function SongsPanel({
  open,
  onClose,
  onProjectStanza,
  songId,
  onSongIdChange,
  activeStanza,
  onActiveStanzaChange,
  onAddToPlaylist,
  keysPaused,
  onSongEnd,
}: Props) {
  useLang();
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 200);
  const [faithful, setFaithful] = useState(true);
  /** '' = every bundle (0.10.0) */
  const [bundle, setBundle] = useState('');
  /** the import view (0.10.1) instead of the search */
  const [importing, setImporting] = useState(false);
  const serverAvailable = useServer((s) => s.available);
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

  useEffect(() => {
    if (open && songId == null && !importing) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, songId, importing]);
  // a closed panel opens on the search again
  useEffect(() => {
    if (!open) setImporting(false);
  }, [open]);

  // Step to the next/previous stanza and project it.
  const stepStanza = useCallback(
    (dir: number): Outcome => {
      const s = songQuery.data;
      if (!s || s.slides.length === 0) return { ok: false, reason: tr('Пісня ще завантажується') };
      const count = s.slides.length;
      const cur = activeStanza ?? -1;
      // past the last stanza: an empty slide once, then the song is over (0.6.24);
      // «Назад» from there projects the last stanza again (the clamp below)
      if (dir > 0 && activeStanza != null && cur >= count - 1) {
        if (cur >= count) return { ok: false, reason: tr('Кінець пісні') };
        if (!onSongEnd) return { ok: false, reason: tr('Це остання строфа') };
        const done = onSongEnd();
        if (done.ok) onActiveStanzaChange(count);
        return done;
      }
      const idx = Math.max(0, Math.min(count - 1, cur + dir));
      if (activeStanza != null && idx === cur) {
        return { ok: false, reason: dir > 0 ? tr('Це остання строфа') : tr('Це перша строфа') };
      }
      onActiveStanzaChange(idx);
      onProjectStanza(
        s.slides[idx].text,
        `№${s.number ?? ''} ${s.title}`.trim(),
        faithful ? s.slides[idx].style : null,
        { kind: 'song', songId: s.id, stanza: idx },
      );
      return { ok: true };
    },
    [songQuery.data, activeStanza, faithful, onActiveStanzaChange, onProjectStanza, onSongEnd],
  );

  // While a song is open, arrows / PageUp-PageDown step through its stanzas.
  // Capture phase + stopPropagation so the verse-navigation hotkeys don't also fire.
  useEffect(() => {
    if (!open || songId == null || keysPaused) return;
    const onKey = (e: KeyboardEvent) => {
      const dir = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)
        ? 1
        : ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)
          ? -1
          : 0;
      if (!dir || !songQuery.data || songQuery.data.slides.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const o = stepStanza(dir);
      // the song's own end says so («Кінець пісні») — like the verses' edges (0.6.23)
      if (!o.ok && o.reason) {
        notifications.show({ message: o.reason, color: 'gray', autoClose: 2000 });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, songId, stepStanza, songQuery.data, keysPaused]);

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

  const project = (idx: number, slide: { text: string; style: SongStyle | null }) => {
    onActiveStanzaChange(idx);
    onProjectStanza(
      slide.text,
      song ? `№${song.number ?? ''} ${song.title}`.trim() : '',
      faithful ? slide.style : null,
      { kind: 'song', songId: song?.id ?? songId ?? 0, stanza: idx },
    );
  };
  // the «Кінець» row: the empty slide after the last stanza, by click as well (0.6.24)
  const endSong = () => {
    if (!song || !onSongEnd) return;
    const done = onSongEnd();
    if (done.ok) onActiveStanzaChange(song.slides.length);
    else if (done.reason) {
      notifications.show({ message: done.reason, color: 'gray', autoClose: 2000 });
    }
  };

  return (
    <Paper withBorder shadow="sm" p="sm" m="sm">
      {importing && !song ? (
        <SongImport
          preferred={inBundle}
          onBack={() => setImporting(false)}
          onClose={onClose}
          onDone={(name) => {
            setImporting(false);
            setQuery('');
            setBundle(name);
          }}
        />
      ) : song ? (
        <>
          <Group justify="space-between" wrap="nowrap" mb="xs">
            <Group gap={6} wrap="nowrap">
              <ActionIcon
                variant="subtle"
                onClick={() => onSongIdChange(null)}
                aria-label={tr('Назад до пошуку')}
              >
                <IconChevronLeft size={18} />
              </ActionIcon>
              <Text fw={600} size="sm" truncate>
                {song.number != null ? `№${song.number} ` : ''}
                {song.title}
              </Text>
            </Group>
            <Group gap={4} wrap="nowrap">
              {onAddToPlaylist && (
                <ActionIcon
                  variant="subtle"
                  color="brand"
                  onClick={() =>
                    onAddToPlaylist({
                      songId: song.id,
                      label: `${song.number != null ? `№${song.number} ` : ''}${song.title}`.trim(),
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
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={onClose}
                aria-label={tr('Закрити')}
              >
                <IconX size={18} />
              </ActionIcon>
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
          <ScrollArea.Autosize mah="min(340px, 30vh)">
            <Stack gap={4}>
              {song.slides.map((s, i) => (
                <Box
                  key={i}
                  className="vo-verse-item vo-stanza-row"
                  role="button"
                  tabIndex={0}
                  data-selected={activeStanza === i ? 'true' : undefined}
                  onClick={() => project(i, s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      project(i, s);
                    }
                  }}
                >
                  <span className="vo-verse-num">
                    {i === 0 ? tr('Заголовок') : tr('Куплет {n}', { n: i })}
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
          </ScrollArea.Autosize>
        </>
      ) : (
        <>
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
                w={140}
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
              label={
                serverAvailable === false ? tr(NEEDS_SERVER) : tr('Імпорт пісень з файлів .pptx')
              }
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
            <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label={tr('Закрити')}>
              <IconX size={18} />
            </ActionIcon>
          </Group>
          <ScrollArea.Autosize mah="min(320px, 30vh)" mt="xs">
            <Stack gap={0}>
              {songs.map((s) => (
                <Box
                  key={s.id}
                  className="vo-list-item"
                  role="button"
                  tabIndex={0}
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
          </ScrollArea.Autosize>
        </>
      )}
    </Paper>
  );
}
