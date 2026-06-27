import { useEffect, useRef, useState } from 'react';
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
import { IconMusic, IconX, IconChevronLeft } from '@tabler/icons-react';
import { api, type SongStyle } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Project a stanza; `style` (when in faithful mode) reproduces the original pptx look. */
  onProjectStanza: (text: string, reference: string, style?: SongStyle | null) => void;
}

/**
 * Songs panel: search by number or title, open a song, and project its
 * stanzas (one .pptx slide each) as text slides on the output window.
 */
export function SongsPanel({ open, onClose, onProjectStanza }: Props) {
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 200);
  const [songId, setSongId] = useState<number | null>(null);
  const [activeStanza, setActiveStanza] = useState<number | null>(null);
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

  // While a song is open, arrows / PageUp-PageDown step through its stanzas and
  // project them. Capture phase + stopPropagation so the verse-navigation hotkeys
  // don't also fire.
  useEffect(() => {
    if (!open || songId == null) return;
    const onKey = (e: KeyboardEvent) => {
      const dir = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)
        ? 1
        : ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)
          ? -1
          : 0;
      if (!dir) return;
      const s = songQuery.data;
      if (!s || s.slides.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const cur = activeStanza ?? -1;
      const idx = Math.max(0, Math.min(s.slides.length - 1, cur + dir));
      if (activeStanza != null && idx === cur) return;
      setActiveStanza(idx);
      onProjectStanza(
        s.slides[idx].text,
        `№${s.number ?? ''} ${s.title}`.trim(),
        faithful ? s.slides[idx].style : null,
      );
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, songId, activeStanza, faithful, songQuery.data, onProjectStanza]);

  if (!open) return null;
  const songs = listQuery.data ?? [];
  const song = songQuery.data;

  const project = (idx: number, slide: { text: string; style: SongStyle | null }) => {
    setActiveStanza(idx);
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
                onClick={() => {
                  setSongId(null);
                  setActiveStanza(null);
                }}
                aria-label="Назад до пошуку"
              >
                <IconChevronLeft size={18} />
              </ActionIcon>
              <Text fw={600} size="sm" truncate>
                {song.number != null ? `№${song.number} ` : ''}
                {song.title}
              </Text>
            </Group>
            <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Закрити">
              <IconX size={18} />
            </ActionIcon>
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
                  onClick={() => {
                    setSongId(s.id);
                    setActiveStanza(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSongId(s.id);
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
