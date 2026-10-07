import { memo, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  IconLibraryPhoto,
  IconAlbum,
  IconMovie,
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
import { api } from '../api';
import { type SeqItem, type SavedProgram } from '../playlistStore';
import { useServer } from '../serverStore';
import { useSettings } from '../settingsStore';
import { formatCombo } from '../hotkeys';
import { tr, trn, useLang } from '../i18n';

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
  /** The program that replaced a non-empty list, while «Скасувати» can still undo it. */
  replacedBy: string | null;
  onUndoLoad: () => void;
}

const KIND_ICON = {
  passage: IconBook,
  song: IconMusic,
  text: IconLetterT,
  image: IconLibraryPhoto,
  album: IconAlbum,
  video: IconMovie,
} as const;

// Kinds are told apart by their icon; colour stays reserved for live/cue state.
const KIND_COLOR = {
  passage: 'gray',
  song: 'gray',
  text: 'gray',
  image: 'gray',
  album: 'gray',
  video: 'gray',
} as const;

/**
 * The running order: an ordered list of passages / songs / free texts. Click a row
 * to project it; drag the grip (or use ↑↓) to reorder; step with Prev/Next. Programs
 * can be saved and reloaded week to week. Since 1.8.12-beta.6 (F1005-06) it stands under the
 * monitors («Показ» in ShowList): the buttons stay, the list scrolls, the next item says «Далі».
 */
export const PlaylistPanel = memo(function PlaylistPanel({
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
  replacedBy,
  onUndoLoad,
}: Props) {
  useLang();
  const serverAvailable = useServer((s) => s.available);
  // a picture deleted in «Зображення» (1.7.2): its item says so — once the list is known
  const pictures = useQuery({
    queryKey: ['images'],
    queryFn: api.images,
    enabled: serverAvailable !== false && items.some((it) => it.kind === 'image'),
  });
  const known = pictures.data ? new Set(pictures.data.map((p) => p.id)) : null;
  // an album (1.8.12) taken off the list, or its folder not there now: the item says which
  const albums = useQuery({
    queryKey: ['albums'],
    queryFn: api.albums,
    enabled: serverAvailable !== false && items.some((it) => it.kind === 'album'),
    // a drive plugged back in: the mark goes the next time the panel looks
    staleTime: 0,
  });
  // a video (1.8.12-beta.3) taken off the list, or its file not there now
  const videoList = useQuery({
    queryKey: ['videos'],
    queryFn: api.videos,
    enabled: serverAvailable !== false && items.some((it) => it.kind === 'video'),
    staleTime: 0,
  });
  const gone = (it: SeqItem): string | null => {
    if (it.kind === 'image' && !!known && !known.has(it.imageId))
      return tr('Зображення видалено: {name}', { name: it.label });
    if (it.kind === 'video') {
      if (!videoList.data) return null;
      const v = videoList.data.find((x) => x.id === it.videoId);
      if (!v) return tr('Відео прибрано: {name}', { name: it.label });
      return v.missing ? tr('Файл не знайдено: {name}', { name: it.label }) : null;
    }
    if (it.kind !== 'album' || !albums.data) return null;
    const album = albums.data.find((a) => a.id === it.albumId);
    if (!album) return tr('Альбом прибрано: {name}', { name: it.label });
    return album.missing ? tr('Папку не знайдено: {name}', { name: it.label }) : null;
  };
  const [programsOpen, setProgramsOpen] = useState(false);
  const [name, setName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const undoDeleteRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const keymap = useSettings((s) => s.keymap);
  // what «Далі» brings: the item after the current one, the first while none is
  const at = items.findIndex((it) => it.id === currentId);
  const nextId = at >= 0 ? (items[at + 1]?.id ?? null) : (items[0]?.id ?? null);
  // the current item in sight as the show goes on (a long list scrolls under the monitors)
  useEffect(() => {
    if (!currentId) return;
    const row = listRef.current?.querySelector(`[data-item="${CSS.escape(currentId)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);

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
        aria-label={tr('Видалити програму {name}', { name: p.name })}
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
          {tr('Видалено: {name}', { name: deletedProgram.name })}
        </Text>
        <Button
          ref={undoDeleteRef}
          size="compact-xs"
          variant="light"
          leftSection={<IconArrowBackUp size={14} />}
          onClick={onUndoDelete}
          style={{ flexShrink: 0 }}
        >
          {tr('Скасувати')}
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
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack gap="xs" p="xs" pb={0}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap={4} wrap="nowrap">
            <Tooltip
              label={tr('Попередній елемент · {keys}', { keys: formatCombo(keymap.playlistPrev) })}
            >
              <ActionIcon
                variant="default"
                onClick={onPrev}
                disabled={items.length === 0}
                aria-label={tr('Попередній елемент показу')}
              >
                <IconPlayerTrackPrev size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip
              label={tr('Наступний елемент · {keys}', { keys: formatCombo(keymap.playlistNext) })}
            >
              <Button
                variant="light"
                color="cue"
                size="xs"
                leftSection={<IconPlayerTrackNext size={16} />}
                onClick={onNext}
                disabled={items.length === 0}
              >
                {tr('Далі')}
              </Button>
            </Tooltip>
          </Group>
          <Group gap={6} wrap="nowrap">
            <Tooltip label={tr('Програми (зберегти / відкрити)')}>
              <ActionIcon
                variant={programsOpen ? 'filled' : 'subtle'}
                color="brand"
                onClick={() => setProgramsOpen((o) => !o)}
                aria-label={tr('Програми')}
              >
                {programsOpen ? <IconFolderOpen size={16} /> : <IconFolder size={16} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label={tr('Очистити показ')}>
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={clear}
                disabled={items.length === 0}
                aria-label={tr('Очистити показ')}
              >
                <IconClearAll size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Divider />
      </Stack>
      <ScrollArea style={{ flex: 1 }} scrollbars="y" className="vo-scroll-rows">
        <Box p="xs" ref={listRef}>
          {/* the programs and «Відкрито: …» scroll with the list: in a short panel (below the
              centre, 160 px) the fixed part stays one row of buttons (review, 1.8.12-beta.6) */}
          <Stack gap="xs" mb={programsOpen || replacedBy ? 'xs' : 0}>
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
                    placeholder={tr('Назва програми')}
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
                    {tr('Зберегти')}
                  </Button>
                </Group>
                {programRows.length > 0 && (
                  <ScrollArea.Autosize mah={160} scrollbars="y" className="vo-scroll-fit">
                    <Stack gap={2}>{programRows}</Stack>
                  </ScrollArea.Autosize>
                )}
              </Box>
            </Collapse>

            {replacedBy && (
              // the list above is the program just opened; the one it replaced can come back (0.9.3)
              <Group gap={4} wrap="nowrap" pl={8}>
                <Text
                  size="sm"
                  c="dimmed"
                  truncate
                  title={replacedBy}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {tr('Відкрито: {name}', { name: replacedBy })}
                </Text>
                <Tooltip label={tr('Повернути список, який був до цієї програми')}>
                  <Button
                    size="compact-xs"
                    variant="light"
                    leftSection={<IconArrowBackUp size={14} />}
                    onClick={onUndoLoad}
                    style={{ flexShrink: 0 }}
                  >
                    {tr('Скасувати')}
                  </Button>
                </Tooltip>
              </Group>
            )}
          </Stack>
          {items.length === 0 && cleared > 0 ? (
            <Stack gap="xs" align="center" py="md">
              <Text size="sm" c="dimmed" ta="center">
                {trn(
                  cleared,
                  'Показ очищено: {n} елемент.|Показ очищено: {n} елементи.|Показ очищено: {n} елементів.',
                )}
              </Text>
              <Button
                ref={undoRef}
                size="xs"
                variant="light"
                leftSection={<IconArrowBackUp size={14} />}
                onClick={onUndoClear}
              >
                {tr('Скасувати')}
              </Button>
            </Stack>
          ) : items.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="lg">
              {tr('Порожньо. Додавайте уривки, пісні й текст кнопкою «+ у показ».')}
            </Text>
          ) : (
            <Stack gap={4}>
              {items.map((it, i) => {
                const Icon = KIND_ICON[it.kind];
                const active = it.id === currentId;
                return (
                  <Box
                    key={it.id}
                    data-item={it.id}
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
                      title={tr('Перетягнути')}
                      style={{
                        display: 'flex',
                        cursor: 'grab',
                        color: 'var(--mantine-color-dimmed)',
                      }}
                      aria-hidden
                    >
                      <IconGripVertical size={14} />
                    </span>
                    <ThemeIcon size="sm" variant="light" color={KIND_COLOR[it.kind]}>
                      <Icon size={14} />
                    </ThemeIcon>
                    <Text
                      size="sm"
                      c={gone(it) ? 'dimmed' : undefined}
                      style={{ flex: 1, minWidth: 0 }}
                      truncate
                    >
                      {gone(it) ?? it.label}
                    </Text>
                    {it.id === nextId && (
                      <Badge size="xs" variant="light" color="cue" style={{ flexShrink: 0 }}>
                        {tr('Далі')}
                      </Badge>
                    )}
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
                        aria-label={tr('Вгору')}
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
                        aria-label={tr('Вниз')}
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
                        aria-label={tr('Прибрати')}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>
      </ScrollArea>
    </Box>
  );
});
