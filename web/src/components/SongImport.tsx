import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, Group, Progress, Select, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconChevronLeft, IconFileImport, IconFiles, IconFolder, IconX } from '@tabler/icons-react';
import { isSongFile, parsePptx, sameBundleName, type BundleSong } from '@vo/shared';
import { api } from '../api';
import { useEffectiveSource } from '../dataSourceStore';
import { plural } from '../lib/plural';

/** The Select value for «a new bundle». */
const NEW = '__new__';
const SONGS: [string, string, string] = ['пісню', 'пісні', 'пісень'];

interface Found {
  songs: BundleSong[];
  /** files that aren't songs: not a readable .pptx, or no slide with text */
  failed: string[];
}

/** Read .pptx files in the browser, a few at a time so the page keeps responding. */
async function readSongs(files: File[], onProgress: (done: number) => void): Promise<Found> {
  const byKey = new Map<string, BundleSong>();
  const failed: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const song = parsePptx(new Uint8Array(await f.arrayBuffer()), f.name);
      // one file name twice (two subfolders): the later one wins, as in the bundle
      if (song) byKey.set(song.key, song);
      else failed.push(f.name);
    } catch {
      failed.push(f.name);
    }
    if (i % 8 === 7) {
      onProgress(i + 1);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress(files.length);
  return { songs: [...byKey.values()], failed };
}

/**
 * Import songs (0.10.1): pick .pptx files or a folder — they are read here, in the browser —
 * then the bundle they go into, or a name for a new one. The server writes the bundle file
 * and brings the library's songs up to date.
 */
export function SongImport({
  preferred,
  onDone,
  onBack,
  onClose,
}: {
  /** the bundle the songs panel is filtered to: where to by default */
  preferred: string;
  /** after an import: the name of the bundle the songs went into */
  onDone: (bundle: string) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  /** a bundle id, NEW, null = not chosen yet; undefined until the bundles are known */
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const local = useEffectiveSource() === 'local';
  const bundles = useQuery({ queryKey: ['song-bundle-files'], queryFn: api.songBundleFiles });

  // a folder picker: `webkitdirectory` isn't among React's input props
  useEffect(() => folderRef.current?.setAttribute('webkitdirectory', ''), []);
  // where to by default: the bundle the panel shows, or the only one, or a new one when
  // there is none; with several and none shown the operator chooses — a wrong bundle
  // would take the songs in
  useEffect(() => {
    if (target !== undefined || !bundles.data) return;
    const all = bundles.data;
    const shown = all.find((b) => b.name === preferred);
    setTarget(shown?.id ?? (all.length === 1 ? all[0].id : all.length === 0 ? NEW : null));
  }, [bundles.data, target, preferred]);

  const pick = async (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => isSongFile(f.webkitRelativePath || f.name));
    if (files.length === 0) {
      notifications.show({
        message: 'Файлів .pptx тут немає — виберіть інші файли або папку',
        color: 'orange',
        autoClose: 4000,
      });
      return;
    }
    setFound(null);
    setReading({ done: 0, total: files.length });
    try {
      setFound(await readSongs(files, (done) => setReading({ done, total: files.length })));
    } finally {
      setReading(null);
    }
  };

  const count = found?.songs.length ?? 0;
  const trimmed = name.trim();
  const taken =
    target === NEW && trimmed !== ''
      ? bundles.data?.find((b) => sameBundleName(b.name, trimmed))
      : undefined;
  const ready = count > 0 && !!target && (target !== NEW || (trimmed !== '' && !taken)) && !busy;

  const run = async () => {
    if (!found || !ready || !target) return;
    setBusy(true);
    try {
      const r = await api.importSongs(
        target === NEW ? { name: trimmed } : { id: target },
        found.songs,
      );
      notifications.show({
        message: `Імпортовано в «${r.bundle.name}»: нових ${r.added}, оновлено ${r.updated}`,
        color: 'green',
        autoClose: 3000,
      });
      for (const key of ['songs', 'song', 'song-bundles', 'song-bundle-files']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      onDone(r.bundle.name);
    } catch (e) {
      notifications.show({
        message: `Не вдалося імпортувати: ${(e as Error).message}`,
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    void pick(e.currentTarget.files);
    e.currentTarget.value = ''; // the same choice again reads the files again
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <ActionIcon variant="subtle" onClick={onBack} aria-label="Назад до пошуку">
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600} size="sm">
            Імпорт пісень
          </Text>
        </Group>
        <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Закрити">
          <IconX size={18} />
        </ActionIcon>
      </Group>

      <div>
        <Text size="sm" fw={500} mb={4}>
          Звідки
        </Text>
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconFiles size={14} />}
            disabled={!!reading || busy}
            onClick={() => filesRef.current?.click()}
          >
            Файли .pptx…
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconFolder size={14} />}
            disabled={!!reading || busy}
            onClick={() => folderRef.current?.click()}
          >
            Папка…
          </Button>
        </Group>
        <input ref={filesRef} type="file" accept=".pptx" multiple hidden onChange={onFiles} />
        <input ref={folderRef} type="file" hidden onChange={onFiles} />
        {reading && (
          <Stack gap={4} mt="xs">
            <Progress value={(reading.done / reading.total) * 100} size="sm" />
            <Text size="xs" c="dimmed">
              Читаю файли: {reading.done} з {reading.total}
            </Text>
          </Stack>
        )}
        {found && (
          <Stack gap={2} mt="xs">
            <Text size="sm">
              {count > 0
                ? `Знайдено ${count} ${plural(count, SONGS)}.`
                : 'Пісень у цих файлах немає.'}
            </Text>
            {found.failed.length > 0 && (
              <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                Пропущено (не прочиталися або без тексту): {found.failed.slice(0, 5).join(', ')}
                {found.failed.length > 5 && ` і ще ${found.failed.length - 5}`}
              </Text>
            )}
          </Stack>
        )}
      </div>

      <div>
        <Select
          size="sm"
          label="Куди"
          data={[
            ...(bundles.data ?? []).map((b) => ({ value: b.id, label: `${b.name} (${b.count})` })),
            { value: NEW, label: 'Новий бандл…' },
          ]}
          value={target ?? null}
          onChange={(v) => setTarget(v)}
          placeholder="Виберіть бандл"
          allowDeselect={false}
          disabled={busy}
          comboboxProps={{ withinPortal: true }}
        />
        {target === NEW ? (
          <TextInput
            mt="xs"
            size="sm"
            label="Назва нового бандла"
            placeholder="Наприклад, Молодіжні"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={100}
            disabled={busy}
            error={taken ? `Бандл «${taken.name}» уже є — виберіть його в списку «Куди»` : null}
          />
        ) : (
          target && (
            <Text size="xs" c="dimmed" mt={4}>
              Пісня з такою самою назвою файлу, що вже є в бандлі, замінюється новою.
            </Text>
          )
        )}
      </div>

      {local && (
        <Text size="xs" c="dimmed">
          Джерело даних — «у браузері»: пісні з’являться тут після перезбирання сегментів (npm run
          build:segments). З джерелом «Сервер» вони видні одразу.
        </Text>
      )}

      <Group justify="flex-end">
        <Button
          size="sm"
          leftSection={<IconFileImport size={16} />}
          disabled={!ready}
          loading={busy}
          onClick={() => void run()}
        >
          {count > 0 ? `Імпортувати ${count} ${plural(count, SONGS)}` : 'Імпортувати'}
        </Button>
      </Group>
    </Stack>
  );
}
