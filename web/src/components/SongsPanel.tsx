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
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { IconMusic, IconX, IconChevronLeft, IconPlaylistAdd } from '@tabler/icons-react';
import { api, type SongStyle } from '../api';
import { subscribeCommand } from '../presenterBus';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Project a stanza; `style` (when in faithful mode) reproduces the original pptx look. */
  onProjectStanza: (text: string, reference: string, style?: SongStyle | null) => void;
  /** Open song (controlled by the parent so the playlist can open a specific song). */
  songId: number | null;
  onSongIdChange: (id: number | null) => void;
  /** Highlighted stanza (controlled by the parent so playlist activation can seed it). */
  activeStanza: number | null;
  onActiveStanzaChange: (idx: number | null) => void;
  /** Add the open song to the presentation sequence. */
  onAddToPlaylist?: (song: { songId: number; label: string; faithful: boolean }) => void;
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
}: Props) {
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 200);
  const [faithful, setFaithful] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const listQuery = useQuery({
    queryKey: ['songs', debounced],
    queryFn: () => api.songs(debounced),
    enabled: open,
  });
  const songQuery = useQuery({
    queryKey: ['song', songId],
    queryFn: () => api.song(songId!),
    enabled: open && songId != null,
  });

  useEffect(() => {
    if (open && songId == null) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, songId]);

  // Step to the next/previous stanza and project it.
  const stepStanza = useCallback(
    (dir: number) => {
      const s = songQuery.data;
      if (!s || s.slides.length === 0) return;
      const cur = activeStanza ?? -1;
      const idx = Math.max(0, Math.min(s.slides.length - 1, cur + dir));
      if (activeStanza != null && idx === cur) return;
      onActiveStanzaChange(idx);
      onProjectStanza(
        s.slides[idx].text,
        `№${s.number ?? ''} ${s.title}`.trim(),
        faithful ? s.slides[idx].style : null,
      );
    },
    [songQuery.data, activeStanza, faithful, onActiveStanzaChange, onProjectStanza],
  );

  // While a song is open, arrows / PageUp-PageDown step through its stanzas.
  // Capture phase + stopPropagation so the verse-navigation hotkeys don't also fire.
  useEffect(() => {
    if (!open || songId == null) return;
    const onKey = (e: KeyboardEvent) => {
      const dir = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)
        ? 1
        : ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)
          ? -1
          : 0;
      if (!dir || !songQuery.data || songQuery.data.slides.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      stepStanza(dir);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, songId, stepStanza, songQuery.data]);

  // The clicker can also arrive as a forwarded command from the presenter window
  // (which holds focus on the 2nd monitor). Step stanzas for those too, so a song
  // advances instead of being clobbered by verse navigation.
  useEffect(() => {
    if (!open || songId == null) return;
    return subscribeCommand((cmd) => {
      if (cmd === 'next') stepStanza(1);
      else if (cmd === 'prev') stepStanza(-1);
    });
  }, [open, songId, stepStanza]);

  if (!open) return null;
  const songs = listQuery.data ?? [];
  const song = songQuery.data;

  const project = (idx: number, slide: { text: string; style: SongStyle | null }) => {
    onActiveStanzaChange(idx);
    onProjectStanza(
      slide.text,
      song ? `№${song.number ?? ''} ${song.title}`.trim() : '',
      faithful ? slide.style : null,
    );
  };

  return (
    <Paper withBorder shadow="sm" p="sm" m="sm">
      {song ? (
        <>
          <Group justify="space-between" wrap="nowrap" mb="xs">
            <Group gap={6} wrap="nowrap">
              <ActionIcon
                variant="subtle"
                onClick={() => onSongIdChange(null)}
                aria-label="Назад до пошуку"
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
                      faithful,
                    })
                  }
                  aria-label="Додати у показ"
                  title="Додати у показ"
                >
                  <IconPlaylistAdd size={18} />
                </ActionIcon>
              )}
              <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Закрити">
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
              { label: 'Точний показ', value: 'faithful' },
              { label: 'Простий текст', value: 'text' },
            ]}
          />
          <ScrollArea.Autosize mah={340}>
            <Stack gap={4}>
              {song.slides.map((s, i) => (
                <Box
                  key={i}
                  className="vo-verse-item"
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
                  <Text size="10px" c="dimmed" fw={600} tt="uppercase">
                    {i === 0 ? 'Заголовок' : `Куплет ${i}`}
                  </Text>
                  <Text size="sm" style={{ whiteSpace: 'pre-line' }} lineClamp={5}>
                    {s.text}
                  </Text>
                </Box>
              ))}
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
              placeholder="Пісня: номер або назва"
              leftSection={<IconMusic size={18} />}
              rightSection={listQuery.isFetching ? <Loader size="xs" /> : null}
            />
            <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Закрити">
              <IconX size={18} />
            </ActionIcon>
          </Group>
          <ScrollArea.Autosize mah={320} mt="xs">
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
                  Нічого не знайдено
                </Text>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </>
      )}
    </Paper>
  );
}
