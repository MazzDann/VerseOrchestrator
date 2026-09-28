import { useEffect, useRef, useState } from 'react';
import {
  Paper,
  TextInput,
  Textarea,
  ScrollArea,
  Stack,
  Text,
  Box,
  Group,
  Button,
  ActionIcon,
} from '@mantine/core';
import { IconLetterT, IconX, IconDeviceTv, IconTrash, IconPlaylistAdd } from '@tabler/icons-react';
import { useSettings, type TextItem } from '../settingsStore';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Project a free-text slide: `title` becomes the reference line, `body` the quote. */
  onProject: (title: string, body: string) => void;
  /** Add the composed text to the presentation sequence. */
  onAddToPlaylist?: (item: { title: string; body: string }) => void;
}

/**
 * Free-text slide composer — announcements, notes, any custom text. Reuses the
 * active slide style/template; keeps a recents list so repeat texts are one click.
 */
export function TextPanel({ open, onClose, onProject, onAddToPlaylist }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const recentTexts = useSettings((s) => s.recentTexts);
  const removeRecentText = useSettings((s) => s.removeRecentText);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => bodyRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  const project = () => {
    if (!body.trim()) return;
    onProject(title, body);
  };

  const loadRecent = (t: TextItem) => {
    setTitle(t.title);
    setBody(t.body);
  };

  return (
    <Paper withBorder shadow="sm" p="sm" m="sm">
      <Group justify="space-between" wrap="nowrap" mb="xs">
        <Group gap={6} wrap="nowrap">
          <IconLetterT size={18} />
          <Text fw={600} size="sm">
            Текст на екран
          </Text>
        </Group>
        <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Закрити">
          <IconX size={18} />
        </ActionIcon>
      </Group>
      <Stack gap="xs">
        <TextInput
          size="sm"
          placeholder="Заголовок (необов’язково)"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />
        <Textarea
          ref={bodyRef}
          autosize
          minRows={3}
          maxRows={8}
          placeholder="Текст слайда — оголошення, примітка, довільний текст…"
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter projects without reaching for the mouse. It stops here: ⌘↩ is
            // also «На екран» on a Mac, and that document hotkey would put the verse
            // selection over this text.
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              project();
            }
          }}
        />
        <Group justify="flex-end" gap="xs">
          {onAddToPlaylist && (
            <Button
              size="sm"
              variant="default"
              leftSection={<IconPlaylistAdd size={16} />}
              disabled={!body.trim()}
              onClick={() => onAddToPlaylist({ title, body })}
            >
              У показ
            </Button>
          )}
          <Button
            size="sm"
            color="live"
            leftSection={<IconDeviceTv size={16} />}
            disabled={!body.trim()}
            onClick={project}
          >
            На екран
          </Button>
        </Group>
      </Stack>
      {recentTexts.length > 0 && (
        <>
          <Text size="10px" c="dimmed" fw={600} tt="uppercase" mt="sm" mb={4}>
            Нещодавні
          </Text>
          <ScrollArea.Autosize mah="min(200px, 20vh)">
            <Stack gap={4}>
              {recentTexts.map((t) => (
                <Box
                  key={`${t.title}\n${t.body}`}
                  className="vo-verse-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => loadRecent(t)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      loadRecent(t);
                    }
                  }}
                  style={{ position: 'relative' }}
                >
                  {t.title && (
                    <Text size="xs" fw={600} truncate>
                      {t.title}
                    </Text>
                  )}
                  <Text size="sm" c="dimmed" lineClamp={2} style={{ whiteSpace: 'pre-line' }}>
                    {t.body}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    style={{ position: 'absolute', top: 4, right: 4 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecentText(t);
                    }}
                    aria-label="Прибрати зі списку"
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Box>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </>
      )}
    </Paper>
  );
}
