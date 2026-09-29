import { useRef, useState } from 'react';
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
  IconArrowBackUp,
} from '@tabler/icons-react';
import { type SeqItem, type SavedProgram } from '../playlistStore';
import { plural } from '../lib/plural';

interface Props {
  items: SeqItem[];
  currentId: string | null;
  saved: SavedProgram[];
  onActivate: (item: SeqItem) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onReorder: (from: number, to: number) => void;
  onClear: () => void;
  /** How many items «Скасувати» would bring back after «Очистити показ» (0 = nothing). */
  cleared: number;
  onUndoClear: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onDelete: (name: string) => void;
  /** The program «Скасувати» would put back, and its place in the list (null = nothing). */
  deletedProgram: { name: string; index: number } | null;
  onUndoDelete: () => void;
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
  cleared,
  onUndoClear,
  onNext,
  onPrev,
  onSave,
  onLoad,
  onDelete,
  deletedProgram,
  onUndoDelete,
}: Props) {
  const [programsOpen, setProgramsOpen] = useState(false);
  const [name, setName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const undoDeleteRef = useRef<HTMLButtonElement>(null);

  // «Очистити показ» goes disabled under the pointer and takes the focus with it: hand the
  // focus to «Скасувати», so Enter or Space right away brings the list back.
  const clear = () => {
    onClear();
    requestAnimationFrame(() => undoRef.current?.focus());
  };
  // the same for a program: its row, trash icon and all, is gone (0.9.1)
  const remove = (program: string) => {
    onDelete(program);
    requestAnimationFrame(() => undoDeleteRef.current?.focus());
  };

  const programRows = saved.map((p) => (
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
        onClick={() => remove(p.name)}
        aria-label={`Видалити програму ${p.name}`}
      >
        <IconTrash size={14} />
      </ActionIcon>
    </Group>
  ));
  // the deleted program's place holds «Скасувати» until the list changes again
  if (deletedProgram) {
    programRows.splice(
      Math.min(deletedProgram.index, programRows.length),
      0,
      <Group key={`deleted:${deletedProgram.name}`} gap={4} wrap="nowrap" pl={8}>
        <Text
          size="sm"
          c="dimmed"
          truncate
          title={deletedProgram.name}
          style={{ flex: 1, minWidth: 0 }}
        >
          Видалено: {deletedProgram.name}
        </Text>
        <Button
          ref={undoDeleteRef}
          size="compact-xs"
          variant="light"
          leftSection={<IconArrowBackUp size={14} />}
          onClick={onUndoDelete}
          style={{ flexShrink: 0 }}
        >
          Скасувати
        </Button>
      </Group>,
    );
  }

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
              onClick={clear}
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
          <Group gap="xs" wrap="nowrap" mb={programRows.length ? 'xs' : 0}>
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
          {programRows.length > 0 && (
            <ScrollArea.Autosize mah={160} scrollbars="y" className="vo-scroll-fit">
              <Stack gap={2}>{programRows}</Stack>
            </ScrollArea.Autosize>
          )}
        </Box>
      </Collapse>

      <Divider my={2} />

      {items.length === 0 && cleared > 0 ? (
        <Stack gap="xs" align="center" py="md">
          <Text size="sm" c="dimmed" ta="center">
            Показ очищено: {cleared} {plural(cleared, ['елемент', 'елементи', 'елементів'])}.
          </Text>
          <Button
            ref={undoRef}
            size="xs"
            variant="light"
            leftSection={<IconArrowBackUp size={14} />}
            onClick={onUndoClear}
          >
            Скасувати
          </Button>
        </Stack>
      ) : items.length === 0 ? (
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
