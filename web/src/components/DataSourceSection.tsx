import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  FileButton,
  Group,
  Progress,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconChartBar, IconDatabase, IconDownload, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { type SegmentInfo } from '../api';
import { useDataSource, useEffectiveSource } from '../dataSourceStore';
import { useServer } from '../serverStore';
import { ENGINE_LABEL, localEngine } from '../lib/engine';
import type { EngineKind, LoadedSegment } from '../lib/engine/protocol';
import {
  addDroppedFile,
  getManifest,
  loadSegments,
  segmentItems,
  segmentLabel,
  switchEngine,
  type Dropped,
} from '../lib/engine/restore';
import { cacheAvailable, cacheUsage, clearCache, requestPersistence } from '../lib/engine/cache';
import { fmtNumber, tr, trn, useLang } from '../i18n';

const mb = (b: number) =>
  tr('{n} МБ', { n: fmtNumber(b / 1048576, { maximumFractionDigits: b < 10 * 1048576 ? 1 : 0 }) });
const segs = (n: number) => trn(n, '{n} сегм.|{n} сегм.|{n} сегм.');

/** MyBible modules (converted in the browser) and ready segments. */
const DROPPABLE = /\.(sqlite3|vodb|vodb\.gz)$/i;

/**
 * «Джерело даних»: read the library from the server, or from the browser engine
 * (SQLite or PostgreSQL in WASM, in a worker) assembled from chosen segments — downloaded
 * from the server or dropped as files. Lives in the control window only: the engine is
 * per window.
 */
export function DataSourceSection() {
  const qc = useQueryClient();
  // what reads actually use (browser when chosen, or when the server is unreachable)
  const source = useEffectiveSource();
  const serverAvailable = useServer((s) => s.available);
  const remembered = useDataSource((s) => s.segments);
  const setSource = useDataSource((s) => s.setSource);
  const setSegments = useDataSource((s) => s.setSegments);
  const engine = useDataSource((s) => s.engine);
  useLang();

  // From the server, or the last one seen when it's unreachable (offline).
  const manifest = useQuery({ queryKey: ['segments'], queryFn: getManifest, retry: false });
  const usage = useQuery({ queryKey: ['segment-cache'], queryFn: cacheUsage });
  const [picked, setPicked] = useState<string[]>(remembered);
  const [loaded, setLoaded] = useState<LoadedSegment[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );
  const [dragOver, setDragOver] = useState(false);
  // engine name/version and its database size (asked only once it holds something)
  const engineInfo = useQuery({
    queryKey: ['engine-info', engine],
    queryFn: () => localEngine.info(),
    enabled: loaded.length > 0,
  });

  const refreshStatus = () => {
    void localEngine.status().then(setLoaded);
    void qc.invalidateQueries({ queryKey: ['segment-cache'] });
    void qc.invalidateQueries({ queryKey: ['engine-info'] });
  };
  useEffect(() => {
    void localEngine.status().then(setLoaded);
  }, []);

  const byFile = useMemo(
    () => new Map((manifest.data?.segments ?? []).map((s) => [s.file, s])),
    [manifest.data],
  );
  const pickedBytes = picked.reduce((a, f) => a + (byFile.get(f)?.bytes ?? 0), 0);

  // After the engine changes, every cached library query must re-run against it.
  const switchedData = () => void qc.invalidateQueries();

  const loadPicked = async () => {
    if (picked.length === 0) return;
    setProgress({ done: 0, total: picked.length, label: '' });
    try {
      let done = 0;
      void requestPersistence(); // keep the cache from being evicted
      const stateLabel = {
        cache: tr('З кешу'),
        download: tr('Завантаження'),
        merge: tr('Збирання'),
        done: tr('Готово'),
      };
      await loadSegments(picked, (file, state) => {
        if (state === 'done') done += 1;
        const s = byFile.get(file);
        setProgress({
          done,
          total: picked.length,
          label: `${stateLabel[state]}: ${s?.abbr ?? file}`,
        });
      });
      // keep previously dropped files in the remembered set
      setSegments([...picked, ...remembered.filter((k) => !byFile.has(k))]);
      setSource('local');
      switchedData();
      notifications.show({
        message: tr('Бібліотека в браузері готова'),
        color: 'green',
        autoClose: 1500,
      });
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    } finally {
      setProgress(null);
      refreshStatus();
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => DROPPABLE.test(f.name));
    if (list.length === 0) {
      notifications.show({
        message: tr('Підходять модулі MyBible (.SQLite3) і сегменти (.vodb / .vodb.gz)'),
        color: 'red',
      });
      return;
    }
    setProgress({ done: 0, total: list.length, label: '' });
    const added: Dropped[] = [];
    try {
      for (const [i, f] of list.entries()) {
        const r = await addDroppedFile(f, (stage) =>
          setProgress({
            done: i,
            total: list.length,
            label: `${stage === 'convert' ? tr('Перетворення') : tr('Збирання')}: ${f.name}`,
          }),
        );
        added.push(r);
      }
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося додати файл: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    } finally {
      // whatever made it in before a failure stays (and is remembered)
      if (added.length > 0) {
        const keys = useDataSource.getState().segments;
        setSegments([...keys, ...added.map((d) => d.key).filter((k) => !keys.includes(k))]);
        setSource('local');
        switchedData();
        notifications.show({
          message: added.map((d) => d.summary).join('\n'),
          color: 'green',
          autoClose: 4000,
        });
      }
      setProgress(null);
      refreshStatus();
    }
  };

  const clear = async () => {
    await localEngine.reset();
    setSegments([]);
    setSource('server');
    switchedData();
    refreshStatus();
  };

  /** Same segments, another database: rebuild the browser library on the chosen engine. */
  const changeEngine = async (kind: EngineKind) => {
    if (kind === engine) return;
    const total = loaded.length;
    setProgress({
      done: 0,
      total: Math.max(total, 1),
      label: tr('Запуск: {engine}', { engine: ENGINE_LABEL[kind] }),
    });
    try {
      let done = 0;
      const ms = await switchEngine(kind, (key, state) => {
        if (state === 'done') done += 1;
        setProgress({
          done,
          total: Math.max(total, 1),
          label: `${ENGINE_LABEL[kind]}: ${byFile.get(key)?.abbr ?? segmentLabel(key)}`,
        });
      });
      switchedData();
      notifications.show({
        message: total
          ? tr('{engine}: {segments} за {s} с', {
              engine: ENGINE_LABEL[kind],
              segments: segs(total),
              s: fmtNumber(ms / 1000, { maximumFractionDigits: 1 }),
            })
          : tr('Рушій: {engine}', { engine: ENGINE_LABEL[kind] }),
        color: 'green',
        autoClose: 2500,
      });
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    } finally {
      setProgress(null);
      refreshStatus();
    }
  };

  const dropCache = async () => {
    await clearCache();
    refreshStatus();
    notifications.show({
      message: tr('Кеш сегментів очищено'),
      color: 'green',
      autoClose: 1500,
    });
  };

  const kindLabel: Record<SegmentInfo['kind'], string> = {
    translation: tr('Переклади'),
    dictionary: tr('Словники'),
    study: tr('Посилання й коментарі'),
    songs: tr('Пісні'),
  };
  const groups = (['translation', 'dictionary', 'study', 'songs'] as const)
    .map((k) => ({ k, items: (manifest.data?.segments ?? []).filter((s) => s.kind === k) }))
    .filter((g) => g.items.length > 0);
  const loadedBytes = loaded.reduce((a, s) => a + s.bytes, 0);

  return (
    <Stack gap="xs">
      <div>
        <Text size="sm" fw={500} mb={4}>
          {tr('Джерело даних')}
        </Text>
        <SegmentedControl
          fullWidth
          value={source}
          onChange={(v) => {
            if (v === 'local' && loaded.length === 0) return; // choose segments first
            setSource(v as 'server' | 'local');
            switchedData();
          }}
          data={[
            { label: tr('Сервер'), value: 'server', disabled: serverAvailable === false },
            { label: tr('У браузері'), value: 'local', disabled: loaded.length === 0 },
          ]}
        />
        <Text size="xs" c="dimmed" mt={4}>
          {source === 'server'
            ? tr(
                'Уся бібліотека з сервера. «У браузері» — вибрані переклади працюють прямо тут (база в WebAssembly), без запитів до сервера.',
              )
            : tr('У браузері: {segments}, {size} у пам’яті{version}.', {
                segments: segs(loaded.length),
                size: mb(engineInfo.data?.dbBytes ?? loadedBytes),
                version: engineInfo.data ? ` · ${engineInfo.data.version}` : '',
              })}
        </Text>
      </div>

      <Group gap="xs" wrap="nowrap">
        <Text size="xs" c="dimmed">
          {tr('Рушій бази')}
        </Text>
        <SegmentedControl
          size="xs"
          style={{ flex: 1 }}
          value={engine}
          disabled={!!progress}
          onChange={(v) => void changeEngine(v as EngineKind)}
          data={[
            { label: 'SQLite', value: 'sqlite' },
            { label: 'PostgreSQL', value: 'pglite' },
          ]}
        />
        <Tooltip label={tr('Порівняти рушії бази на тих самих запитах (нове вікно)')}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={tr('Порівняти рушії бази')}
            onClick={() => window.open('/bench', 'vo-bench')}
          >
            <IconChartBar size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {manifest.data?.offline && (
        <Text size="xs" c="orange">
          {tr(
            'Сервер недоступний — список сегментів з кешу браузера; працюють лише збережені сегменти.',
          )}
        </Text>
      )}
      {manifest.isError ? (
        <Text size="xs" c="dimmed">
          {tr(
            'Сегменти на сервері не зібрано (npm run build:segments). Можна додати модулі MyBible чи сегменти файлами — нижче.',
          )}
        </Text>
      ) : (
        <ScrollArea.Autosize mah={220} type="hover">
          <Checkbox.Group value={picked} onChange={setPicked}>
            <Stack gap={6}>
              {groups.map((g) => (
                <div key={g.k}>
                  <Text size="xs" c="dimmed" mb={2}>
                    {kindLabel[g.k]}
                  </Text>
                  <Stack gap={2}>
                    {g.items.map((s) => (
                      <Checkbox
                        key={s.file}
                        size="xs"
                        value={s.file}
                        label={
                          <span>
                            {s.abbr}{' '}
                            <Text span size="xs" c="dimmed">
                              {mb(s.bytes)}
                              {loaded.some((l) => l.key === s.file)
                                ? ` · ${tr('завантажено')}`
                                : ''}
                            </Text>
                          </span>
                        }
                      />
                    ))}
                  </Stack>
                </div>
              ))}
            </Stack>
          </Checkbox.Group>
        </ScrollArea.Autosize>
      )}

      {loaded.some((l) => !byFile.has(l.key)) && (
        <div>
          <Text size="xs" c="dimmed" mb={2}>
            {tr('Перетягнуті файли')}
          </Text>
          {loaded
            .filter((l) => !byFile.has(l.key))
            .map((l) => (
              <Text key={l.key} size="xs">
                {segmentLabel(l.key)}{' '}
                <Text span size="xs" c="dimmed">
                  {segmentItems(l)}
                </Text>
              </Text>
            ))}
        </div>
      )}

      {progress ? (
        <div>
          <Progress value={(progress.done / progress.total) * 100} size="sm" animated />
          <Text size="xs" c="dimmed" mt={4}>
            {progress.label} ({progress.done}/{progress.total})
          </Text>
        </div>
      ) : (
        <Group gap="xs" grow>
          <Button
            size="xs"
            leftSection={<IconDownload size={14} />}
            disabled={picked.length === 0 || !manifest.data}
            onClick={() => void loadPicked()}
          >
            {tr('Завантажити')}
            {picked.length ? ` (${mb(pickedBytes)})` : ''}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconTrash size={14} />}
            disabled={loaded.length === 0}
            onClick={() => void clear()}
          >
            {tr('Очистити')}
          </Button>
        </Group>
      )}

      {cacheAvailable() ? (
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {tr('Кеш браузера:')}{' '}
            {usage.data ? `${segs(usage.data.segments)}, ${mb(usage.data.bytes)}` : '…'}
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            disabled={!usage.data?.segments}
            onClick={() => void dropCache()}
          >
            {tr('Очистити кеш')}
          </Button>
        </Group>
      ) : (
        <Text size="xs" c="dimmed">
          {tr(
            'Кеш браузера недоступний (сторінка відкрита не через localhost/HTTPS) — сегменти щоразу завантажуються з сервера.',
          )}
        </Text>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
        style={{
          border: `1px dashed var(--mantine-color-${dragOver ? 'brand-filled' : 'default-border'})`,
          borderRadius: 8,
          padding: '10px 12px',
          textAlign: 'center',
          background: dragOver ? 'var(--mantine-color-brand-light)' : undefined,
        }}
      >
        <Group gap={6} justify="center" wrap="nowrap">
          <IconDatabase size={14} />
          <Text size="xs" c="dimmed">
            {tr(
              'Перетягніть сюди модулі MyBible (.SQLite3) — Біблії, словники, коментарі, посилання — або сегменти .vodb',
            )}
          </Text>
        </Group>
        <FileButton
          onChange={(f) => void addFiles(f)}
          accept=".SQLite3,.sqlite3,.vodb,.gz"
          multiple
        >
          {(props) => (
            <Button {...props} size="compact-xs" variant="subtle" mt={4} disabled={!!progress}>
              {tr('Вибрати файли…')}
            </Button>
          )}
        </FileButton>
      </div>
    </Stack>
  );
}
