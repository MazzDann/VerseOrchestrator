import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconArrowBackUp,
  IconCheck,
  IconChevronLeft,
  IconPencil,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { api } from '../api';
import { sameBundleName } from '@vo/shared';
import { tr, useLang } from '../i18n';

/** What the library shows of songs after a bundle changed. */
const SONG_KEYS = ['songs', 'song', 'song-bundles', 'song-bundle-files'];

/**
 * «Бандли пісень» (1.4.0): rename a bundle (its songs keep their ids), or delete it — its row
 * then says «Видалено: NAME» with «Скасувати», as a deleted program does (0.9.1). A bundle a
 * .pptx folder feeds comes back at the next start while the folder holds its files: the
 * deleted row says so.
 */
export function SongBundles({
  onBack,
  onClose,
  onChanged,
}: {
  onBack: () => void;
  onClose: () => void;
  /** a bundle was renamed or deleted: the search's bundle filter may name it no more */
  onChanged: () => void;
}) {
  useLang();
  const queryClient = useQueryClient();
  const files = useQuery({ queryKey: ['song-bundle-files'], queryFn: api.songBundleFiles });
  const [editing, setEditing] = useState<{ id: string; name: string; error?: string } | null>(null);
  const [deleted, setDeleted] = useState<{
    trashed: string;
    name: string;
    source?: string;
    at: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const undoRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const bundles = [...(files.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'uk'));

  const refresh = () => {
    for (const key of SONG_KEYS) void queryClient.invalidateQueries({ queryKey: [key] });
    onChanged();
  };
  const fail = (e: unknown) =>
    notifications.show({ message: tr((e as Error).message), color: 'red' });

  // a name being edited has the focus, with the old one selected
  useEffect(() => {
    editRef.current?.focus();
    editRef.current?.select();
  }, [editing?.id]);
  // the deleted row's «Скасувати» takes the focus (the row and its trash icon are gone)
  useEffect(() => {
    if (deleted) undoRef.current?.focus();
  }, [deleted]);

  const save = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return setEditing({ ...editing, error: tr('Введіть назву') });
    if (bundles.some((b) => b.id !== editing.id && sameBundleName(b.name, name)))
      return setEditing({ ...editing, error: tr('Бандл із такою назвою вже є') });
    setBusy(true);
    try {
      await api.renameSongBundle(editing.id, name);
      setEditing(null);
      refresh();
    } catch (e) {
      setEditing({ ...editing, error: tr((e as Error).message) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, at: number) => {
    setBusy(true);
    try {
      const r = await api.deleteSongBundle(id);
      setDeleted({ ...r, at });
      setEditing(null);
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!deleted) return;
    setBusy(true);
    try {
      const r = await api.restoreSongBundle(deleted.trashed);
      setDeleted(null);
      refresh();
      notifications.show({
        message: tr('Бандл «{bundle}» повернуто', { bundle: r.name }),
        color: 'green',
        autoClose: 1500,
      });
    } catch (e) {
      setDeleted(null);
      // the list as it is now: e.g. a rescan in another window made the folder's bundle again
      refresh();
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const deletedRow = deleted && (
    <Box key="deleted" className="vo-list-item" style={{ cursor: 'default' }}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="sm" c="dimmed" truncate title={deleted.name} style={{ minWidth: 0 }}>
          {tr('Видалено: {name}', { name: deleted.name })}
        </Text>
        <Button
          ref={undoRef}
          size="compact-xs"
          variant="light"
          leftSection={<IconArrowBackUp size={14} />}
          loading={busy}
          onClick={() => void restore()}
        >
          {tr('Скасувати')}
        </Button>
      </Group>
      {deleted.source && (
        <Text size="xs" c="dimmed" mt={2}>
          {tr(
            'Цей бандл наповнює папка «{folder}»: поки там лежать файли .pptx, він з’явиться знову під час наступного запуску.',
            { folder: deleted.source },
          )}
        </Text>
      )}
    </Box>
  );

  const rows = bundles.map((b) =>
    editing?.id === b.id ? (
      <Box key={b.id} className="vo-list-item" style={{ cursor: 'default' }}>
        <Group gap={4} wrap="nowrap" align="flex-start">
          <TextInput
            size="xs"
            style={{ flex: 1, minWidth: 0 }}
            aria-label={tr('Нова назва бандла')}
            value={editing.name}
            error={editing.error}
            ref={editRef}
            onChange={(e) => setEditing({ id: b.id, name: e.currentTarget.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(null);
              }
            }}
          />
          <ActionIcon
            variant="light"
            size="md"
            loading={busy}
            onClick={() => void save()}
            aria-label={tr('Зберегти')}
          >
            <IconCheck size={16} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            onClick={() => setEditing(null)}
            aria-label={tr('Скасувати')}
          >
            <IconX size={16} />
          </ActionIcon>
        </Group>
      </Box>
    ) : (
      <Box key={b.id} className="vo-list-item" style={{ cursor: 'default' }}>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <Text size="sm" truncate title={b.name} style={{ minWidth: 0 }}>
              {b.name}
            </Text>
            <Badge size="xs" variant="light" color="gray">
              {b.count}
            </Badge>
          </Group>
          <Group gap={2} wrap="nowrap">
            <Tooltip label={tr('Перейменувати')} withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                disabled={busy}
                onClick={() => setEditing({ id: b.id, name: b.name })}
                aria-label={tr('Перейменувати бандл «{bundle}»', { bundle: b.name })}
              >
                <IconPencil size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={tr('Видалити бандл')} withArrow>
              <ActionIcon
                variant="subtle"
                color="red"
                disabled={busy}
                onClick={() => void remove(b.id, bundles.indexOf(b))}
                aria-label={tr('Видалити бандл «{bundle}»', { bundle: b.name })}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Box>
    ),
  );
  // the deleted row stands where the bundle stood
  if (deletedRow) rows.splice(Math.min(deleted!.at, rows.length), 0, deletedRow);

  return (
    <>
      <Group justify="space-between" wrap="nowrap" mb="xs">
        <Group gap={6} wrap="nowrap">
          <ActionIcon variant="subtle" onClick={onBack} aria-label={tr('Назад до пошуку')}>
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600} size="sm">
            {tr('Бандли пісень')}
          </Text>
        </Group>
        <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label={tr('Закрити')}>
          <IconX size={18} />
        </ActionIcon>
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        {tr(
          'Перейменування не змінює пісень: послідовності показу знаходять їх і далі. Видалений бандл можна повернути, доки відкритий цей список.',
        )}
      </Text>
      <Stack gap={0}>
        {rows}
        {files.isSuccess && bundles.length === 0 && !deleted && (
          <Text size="sm" c="dimmed" p="sm">
            {tr('Бандлів ще немає. Щоб додати пісні з файлів .pptx, відкрийте «Імпорт пісень».')}
          </Text>
        )}
      </Stack>
    </>
  );
}
