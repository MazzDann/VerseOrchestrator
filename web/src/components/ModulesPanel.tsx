import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBooks, IconCheck, IconDownload, IconRefresh, IconSearch } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  MODULE_KIND_IDS,
  type CatalogQueue,
  type CatalogRow,
  type ModuleKindId,
} from '../api';
import { fmtDateTime, tr, useLang } from '../i18n';
import {
  filterRows,
  formatSize,
  inLibrary,
  isActive,
  KIND_LABEL,
  langName,
  languagesOf,
  moduleFileName,
  moduleState,
  percent,
  titleOf,
  useModulesPanel,
  type QueueItem,
} from '../lib/catalog';
import { rebuildProgress, useRebuildLibrary } from '../lib/rebuild';
import { useServer } from '../serverStore';
import { FloatingPanel } from './FloatingPanel';
import { VirtualList } from './VirtualList';

/**
 * «Модулі» (1.15.0-beta.1, users' ask F1005-02 «Розширений датапак»): Module's catalog — pick a
 * translation, a dictionary, a commentary; the server downloads it into modules/ and rebuilds the
 * library — and «У бібліотеці», which of the files in modules/ the library takes.
 */
export function ModulesFloating() {
  const open = useModulesPanel((s) => s.open);
  const hide = useModulesPanel((s) => s.hide);
  useLang();
  return (
    <FloatingPanel
      opened={open}
      onClose={hide}
      title={tr('Модулі')}
      storageKey="vo:modulesPanelPos"
      width={460}
      icon={<IconBooks size={16} />}
    >
      {open && <ModulesPanel />}
    </FloatingPanel>
  );
}

const KINDS = () => MODULE_KIND_IDS.map((k) => ({ value: k, label: tr(KIND_LABEL[k]) }));

function ModulesPanel() {
  useLang();
  const tab = useModulesPanel((s) => s.tab);
  const setTab = useModulesPanel((s) => s.setTab);
  const serverAvailable = useServer((s) => s.available);
  if (serverAvailable === false)
    return (
      <Text size="sm" c="dimmed" p="sm">
        {tr('Каталог модулів працює, коли застосунок запущено на цьому комп’ютері.')}
      </Text>
    );
  // its full height from the first frame: the panel finds its place by the height it opens with,
  // and the list comes a moment later
  return (
    <Stack gap="xs" p="sm" mih="35rem">
      <SegmentedControl
        size="xs"
        fullWidth
        value={tab}
        onChange={(v) => setTab(v as 'catalog' | 'library')}
        data={[
          { value: 'catalog', label: tr('Каталог Module') },
          { value: 'library', label: tr('У бібліотеці') },
        ]}
      />
      {tab === 'catalog' ? <CatalogTab /> : <LibraryTab />}
      <RebuildLine />
    </Stack>
  );
}

/** The download queue, every second while it moves (the hub tells a control window sooner). */
function useCatalogQueue() {
  return useQuery({
    queryKey: ['catalogQueue'],
    queryFn: () => api.catalogQueue(),
    refetchInterval: (q) => (q.state.data?.items.some(isActive) ? 1000 : false),
    retry: false,
  });
}

function useModules() {
  return useQuery({ queryKey: ['modules'], queryFn: () => api.modules(), retry: false });
}

function CatalogTab() {
  const ui = useLang();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const catalog = useQuery({
    queryKey: ['catalog'],
    queryFn: () => api.catalog(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const modules = useModules();
  const queue = useCatalogQueue();
  const [kind, setKind] = useState<ModuleKindId>('bibles');
  const [lang, setLang] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const entries = useMemo(() => catalog.data?.entries ?? [], [catalog.data]);
  const langs = useMemo(() => languagesOf(entries, kind, ui), [entries, kind, ui]);
  // the interface language first — when the kind has modules in it
  const language = lang ?? (langs.some((l) => l.code === ui) ? ui : '');
  const rows = useMemo(
    () => filterRows(entries, { kind, lang: language, query }),
    [entries, kind, language, query],
  );
  const items = useMemo(
    () => new Map((queue.data?.items ?? []).map((i) => [i.fil, i])),
    [queue.data],
  );
  const row = entries.find((e) => e.fil === picked) ?? null;

  // a download that finished: modules/ changed
  const doneCount = queue.data?.items.filter((i) => i.phase === 'done').length ?? 0;
  useEffect(() => {
    if (doneCount) void queryClient.invalidateQueries({ queryKey: ['modules'] });
  }, [doneCount, queryClient]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      queryClient.setQueryData(['catalog'], await api.catalog(true));
    } catch (e) {
      notifications.show({ message: (e as Error).message, color: 'red' });
    } finally {
      setRefreshing(false);
    }
  };

  if (catalog.isError)
    return (
      <Stack gap={6}>
        <Text size="sm" c="orange">
          {(catalog.error as Error).message}
        </Text>
        <Group>
          <Button size="xs" variant="default" onClick={() => void catalog.refetch()}>
            {tr('Спробувати ще раз')}
          </Button>
        </Group>
      </Stack>
    );
  if (!catalog.data)
    return (
      <Text size="sm" c="dimmed">
        {tr('Завантажую список модулів…')}
      </Text>
    );

  return (
    <Stack gap="xs">
      <SegmentedControl
        size="xs"
        fullWidth
        value={kind}
        onChange={(v) => {
          setKind(v as ModuleKindId);
          setLang(null);
          setPicked(null);
        }}
        data={KINDS()}
      />
      <Group gap="xs" wrap="nowrap">
        <TextInput
          size="xs"
          style={{ flex: 1, minWidth: 0 }}
          leftSection={<IconSearch size={14} />}
          placeholder={tr('Назва чи скорочення')}
          aria-label={tr('Пошук у каталозі')}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <Select
          size="xs"
          w="11rem"
          searchable
          aria-label={tr('Мова')}
          value={language}
          onChange={(v) => setLang(v ?? '')}
          data={[
            { value: '', label: tr('Усі мови') },
            ...langs.map((l) => ({ value: l.code, label: `${langName(l.code, ui)} · ${l.n}` })),
          ]}
          comboboxProps={{ withinPortal: true }}
        />
      </Group>
      <Box
        h="16rem"
        style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 6 }}
      >
        <VirtualList
          items={rows}
          getKey={(r) => r.fil}
          estimateSize={30}
          isSelected={(r) => r.fil === picked}
          onSelect={(r) => setPicked(r.fil)}
          empty={
            query
              ? tr('Нічого не знайдено за «{query}»', { query })
              : tr('Немає модулів цього виду')
          }
          renderRow={(r) => (
            <CatalogLine
              row={r}
              ui={ui}
              item={items.get(r.fil)}
              state={moduleState(r, modules.data)}
            />
          )}
        />
      </Box>
      {row ? (
        <ModuleCard
          row={row}
          ui={ui}
          item={items.get(row.fil)}
          state={moduleState(row, modules.data)}
          onQueue={(q) => queryClient.setQueryData(['catalogQueue'], q)}
        />
      ) : (
        <Text size="xs" c="dimmed">
          {tr('Виберіть модуль у списку, щоб побачити опис і завантажити його.')}
        </Text>
      )}
      <Group gap={4} wrap="nowrap" align="flex-start">
        <Text size="xs" c="dimmed" style={{ flex: 1 }}>
          {tr('Модулі — з каталогу')}{' '}
          <Anchor href="https://example.invalid" target="_blank" rel="noreferrer" size="xs">
            Module
          </Anchor>
          {'. '}
          {tr('Права на тексти належать їхнім власникам.')}{' '}
          {tr('Список від {date}.', { date: fmtDateTime(catalog.data.fetchedAt) })}
          {catalog.data.stale &&
            ` ${tr('Каталог зараз недоступний — показано збережений список.')}`}
        </Text>
        <Tooltip label={tr('Оновити список')} withinPortal>
          <ActionIcon
            variant="subtle"
            size="sm"
            loading={refreshing}
            onClick={() => void refresh()}
            aria-label={tr('Оновити список')}
          >
            <IconRefresh size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Stack>
  );
}

function CatalogLine({
  row,
  ui,
  item,
  state,
}: {
  row: CatalogRow;
  ui: string;
  item: QueueItem | undefined;
  state: ReturnType<typeof moduleState>;
}) {
  const side = isActive(item)
    ? item!.phase === 'downloading'
      ? `${percent(item!)} %`
      : item!.phase === 'waiting'
        ? tr('у черзі')
        : tr('розпаковую…')
    : state === 'library'
      ? tr('у бібліотеці')
      : state === 'folder'
        ? tr('у папці')
        : formatSize(row.size);
  return (
    <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
      <Text size="sm" fw={500} style={{ flex: '0 0 auto' }}>
        {row.abbr}
      </Text>
      <Text size="xs" c="dimmed" truncate style={{ flex: 1, minWidth: 0 }}>
        {titleOf(row, ui)}
      </Text>
      <Text size="xs" c={state === 'library' ? undefined : 'dimmed'} style={{ flex: '0 0 auto' }}>
        {state === 'library' && !isActive(item) && (
          <IconCheck size={12} style={{ verticalAlign: -1 }} />
        )}{' '}
        {side}
      </Text>
    </Group>
  );
}

function ModuleCard({
  row,
  ui,
  item,
  state,
  onQueue,
}: {
  row: CatalogRow;
  ui: string;
  item: QueueItem | undefined;
  state: ReturnType<typeof moduleState>;
  onQueue: (q: CatalogQueue) => void;
}) {
  const queryClient = useQueryClient();
  const { rebuild } = useRebuildLibrary();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notifications.show({ message: (e as Error).message, color: 'red' });
    } finally {
      setBusy(false);
    }
  };
  const download = () => act(async () => onQueue(await api.downloadModule(row.fil)));
  const cancel = () => act(async () => onQueue(await api.cancelDownload(row.fil)));
  // in modules/ already, left out of the library: taken in, and the library built
  const include = () =>
    act(async () => {
      const info = await api.modules();
      const name = moduleFileName(row.fil, row.kind);
      const file = (info.files[row.kind] ?? []).find((f) => f.toLowerCase() === name.toLowerCase());
      if (!file) return;
      const sel = info.selection?.[row.kind];
      const now = sel == null ? (info.files[row.kind] ?? []) : sel;
      await api.selectModules(row.kind, [...now, file]);
      await queryClient.invalidateQueries({ queryKey: ['modules'] });
      await rebuild();
    });

  const meta = [
    langName(row.lang, ui),
    formatSize(row.size),
    row.updated && tr('оновлено {date}', { date: row.updated }),
    row.region,
  ].filter(Boolean);
  return (
    <Paper withBorder p="xs" radius="md">
      <Stack gap={4}>
        <Text size="sm" fw={500} lineClamp={2}>
          {row.abbr} — {titleOf(row, ui)}
        </Text>
        <Text size="xs" c="dimmed">
          {meta.join(' · ')}
        </Text>
        {row.info && row.info !== row.title && (
          <Text size="xs" lineClamp={5} style={{ whiteSpace: 'pre-line' }}>
            {row.info}
          </Text>
        )}
        {row.licence && (
          <Text size="xs" c="dimmed" lineClamp={3} style={{ whiteSpace: 'pre-line' }}>
            {tr('Права: {who}', { who: row.licence })}
          </Text>
        )}
        {item?.phase === 'failed' && item.note && (
          <Text size="xs" c="orange">
            {tr(item.note.key, item.note.vars)}
          </Text>
        )}
        {item?.phase === 'done' && item.note && (
          <Text size="xs" c="dimmed">
            {tr(item.note.key, item.note.vars)}
          </Text>
        )}
        {isActive(item) ? (
          <Group gap="xs" wrap="nowrap">
            <Progress
              style={{ flex: 1 }}
              value={
                item!.phase === 'downloading' ? percent(item!) : item!.phase === 'placing' ? 100 : 0
              }
              striped={item!.phase !== 'downloading'}
              animated={item!.phase !== 'downloading'}
              aria-label={tr('Завантаження')}
            />
            {item!.phase !== 'placing' && (
              <Button size="xs" variant="default" onClick={() => void cancel()} loading={busy}>
                {tr('Скасувати')}
              </Button>
            )}
          </Group>
        ) : state === 'library' ? (
          <Text size="xs">
            <IconCheck size={12} style={{ verticalAlign: -1 }} /> {tr('У бібліотеці')}
          </Text>
        ) : state === 'folder' ? (
          <Group>
            <Button size="xs" variant="light" loading={busy} onClick={() => void include()}>
              {tr('Додати до бібліотеки')}
            </Button>
          </Group>
        ) : (
          <Group>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconDownload size={14} />}
              loading={busy}
              onClick={() => void download()}
            >
              {item?.phase === 'failed' ? tr('Спробувати ще раз') : tr('Завантажити')}
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}

function LibraryTab() {
  const ui = useLang();
  const queryClient = useQueryClient();
  const modules = useModules();
  const catalog = useQuery({
    queryKey: ['catalog'],
    queryFn: () => api.catalog(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [kind, setKind] = useState<ModuleKindId>('bibles');
  const [query, setQuery] = useState('');
  const [changed, setChanged] = useState(false);
  const { rebuild, rebuilding } = useRebuildLibrary();

  // a file's title from the catalog, by the name it is kept as
  const titles = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of catalog.data?.entries ?? [])
      m.set(moduleFileName(r.fil, r.kind).toLowerCase(), titleOf(r, ui));
    return m;
  }, [catalog.data, ui]);

  const info = modules.data;
  const files = info?.files[kind] ?? [];
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const shown = files.filter((f) => {
    const hay = `${f} ${titles.get(f.toLowerCase()) ?? ''}`.toLocaleLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const taken = info ? files.filter((f) => inLibrary(info, kind, f)).length : 0;

  const toggle = async (file: string) => {
    if (!info) return;
    const sel = info.selection?.[kind];
    const now = sel == null ? files : sel;
    const on = inLibrary(info, kind, file);
    const next = on ? now.filter((n) => n.toLowerCase() !== file.toLowerCase()) : [...now, file];
    try {
      await api.selectModules(kind, next);
      setChanged(true);
      await queryClient.invalidateQueries({ queryKey: ['modules'] });
    } catch (e) {
      notifications.show({ message: (e as Error).message, color: 'red' });
    }
  };

  if (modules.isError)
    return (
      <Text size="sm" c="orange">
        {(modules.error as Error).message}
      </Text>
    );
  return (
    <Stack gap="xs">
      <SegmentedControl
        size="xs"
        fullWidth
        value={kind}
        onChange={(v) => setKind(v as ModuleKindId)}
        data={KINDS()}
      />
      <TextInput
        size="xs"
        leftSection={<IconSearch size={14} />}
        placeholder={tr('Назва файлу чи модуля')}
        aria-label={tr('Пошук серед модулів')}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <Text size="xs" c="dimmed">
        {tr('У бібліотеці {n} з {total}.', { n: String(taken), total: String(files.length) })}{' '}
        {tr('Позначте, які модулі брати, і зберіть бібліотеку.')}
      </Text>
      <Box
        h="16rem"
        style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 6 }}
      >
        <VirtualList
          items={shown}
          getKey={(f) => f}
          estimateSize={30}
          onSelect={(f) => void toggle(f)}
          empty={
            files.length
              ? tr('Нічого не знайдено за «{query}»', { query })
              : tr('У папці modules/ немає модулів цього виду. Завантажте їх із каталогу.')
          }
          renderRow={(f) => (
            <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
              <Checkbox
                size="xs"
                readOnly
                tabIndex={-1}
                checked={!!info && inLibrary(info, kind, f)}
                aria-label={tr('У бібліотеці')}
              />
              <Text size="sm" style={{ flex: '0 0 auto' }}>
                {f.replace(/(\.(dictionary|commentaries|crossreferences))?\.SQLite3$/i, '')}
              </Text>
              <Text size="xs" c="dimmed" truncate style={{ flex: 1, minWidth: 0 }}>
                {titles.get(f.toLowerCase()) ?? ''}
              </Text>
            </Group>
          )}
        />
      </Box>
      <Group gap="xs" wrap="nowrap">
        <Button
          size="xs"
          variant={changed ? 'filled' : 'light'}
          loading={rebuilding}
          onClick={() => {
            setChanged(false);
            void rebuild();
          }}
        >
          {tr('Зібрати бібліотеку')}
        </Button>
        {info && (
          <Text size="xs" c="dimmed" truncate style={{ flex: 1, minWidth: 0 }} title={info.dir}>
            {info.dir}
          </Text>
        )}
      </Group>
    </Stack>
  );
}

/** The download under way and the library build after it, in one line. */
function RebuildLine() {
  const queue = useCatalogQueue();
  const { job } = useRebuildLibrary();
  const active = queue.data?.items.filter(isActive) ?? [];
  if (active.length)
    return (
      <Text size="xs" c="dimmed" aria-live="polite">
        {tr('Завантажую модулі: {list}', {
          list: active
            .map((i) => (i.phase === 'downloading' ? `${i.abbr} ${percent(i)} %` : i.abbr))
            .join(', '),
        })}
      </Text>
    );
  if (job?.phase === 'running')
    return (
      <Text size="xs" c="dimmed" aria-live="polite">
        {rebuildProgress(job)}
      </Text>
    );
  return null;
}
