import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  ScrollArea,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconChevronLeft,
  IconDeviceFloppy,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { DEFAULT_TOPICS } from '@vo/shared';
import { api } from '../api';
import { tr, useLang } from '../i18n';
import { SONG_KEYS } from '../lib/songKeys';

/** A topic as edited here: `was` = its name when the list was read (a rename keeps its songs). */
interface Row {
  name: string;
  about: string;
  was?: string;
}

/**
 * «Теми набору» (1.25.0-beta.2, the author: «варіант із готовим списком, але якщо є модель то вона
 * може підказувати, або ж як світч щоб вона згенерувала і тоді виправити»): a bundle's list of
 * topics to edit, and «Розкласти» — the model puts the bundle's songs under them, or, with the
 * switch on, gathers them into groups it names itself, for the operator to correct.
 */
export function SongTopics({
  bundle,
  onBack,
  onClose,
}: {
  bundle: { id: string; name: string };
  onBack: () => void;
  onClose: () => void;
}) {
  useLang();
  const queryClient = useQueryClient();
  const topics = useQuery({
    queryKey: ['bundle-topics', bundle.id],
    queryFn: () => api.bundleTopics(bundle.id),
  });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [own, setOwn] = useState(false);
  const [busy, setBusy] = useState<'save' | 'sort' | null>(null);
  // the list as read, until the operator changes it
  useEffect(() => {
    if (topics.data && rows === null) setRows(topics.data.list.map((t) => ({ ...t, was: t.name })));
  }, [topics.data, rows]);
  const read = topics.data?.list;
  const dirty = useMemo(
    () =>
      !!rows &&
      !!read &&
      (rows.length !== read.length ||
        rows.some((r, i) => r.name.trim() !== read[i].name || r.about.trim() !== read[i].about)),
    [rows, read],
  );
  const names = (rows ?? []).map((r) => r.name.trim().toLocaleLowerCase());
  const twice = names.findIndex((n, i) => n && names.indexOf(n) !== i);
  const blank = (rows ?? []).some((r) => !r.name.trim());

  /** the list read again before the rows reset: a cached, older list must not refill them (review) */
  const refresh = async () => {
    await queryClient.refetchQueries({ queryKey: ['bundle-topics', bundle.id] });
    setRows(null);
    for (const key of SONG_KEYS)
      if (key !== 'bundle-topics') void queryClient.invalidateQueries({ queryKey: [key] });
  };
  const fail = (e: unknown) =>
    notifications.show({ message: tr((e as Error).message), color: 'red' });

  const save = async (): Promise<boolean> => {
    if (!rows) return false;
    setBusy('save');
    try {
      await api.saveBundleTopics(
        bundle.id,
        rows.map((r) => ({ name: r.name.trim(), about: r.about.trim(), was: r.was })),
      );
      await refresh(); // read again: the renames are names now
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const sort = async () => {
    // the list as the operator left it goes first; an empty one becomes the ready list
    const empty = !rows?.length;
    if (dirty && !(await save())) return;
    if (!own && empty) {
      const ready = DEFAULT_TOPICS.map((t) => ({ name: tr(t.name), about: tr(t.about) }));
      try {
        await api.saveBundleTopics(bundle.id, ready);
      } catch (e) {
        return fail(e);
      }
    }
    setBusy('sort');
    try {
      const r = await api.sortBundleTopics(bundle.id, own);
      setOwn(false);
      await refresh();
      notifications.show({
        message: tr('Розкладено: {sorted} з {songs} презентацій', {
          sorted: String(r.sorted),
          songs: String(r.songs),
        }),
        color: 'green',
        autoClose: 2500,
      });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Group justify="space-between" wrap="nowrap" mb="xs">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <ActionIcon variant="subtle" onClick={onBack} aria-label={tr('Назад до наборів')}>
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600} size="sm" truncate>
            {tr('Теми набору «{bundle}»', { bundle: bundle.name })}
          </Text>
        </Group>
        <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label={tr('Закрити')}>
          <IconX size={18} />
        </ActionIcon>
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        {tr(
          'Модель відносить кожну презентацію до однієї–трьох тем зі списку, за змістом її слайдів. Теми, які ви дали презентації чи забрали в неї самі, модель не змінює.',
        )}
      </Text>
      <Switch
        size="xs"
        mb="xs"
        checked={own}
        onChange={(e) => setOwn(e.currentTarget.checked)}
        label={tr('Нехай модель запропонує свої теми')}
        description={tr(
          'Модель збере близькі за змістом презентації в групи й назве їх словами, спільними для групи. Потім перейменуйте теми й виправте їх.',
        )}
      />
      <Group gap="xs" mb="xs">
        <Button
          size="xs"
          leftSection={<IconSparkles size={14} />}
          loading={busy === 'sort'}
          disabled={busy !== null || blank || twice >= 0}
          onClick={() => void sort()}
        >
          {tr('Розкласти')}
        </Button>
        {topics.data && topics.data.songs > 0 && (
          <Text size="xs" c="dimmed">
            {tr('З темою: {sorted} з {songs}', {
              sorted: String(topics.data.sorted),
              songs: String(topics.data.songs),
            })}
          </Text>
        )}
      </Group>
      {rows && rows.length === 0 && !own && (
        <Text size="sm" c="dimmed" mb="xs">
          {tr(
            'Тем ще немає. «Розкласти» візьме готовий список (Хвала, Подяка, Молитва…), або додайте свої теми.',
          )}
        </Text>
      )}
      <ScrollArea style={{ flex: 1 }} scrollbars="y" className="vo-scroll-rows">
        <Stack gap={4}>
          {(rows ?? []).map((r, i) => (
            <Group key={i} gap={4} wrap="nowrap" align="flex-start">
              <TextInput
                size="xs"
                w={170}
                aria-label={tr('Назва теми')}
                value={r.name}
                error={!r.name.trim() || twice === i ? true : undefined}
                onChange={(e) => set(i, { name: e.currentTarget.value })}
              />
              <TextInput
                size="xs"
                style={{ flex: 1, minWidth: 0 }}
                aria-label={tr('Слова теми для моделі')}
                placeholder={tr('Слова для моделі, через кому')}
                value={r.about}
                onChange={(e) => set(i, { about: e.currentTarget.value })}
              />
              <Tooltip label={tr('Презентацій із цією темою')} withArrow>
                <Badge size="sm" variant="light" color="gray" mt={4}>
                  {r.was !== undefined ? (topics.data?.counts[r.was] ?? 0) : 0}
                </Badge>
              </Tooltip>
              <Tooltip label={tr('Видалити тему')} withArrow>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => setRows((rs) => rs && rs.filter((_, j) => j !== i))}
                  aria-label={tr('Видалити тему «{topic}»', { topic: r.name })}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ))}
        </Stack>
      </ScrollArea>
      {twice >= 0 && (
        <Text size="xs" c="red" mt={4}>
          {tr('Дві теми з однією назвою — перейменуйте одну')}
        </Text>
      )}
      <Group gap="xs" mt="xs">
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconPlus size={14} />}
          disabled={!rows}
          onClick={() => setRows((rs) => [...(rs ?? []), { name: '', about: '' }])}
        >
          {tr('Додати тему')}
        </Button>
        {dirty && (
          <Button
            size="xs"
            variant="light"
            leftSection={<IconDeviceFloppy size={14} />}
            loading={busy === 'save'}
            disabled={busy !== null || blank || twice >= 0}
            onClick={() => void save()}
          >
            {tr('Зберегти список')}
          </Button>
        )}
      </Group>
    </Box>
  );
}
