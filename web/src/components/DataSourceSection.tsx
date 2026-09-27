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
import { api, type SegmentInfo } from '../api';
import { useDataSource } from '../dataSourceStore';
import { localEngine } from '../lib/engine';
import type { LoadedSegment } from '../lib/engine/protocol';
import { loadSegments } from '../lib/engine/restore';

const mb = (b: number) => `${(b / 1048576).toFixed(b < 10 * 1048576 ? 1 : 0)} МБ`;

/**
 * «Джерело даних»: read the library from the server, or from the browser engine
 * (SQLite-in-WASM in a worker) assembled from chosen segments — downloaded from the
 * server or dropped as files. Lives in the control window only: the engine is per window.
 */
export function DataSourceSection() {
  const qc = useQueryClient();
  const source = useDataSource((s) => s.source);
  const remembered = useDataSource((s) => s.segments);
  const setSource = useDataSource((s) => s.setSource);
  const setSegments = useDataSource((s) => s.setSegments);

  const manifest = useQuery({ queryKey: ['segments'], queryFn: api.segments, retry: false });
  const [picked, setPicked] = useState<string[]>(remembered);
  const [loaded, setLoaded] = useState<LoadedSegment[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );
  const [dragOver, setDragOver] = useState(false);

  const refreshStatus = () => void localEngine.status().then(setLoaded);
  useEffect(refreshStatus, []);

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
      await loadSegments(picked, (file, state) => {
        if (state === 'done') done += 1;
        const s = byFile.get(file);
        setProgress({
          done,
          total: picked.length,
          label: `${state === 'download' ? 'Завантаження' : state === 'merge' ? 'Збирання' : 'Готово'}: ${s?.abbr ?? file}`,
        });
      });
      setSegments(picked);
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
      for (const [i, f] of list.entries()) {
        setProgress({ done: i, total: list.length, label: `Збирання: ${f.name}` });
        await localEngine.add(f.name, await f.arrayBuffer());
      }
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
            { label: 'Сервер', value: 'server' },
            { label: 'У браузері', value: 'local', disabled: loaded.length === 0 },
          ]}
        />
        <Text size="xs" c="dimmed" mt={4}>
          {source === 'server'
            ? 'Уся бібліотека з сервера. «У браузері» — вибрані переклади працюють прямо тут (SQLite у WebAssembly), без запитів до сервера.'
            : `У браузері: ${loaded.length} сегм., ${mb(loadedBytes)} у пам’яті.`}
        </Text>
      </div>

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
