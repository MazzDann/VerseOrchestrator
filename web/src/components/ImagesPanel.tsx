import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  Paper,
  Popover,
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
import { api, type AlbumInfo, type ImageInfo } from '../api';
import { fileToPicture } from '../lib/image';
import { readImageFit, storeImageFit, type ImageFit } from '../lib/imageFit';
import { type SlidePicture } from '../presenterBus';
import { usePlaylist, type SeqItem } from '../playlistStore';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { tr, trn, useLang } from '../i18n';
import type { useAlbum } from '../pages/control/useAlbum';
import { AlbumsView } from './AlbumsView';

type Fit = ImageFit;

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
 * picture with bands of black, «Заповнити» fills the slide and cuts the edges — the picture on
 * screen too, at once (1.7.1, the user's call). A picture in use — on screen, in the running order
 * or a saved program — is deleted only after a question that says where (1.7.2). «Альбоми»
 * (1.8.12): folders of photos on this computer, shown in turn (AlbumsView).
 */
export function ImagesPanel({
  open,
  onClose,
  onProject,
  onRefit,
  onAddToPlaylist,
  onDeleted,
  onScreen,
  albums,
  onAddAlbumToPlaylist,
}: {
  open: boolean;
  onClose: () => void;
  onProject: (picture: SlidePicture) => void;
  /** the switch moved: the picture on screen takes it too */
  onRefit: (fit: Fit) => void;
  /** a picture was deleted (1.7.2): off the screen with it, if it is there */
  onDeleted: (src: string) => void;
  onAddToPlaylist: (img: ImageInfo, fit: Fit) => void;
  /** the address of the picture on screen now, if one is */
  onScreen: string | null;
  /** the album open in the control window (pages/control/useAlbum.ts) */
  albums: ReturnType<typeof useAlbum>;
  onAddAlbumToPlaylist: (album: AlbumInfo, fit: Fit) => void;
}) {
  useLang();
  const queryClient = useQueryClient();
  const serverAvailable = useServer((s) => s.available);
  const images = useQuery({
    queryKey: ['images'],
    queryFn: api.images,
    enabled: open && serverAvailable !== false && !albums.albumsTab,
  });
  const [fit, setFitState] = useState<Fit>(readImageFit);
  const setFit = (f: Fit) => {
    setFitState(f);
    storeImageFit(f);
    onRefit(f);
  };
  const [adding, setAdding] = useState<{ done: number; of: number } | null>(null);
  // the picture whose deletion asks first (1.7.2)
  const [asking, setAsking] = useState<string | null>(null);
  const order = usePlaylist((s) => s.items);
  const programs = usePlaylist((s) => s.saved);
  /** Where a picture is in use: on screen, in the running order (items), in saved programs. */
  const usageOf = (img: ImageInfo) => {
    const uses = (list: SeqItem[]) =>
      list.filter((it) => it.kind === 'image' && it.imageId === img.id).length;
    return {
      screen: img.src === onScreen,
      order: uses(order),
      programs: programs.filter((p) => uses(p.items) > 0).map((p) => p.name),
    };
  };
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
      onDeleted(img.src);
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
  const tiles = list.map((img, i) => {
    const use = usageOf(img);
    const inUse = use.screen || use.order > 0 || use.programs.length > 0;
    return (
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
          <Popover
            opened={asking === img.id}
            onChange={(o) => !o && setAsking(null)}
            position="bottom-end"
            withArrow
            shadow="md"
          >
            <Popover.Target>
              <Tooltip label={tr('Видалити зображення')} withArrow>
                <ActionIcon
                  size="sm"
                  variant="default"
                  color="red"
                  onClick={() => (inUse ? setAsking(img.id) : void remove(img, i))}
                  aria-label={tr('Видалити «{name}»', { name: img.name })}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown maw={280}>
              <Text size="xs" fw={500} mb={4}>
                {tr('Видалити «{name}»?', { name: img.name })}
              </Text>
              {use.screen && (
                <Text size="xs" c="dimmed">
                  {tr('Воно зараз на екрані: застосунок прибере його з екрана.')}
                </Text>
              )}
              {use.order > 0 && (
                <Text size="xs" c="dimmed">
                  {trn(
                    use.order,
                    'Воно є в послідовності показу: {n} пункт.|Воно є в послідовності показу: {n} пункти.|Воно є в послідовності показу: {n} пунктів.',
                  )}
                </Text>
              )}
              {use.programs.length > 0 && (
                <Text size="xs" c="dimmed">
                  {tr('Воно є в програмах: {names}.', { names: use.programs.join(', ') })}
                </Text>
              )}
              {(use.order > 0 || use.programs.length > 0) && (
                <Text size="xs" c="dimmed">
                  {tr('Ці пункти лишаться з позначкою «Зображення видалено».')}
                </Text>
              )}
              <Group gap="xs" justify="flex-end" mt="xs">
                <Button size="xs" variant="default" onClick={() => setAsking(null)}>
                  {tr('Скасувати')}
                </Button>
                <Button
                  size="xs"
                  color="red"
                  onClick={() => {
                    setAsking(null);
                    void remove(img, i);
                  }}
                >
                  {tr('Видалити')}
                </Button>
              </Group>
            </Popover.Dropdown>
          </Popover>
        </Group>
      </div>
    );
  });
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
          <SegmentedControl
            size="xs"
            value={albums.albumsTab ? 'albums' : 'images'}
            onChange={(v) => albums.setAlbumsTab(v === 'albums')}
            data={[
              { value: 'images', label: tr('Зображення') },
              { value: 'albums', label: tr('Альбоми') },
            ]}
            aria-label={tr('Зображення чи альбоми з папок')}
          />
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
          {!albums.albumsTab && (
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
          )}
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label={tr('Закрити')}>
            <IconX size={18} />
          </ActionIcon>
        </Group>
      </Group>
      {serverAvailable === false ? (
        <Text size="sm" c="dimmed">
          {tr(NEEDS_SERVER)}
        </Text>
      ) : albums.albumsTab ? (
        <AlbumsView
          show={albums}
          onScreen={onScreen}
          onAddToPlaylist={(a) => onAddAlbumToPlaylist(a, fit)}
        />
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
