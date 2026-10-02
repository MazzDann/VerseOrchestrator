import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IconArrowBackUp,
  IconLibraryPhoto,
  IconPlaylistAdd,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { api, type ImageInfo } from '../api';
import { fileToPicture } from '../lib/image';
import { type SlidePicture } from '../presenterBus';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { tr, trn, useLang } from '../i18n';

type Fit = SlidePicture['fit'];
const FIT_KEY = 'vo:imageFit';
const readFit = (): Fit => {
  try {
    return localStorage.getItem(FIT_KEY) === 'cover' ? 'cover' : 'contain';
  } catch {
    return 'contain';
  }
};

/** A picture as a slide shows it. */
const asPicture = (img: ImageInfo, fit: Fit): SlidePicture => ({
  src: img.src,
  small: img.small,
  name: img.name,
  fit,
});

/**
 * «Зображення» (1.5.0): pictures on screen — an inline tool of the centre column, like the songs.
 * «Додати…» takes PNG, JPEG, WebP or GIF files; the browser prepares them (lib/image.ts
 * `fileToPicture`) and the server keeps them in data/images/. A click on a picture puts it on
 * screen, as a click on a stanza does; its buttons add it to the running order or delete it —
 * the deleted one says «Видалено: …» with «Скасувати» in its place. «Вписати» shows the whole
 * picture with bands of black, «Заповнити» fills the slide and cuts the edges.
 */
export function ImagesPanel({
  open,
  onClose,
  onProject,
  onAddToPlaylist,
  onScreen,
}: {
  open: boolean;
  onClose: () => void;
  onProject: (picture: SlidePicture) => void;
  onAddToPlaylist: (img: ImageInfo, fit: Fit) => void;
  /** the address of the picture on screen now, if one is */
  onScreen: string | null;
}) {
  useLang();
  const queryClient = useQueryClient();
  const serverAvailable = useServer((s) => s.available);
  const images = useQuery({
    queryKey: ['images'],
    queryFn: api.images,
    enabled: open && serverAvailable !== false,
  });
  const [fit, setFitState] = useState<Fit>(readFit);
  const setFit = (f: Fit) => {
    setFitState(f);
    try {
      localStorage.setItem(FIT_KEY, f);
    } catch {
      /* a per-viewer convenience: not kept is fine */
    }
  };
  const [adding, setAdding] = useState<{ done: number; of: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<{ trashed: string; name: string; at: number } | null>(
    null,
  );
  const undoRef = useRef<HTMLButtonElement>(null);
  // the picker forgets its files after each pick: the same ones picked again count again
  const resetPicker = useRef<() => void>(null);
  useEffect(() => {
    if (deleted) undoRef.current?.focus();
  }, [deleted]);
  useEffect(() => {
    if (!open) {
      setDeleted(null);
      setFailed([]);
    }
  }, [open]);

  if (!open) return null;

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['images'] });
  const add = async (files: File[]) => {
    if (files.length === 0) return;
    setFailed([]);
    const bad: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setAdding({ done: i, of: files.length });
      try {
        await api.addImage(await fileToPicture(files[i]));
      } catch (e) {
        bad.push(`${files[i].name} — ${tr((e as Error).message)}`);
      }
    }
    setAdding(null);
    resetPicker.current?.();
    setFailed(bad);
    refresh();
    const ok = files.length - bad.length;
    if (ok > 0)
      notifications.show({
        message: trn(ok, 'Додано {n} зображення|Додано {n} зображення|Додано {n} зображень'),
        color: 'green',
        autoClose: 1500,
      });
  };
  const remove = async (img: ImageInfo, at: number) => {
    try {
      const r = await api.deleteImage(img.id);
      setDeleted({ ...r, at });
      refresh();
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    }
  };
  const restore = async () => {
    if (!deleted) return;
    try {
      await api.restoreImage(deleted.trashed);
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    }
    setDeleted(null);
    refresh();
  };

  const list = images.data ?? [];
  const tiles = list.map((img, i) => (
    <div key={img.id} className="vo-image-tile" data-live={img.src === onScreen || undefined}>
      <button
        type="button"
        className="vo-image-pick"
        onClick={() => onProject(asPicture(img, fit))}
        title={img.name}
        aria-label={tr('Показати «{name}»', { name: img.name })}
      >
        <img src={img.small} alt="" loading="lazy" />
      </button>
      <Text size="xs" truncate title={img.name} px={4} py={2}>
        {img.name}
      </Text>
      <Group gap={2} className="vo-image-actions" wrap="nowrap">
        <Tooltip label={tr('Додати в послідовність показу')} withArrow>
          <ActionIcon
            size="sm"
            variant="default"
            onClick={() => onAddToPlaylist(img, fit)}
            aria-label={tr('Додати «{name}» в послідовність показу', { name: img.name })}
          >
            <IconPlaylistAdd size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={tr('Видалити зображення')} withArrow>
          <ActionIcon
            size="sm"
            variant="default"
            color="red"
            onClick={() => void remove(img, i)}
            aria-label={tr('Видалити «{name}»', { name: img.name })}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </div>
  ));
  if (deleted)
    tiles.splice(
      Math.min(deleted.at, tiles.length),
      0,
      <div key="deleted" className="vo-image-tile" data-deleted>
        <Text size="xs" c="dimmed" ta="center" px={4} lineClamp={2}>
          {tr('Видалено: {name}', { name: deleted.name })}
        </Text>
        <Button
          ref={undoRef}
          size="compact-xs"
          variant="light"
          leftSection={<IconArrowBackUp size={14} />}
          onClick={() => void restore()}
        >
          {tr('Скасувати')}
        </Button>
      </div>,
    );

  return (
    <Paper withBorder shadow="sm" p="sm" m="sm">
      <Group justify="space-between" wrap="nowrap" mb="xs">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <IconLibraryPhoto size={18} stroke={1.5} />
          <Text fw={600} size="sm">
            {tr('Зображення')}
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <SegmentedControl
            size="xs"
            value={fit}
            onChange={(v) => setFit(v as Fit)}
            data={[
              { value: 'contain', label: tr('Вписати') },
              { value: 'cover', label: tr('Заповнити') },
            ]}
            aria-label={tr('Як зображення займає слайд')}
          />
          <FileButton
            onChange={(files) => void add(files)}
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            resetRef={resetPicker}
            disabled={serverAvailable === false || !!adding}
          >
            {(props) => (
              <Button
                {...props}
                size="xs"
                variant="light"
                leftSection={<IconUpload size={14} />}
                loading={!!adding}
              >
                {tr('Додати…')}
              </Button>
            )}
          </FileButton>
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label={tr('Закрити')}>
            <IconX size={18} />
          </ActionIcon>
        </Group>
      </Group>
      {serverAvailable === false ? (
        <Text size="sm" c="dimmed">
          {tr(NEEDS_SERVER)}
        </Text>
      ) : (
        <>
          {adding && (
            <Text size="xs" c="dimmed" mb={4}>
              {tr('Додаю {n} з {of}…', { n: adding.done + 1, of: adding.of })}
            </Text>
          )}
          {failed.length > 0 && (
            <Text size="xs" c="red" mb={4} style={{ whiteSpace: 'pre-line' }}>
              {tr('Не вдалося додати:')}
              {'\n'}
              {failed.join('\n')}
            </Text>
          )}
          {images.isSuccess && list.length === 0 && !deleted ? (
            <Text size="sm" c="dimmed">
              {tr(
                'Зображень ще немає. Натисніть «Додати…» і виберіть файли PNG, JPEG, WebP чи GIF.',
              )}
            </Text>
          ) : (
            <ScrollArea.Autosize mah="min(320px, 30vh)">
              <div className="vo-image-grid">{tiles}</div>
            </ScrollArea.Autosize>
          )}
        </>
      )}
    </Paper>
  );
}
