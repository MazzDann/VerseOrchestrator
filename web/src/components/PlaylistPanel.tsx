import { useState } from 'react';
import {
  Stack,
  Group,
  Text,
  Button,
  ActionIcon,
  Tooltip,
  Box,
  Badge,
  ThemeIcon,
  Collapse,
  TextInput,
  Divider,
  ScrollArea,
} from '@mantine/core';
import {
  IconBook,
  IconMusic,
  IconLetterT,
  IconChevronUp,
  IconChevronDown,
  IconTrash,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconClearAll,
  IconGripVertical,
  IconDeviceFloppy,
  IconFolder,
  IconFolderOpen,
} from '@tabler/icons-react';
import { type SeqItem, type SavedProgram } from '../playlistStore';

interface Props {
  items: SeqItem[];
  currentId: string | null;
  saved: SavedProgram[];
  onActivate: (item: SeqItem) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onReorder: (from: number, to: number) => void;
  onClear: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onDelete: (name: string) => void;
}

const KIND_ICON = {
  passage: IconBook,
  song: IconMusic,
  text: IconLetterT,
} as const;

// Kinds are told apart by their icon; colour stays reserved for live/cue state.
const KIND_COLOR = { passage: 'gray', song: 'gray', text: 'gray' } as const;

/**
 * The running order: an ordered list of passages / songs / free texts. Click a row
 * to project it; drag the grip (or use ↑↓) to reorder; step with Prev/Next. Programs
 * can be saved and reloaded week to week. Rendered inside a `FloatingPanel`.
 */
export function PlaylistPanel({
  items,
  currentId,
  saved,
  onActivate,
  onRemove,
  onMove,
  onReorder,
  onClear,
  onNext,
  onPrev,
  onSave,
  onLoad,
  onDelete,
}: Props) {
  const [programsOpen, setProgramsOpen] = useState(false);
  const [name, setName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const save = () => {
    if (!name.trim() || items.length === 0) return;
    onSave(name);
    setName('');
  };

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <Stack gap="xs" p="sm">
      <Group justify="space-between" wrap="nowrap">
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Попередній елемент">
            <ActionIcon
              variant="default"
              onClick={onPrev}
              disabled={items.length === 0}
              aria-label="Попередній елемент показу"
            >
              <IconPlayerTrackPrev size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Наступний елемент">
            <Button
              variant="light"
              color="cue"
              size="xs"
              leftSection={<IconPlayerTrackNext size={16} />}
              onClick={onNext}
              disabled={items.length === 0}
            >
              Далі
            </Button>
          </Tooltip>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Badge variant="light" color="gray">
            {items.length}
          </Badge>
          <Tooltip label="Програми (зберегти / відкрити)">
            <ActionIcon
              variant={programsOpen ? 'filled' : 'subtle'}
              color="brand"
              onClick={() => setProgramsOpen((o) => !o)}
              aria-label="Програми"
            >
              {programsOpen ? <IconFolderOpen size={16} /> : <IconFolder size={16} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Очистити показ">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={onClear}
              disabled={items.length === 0}
              aria-label="Очистити показ"
            >
              <IconClearAll size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Collapse in={programsOpen}>
        <Box
          p="xs"
          style={{
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 8,
          }}
        >
          <Group gap="xs" wrap="nowrap" mb={saved.length ? 'xs' : 0}>
            <TextInput
              size="xs"
              flex={1}
              placeholder="Назва програми"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
              }}
            />
            <Button
              size="xs"
              variant="light"
              leftSection={<IconDeviceFloppy size={14} />}
              disabled={!name.trim() || items.length === 0}
              onClick={save}
            >
              Зберегти
            </Button>
          </Group>
          {saved.length > 0 && (
            <ScrollArea.Autosize mah={160}>
              <Stack gap={2}>
                {saved.map((p) => (
                  <Group key={p.name} gap={4} wrap="nowrap" justify="space-between">
                    <Button
                      variant="subtle"
                      color="gray"
                      size="compact-sm"
                      justify="flex-start"
                      leftSection={<IconFolderOpen size={14} />}
                      style={{ flex: 1, minWidth: 0 }}
                      styles={{ label: { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                      onClick={() => onLoad(p.name)}
                    >
                      {p.name}
                    </Button>
                    <Badge size="xs" variant="light" color="gray">
                      {p.items.length}
                    </Badge>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => onDelete(p.name)}
                      aria-label={`Видалити програму ${p.name}`}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Box>
      </Collapse>

      <Divider my={2} />

      {items.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          Порожньо. Додавайте уривки, пісні й текст кнопкою «+ у показ».
        </Text>
      ) : (
        <Stack gap={4}>
          {items.map((it, i) => {
            const Icon = KIND_ICON[it.kind];
            const active = it.id === currentId;
            return (
              <Box
                key={it.id}
                className="vo-verse-item"
                role="button"
                tabIndex={0}
                data-selected={active ? 'true' : undefined}
                onClick={() => onActivate(it)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onActivate(it);
                  }
                }}
                onDragOver={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setOverIndex(i);
                }}
                onDrop={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  // The indicator (borderTop) means "insert above row i"; since reorder()
                  // removes the source first, a downward move must target one slot lower.
                  const to = dragIndex < i ? i - 1 : i;
                  onReorder(dragIndex, to);
                  endDrag();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderTop:
                    overIndex === i && dragIndex !== null && dragIndex !== i
                      ? '2px solid var(--mantine-color-brand-filled)'
                      : '2px solid transparent',
                  opacity: dragIndex === i ? 0.4 : 1,
                }}
              >
                <span
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = 'move';
                    // Firefox won't start a drag session unless dataTransfer is set.
                    try {
                      e.dataTransfer.setData('text/plain', String(i));
                    } catch {
                      /* ignore */
                    }
                  }}
                  onDragEnd={endDrag}
                  onClick={(e) => e.stopPropagation()}
                  title="Перетягнути"
                  style={{ display: 'flex', cursor: 'grab', color: 'var(--mantine-color-dimmed)' }}
                  aria-hidden
                >
                  <IconGripVertical size={14} />
                </span>
                <ThemeIcon size="sm" variant="light" color={KIND_COLOR[it.kind]}>
                  <Icon size={14} />
                </ThemeIcon>
                <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
                  {it.label}
                </Text>
                <Group gap={0} wrap="nowrap">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(it.id, -1);
                    }}
                    aria-label="Вгору"
                  >
                    <IconChevronUp size={14} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    disabled={i === items.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(it.id, 1);
                    }}
                    aria-label="Вниз"
                  >
                    <IconChevronDown size={14} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(it.id);
                    }}
                    aria-label="Прибрати"
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </Box>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
