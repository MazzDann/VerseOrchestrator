import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Group,
  Progress,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core';
import { IconDatabase, IconDownload, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { type SegmentInfo } from '../api';
import { useDataSource, useEffectiveSource } from '../dataSourceStore';
import { useServer } from '../serverStore';
import { localEngine } from '../lib/engine';
import type { LoadedSegment } from '../lib/engine/protocol';
import { addDroppedFile, getManifest, loadSegments, segmentLabel } from '../lib/engine/restore';
import { cacheAvailable, cacheUsage, clearCache, requestPersistence } from '../lib/engine/cache';

const mb = (b: number) => `${(b / 1048576).toFixed(b < 10 * 1048576 ? 1 : 0)} МБ`;

/**
 * «Джерело даних»: read the library from the server, or from the browser engine
 * (SQLite-in-WASM in a worker) assembled from chosen segments — downloaded from the
 * server or dropped as files. Lives in the control window only: the engine is per window.
 */
export function DataSourceSection() {
  const qc = useQueryClient();
  // what reads actually use (browser when chosen, or when the server is unreachable)
  const source = useEffectiveSource();
  const serverAvailable = useServer((s) => s.available);
  const remembered = useDataSource((s) => s.segments);
  const setSource = useDataSource((s) => s.setSource);
  const setSegments = useDataSource((s) => s.setSegments);

  // From the server, or the last one seen when it's unreachable (offline).
  const manifest = useQuery({ queryKey: ['segments'], queryFn: getManifest, retry: false });
  const usage = useQuery({ queryKey: ['segment-cache'], queryFn: cacheUsage });
  const [picked, setPicked] = useState<string[]>(remembered);
  const [loaded, setLoaded] = useState<LoadedSegment[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );
  const [dragOver, setDragOver] = useState(false);

  const refreshStatus = () => {
    void localEngine.status().then(setLoaded);
    void qc.invalidateQueries({ queryKey: ['segment-cache'] });
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
        cache: 'З кешу',
        download: 'Завантаження',
        merge: 'Збирання',
        done: 'Готово',
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
        message: 'Бібліотека в браузері готова',
        color: 'green',
        autoClose: 1500,
      });
    } catch (e) {
      notifications.show({ message: `Не вдалося: ${(e as Error).message}`, color: 'red' });
    } finally {
      setProgress(null);
      refreshStatus();
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => /\.vodb(\.gz)?$/i.test(f.name));
    if (list.length === 0) {
      notifications.show({
        message: 'Перетягніть файли сегментів .vodb або .vodb.gz',
        color: 'red',
      });
      return;
    }
    setProgress({ done: 0, total: list.length, label: '' });
    try {
      const keys: string[] = [];
      for (const [i, f] of list.entries()) {
        setProgress({ done: i, total: list.length, label: `Збирання: ${f.name}` });
        keys.push(await addDroppedFile(f));
      }
      setSegments([...useDataSource.getState().segments, ...keys]);
      setSource('local');
      switchedData();
      notifications.show({
        message: `Додано файлів: ${list.length}`,
        color: 'green',
        autoClose: 1500,
      });
    } catch (e) {
      notifications.show({
        message: `Не вдалося додати файл: ${(e as Error).message}`,
        color: 'red',
      });
    } finally {
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

  const dropCache = async () => {
    await clearCache();
    refreshStatus();
    notifications.show({ message: 'Кеш сегментів очищено', color: 'green', autoClose: 1500 });
  };

  const kindLabel: Record<SegmentInfo['kind'], string> = {
    translation: 'Переклади',
    dictionary: 'Словники',
    study: 'Посилання й коментарі',
    songs: 'Пісні',
  };
  const groups = (['translation', 'dictionary', 'study', 'songs'] as const)
    .map((k) => ({ k, items: (manifest.data?.segments ?? []).filter((s) => s.kind === k) }))
    .filter((g) => g.items.length > 0);
  const loadedBytes = loaded.reduce((a, s) => a + s.bytes, 0);

  return (
    <Stack gap="xs">
      <div>
        <Text size="sm" fw={500} mb={4}>
          Джерело даних
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
            { label: 'Сервер', value: 'server', disabled: serverAvailable === false },
            { label: 'У браузері', value: 'local', disabled: loaded.length === 0 },
          ]}
        />
        <Text size="xs" c="dimmed" mt={4}>
          {source === 'server'
            ? 'Уся бібліотека з сервера. «У браузері» — вибрані переклади працюють прямо тут (SQLite у WebAssembly), без запитів до сервера.'
            : `У браузері: ${loaded.length} сегм., ${mb(loadedBytes)} у пам’яті.`}
        </Text>
      </div>

      {manifest.data?.offline && (
        <Text size="xs" c="orange">
          Сервер недоступний — список сегментів з кешу браузера; працюють лише збережені сегменти.
        </Text>
      )}
      {manifest.isError ? (
        <Text size="xs" c="dimmed">
          Сегменти на сервері не зібрано (npm run build:segments). Можна перетягнути файли сюди.
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
                              {loaded.some((l) => l.key === s.file) ? ' · завантажено' : ''}
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
            Перетягнуті файли
          </Text>
          {loaded
            .filter((l) => !byFile.has(l.key))
            .map((l) => (
              <Text key={l.key} size="xs">
                {segmentLabel(l.key)}{' '}
                <Text span size="xs" c="dimmed">
                  {l.verses} віршів
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
            Завантажити{picked.length ? ` (${mb(pickedBytes)})` : ''}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconTrash size={14} />}
            disabled={loaded.length === 0}
            onClick={() => void clear()}
          >
            Очистити
          </Button>
        </Group>
      )}

      {cacheAvailable() ? (
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed">
            Кеш браузера:{' '}
            {usage.data ? `${usage.data.segments} сегм., ${mb(usage.data.bytes)}` : '…'}
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            disabled={!usage.data?.segments}
            onClick={() => void dropCache()}
          >
            Очистити кеш
          </Button>
        </Group>
      ) : (
        <Text size="xs" c="dimmed">
          Кеш браузера недоступний (сторінка відкрита не через localhost/HTTPS) — сегменти щоразу
          завантажуються з сервера.
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
            Або перетягніть сюди файли .vodb / .vodb.gz
          </Text>
        </Group>
      </div>
    </Stack>
  );
}
