import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Popover,
  ScrollArea,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IconArrowLeft,
  IconArrowUp,
  IconChevronLeft,
  IconChevronRight,
  IconFolder,
  IconFolderCheck,
  IconFolderPlus,
  IconHome,
  IconMovie,
  IconPhoto,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlaylistAdd,
  IconRefresh,
  IconStack2,
  IconTrash,
} from '@tabler/icons-react';
import { api, type AlbumInfo, type FolderList } from '../api';
import { photoTitle } from '../lib/album';
import { addRefusal, deniedHint } from '../lib/denied';
import type { useAlbum } from '../pages/control/useAlbum';
import { EVERY_MAX, EVERY_MIN } from '../pages/control/useAlbum';
import { usePlaylist, type SeqItem } from '../playlistStore';
import { tr, trn, useLang } from '../i18n';

type AlbumShow = ReturnType<typeof useAlbum>;

/**
 * «Альбоми» in «Зображення» (1.8.12, F1005-13): folders of photos on this computer, read where
 * they are — new photos in the folder are there the next time the album opens. The list, the
 * folder picker («Додати папку…») and an open album: its photos in turn (a click, ← →, the
 * clicker, a remote) or «Міняти кожні N с». The album's state lives in the control window
 * (pages/control/useAlbum.ts), so closing the panel keeps it.
 */
export function AlbumsView({
  show,
  onScreen,
  onAddToPlaylist,
}: {
  show: AlbumShow;
  /** the address of the picture on screen now, if one is */
  onScreen: string | null;
  onAddToPlaylist: (album: AlbumInfo) => void;
}) {
  useLang();
  const [picking, setPicking] = useState(false);
  if (picking)
    return (
      <FolderPicker
        mode="album"
        onDone={() => setPicking(false)}
        onAdded={(id) => show.openAlbum(id)}
      />
    );
  if (show.album)
    return <OpenAlbumView show={show} onScreen={onScreen} onAddToPlaylist={onAddToPlaylist} />;
  return (
    <AlbumList
      onPick={() => setPicking(true)}
      openAlbum={(id) => show.openAlbum(id)}
      onAddToPlaylist={onAddToPlaylist}
    />
  );
}

/** The albums, with their photo counts; a click opens one. */
function AlbumList({
  onPick,
  openAlbum,
  onAddToPlaylist,
}: {
  onPick: () => void;
  openAlbum: (id: string) => void;
  onAddToPlaylist: (album: AlbumInfo) => void;
}) {
  const queryClient = useQueryClient();
  const albums = useQuery({ queryKey: ['albums'], queryFn: api.albums, staleTime: 0 });
  const [asking, setAsking] = useState<string | null>(null);
  const order = usePlaylist((s) => s.items);
  const programs = usePlaylist((s) => s.saved);
  const usesOf = (id: string) => {
    const uses = (list: SeqItem[]) =>
      list.filter((it) => it.kind === 'album' && it.albumId === id).length;
    return { order: uses(order), programs: programs.filter((p) => uses(p.items) > 0).length };
  };
  const remove = async (a: AlbumInfo) => {
    setAsking(null);
    try {
      await api.removeAlbum(a.id);
      notifications.show({
        message: tr('Альбом прибрано: {name}', { name: a.name }),
        color: 'green',
        autoClose: 1500,
      });
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    }
    void queryClient.invalidateQueries({ queryKey: ['albums'] });
  };
  const list = albums.data ?? [];
  return (
    <>
      <Group justify="space-between" wrap="nowrap" mb={6}>
        <Text size="xs" c="dimmed">
          {tr('Фото з папок на цьому комп’ютері — без копій: нові фото в папці з’являються самі.')}
        </Text>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconFolderPlus size={14} />}
          onClick={onPick}
          style={{ flexShrink: 0 }}
        >
          {tr('Додати папку…')}
        </Button>
      </Group>
      {albums.isError ? (
        <Text size="sm" c="red">
          {tr((albums.error as Error).message)}
        </Text>
      ) : albums.isSuccess && list.length === 0 ? (
        <Text size="sm" c="dimmed">
          {tr('Альбомів ще немає. Натисніть «Додати папку…» і виберіть папку з фото.')}
        </Text>
      ) : (
        <ScrollArea.Autosize
          mah="var(--vo-cap, min(320px, 30vh))"
          scrollbars="y"
          className="vo-scroll-fit"
        >
          {list.map((a) => {
            const use = usesOf(a.id);
            return (
              <div key={a.id} className="vo-album-row">
                <button
                  type="button"
                  className="vo-album-open"
                  onClick={() => openAlbum(a.id)}
                  aria-label={tr('Відкрити альбом «{name}»', { name: a.name })}
                >
                  <IconFolder size={16} stroke={1.5} />
                  <span className="vo-album-text">
                    <Text size="sm" fw={500} truncate>
                      {a.name}
                    </Text>
                    <Text size="xs" c={a.missing ? 'orange' : 'dimmed'} truncate title={a.path}>
                      {/* a refused folder is `missing` too (albums.ts albumEntry): `denied` first */}
                      {a.elsewhere
                        ? tr('Папка з іншого комп’ютера: {path}', { path: a.path })
                        : a.denied
                          ? tr('Немає доступу до папки: {path}', { path: a.path })
                          : a.missing
                            ? tr('Папку не знайдено: {path}', { path: a.path })
                            : `${trn(a.count, '{n} фото|{n} фото|{n} фото')} · ${a.path}`}
                    </Text>
                  </span>
                </button>
                <Group gap={2} wrap="nowrap">
                  <Tooltip label={tr('Додати в послідовність показу')} withArrow>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      onClick={() => onAddToPlaylist(a)}
                      aria-label={tr('Додати «{name}» в послідовність показу', { name: a.name })}
                    >
                      <IconPlaylistAdd size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Popover
                    opened={asking === a.id}
                    onChange={(o) => !o && setAsking(null)}
                    position="bottom-end"
                    withArrow
                    shadow="md"
                  >
                    <Popover.Target>
                      <Tooltip label={tr('Прибрати альбом')} withArrow>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => setAsking(a.id)}
                          aria-label={tr('Прибрати альбом «{name}»', { name: a.name })}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Popover.Target>
                    <Popover.Dropdown maw={280}>
                      <Text size="xs" fw={500} mb={4}>
                        {tr('Прибрати альбом «{name}»?', { name: a.name })}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {tr('Папка й фото лишаться на місці; додати її можна знову.')}
                      </Text>
                      {use.order + use.programs > 0 && (
                        <Text size="xs" c="dimmed">
                          {tr(
                            'Пункти послідовності показу й програм з ним лишаться з позначкою «Альбом прибрано».',
                          )}
                        </Text>
                      )}
                      <Group gap="xs" justify="flex-end" mt="xs">
                        <Button size="xs" variant="default" onClick={() => setAsking(null)}>
                          {tr('Скасувати')}
                        </Button>
                        <Button size="xs" color="red" onClick={() => void remove(a)}>
                          {tr('Прибрати')}
                        </Button>
                      </Group>
                    </Popover.Dropdown>
                  </Popover>
                </Group>
              </div>
            );
          })}
        </ScrollArea.Autosize>
      )}
    </>
  );
}

/** «Додати папку…»: the computer's folders, from home, Pictures and the drives. */
/**
 * The computer's folders, from home, Pictures and the drives: «Додати папку…» adds the folder shown
 * as an album; «Додати відео…» (1.8.12-beta.3, `mode="video"`) lists its video files too, and a
 * click on one adds it.
 */
export function FolderPicker({
  mode,
  onDone,
  onAdded,
  onPick,
}: {
  /** «copy» (1.12.0-beta.2): a folder of another copy of the app, given to `onPick` */
  mode: 'album' | 'video' | 'copy';
  onDone: () => void;
  /** the album or the video just added */
  onAdded?: (id: string) => void;
  onPick?: (path: string) => void;
}) {
  useLang();
  const queryClient = useQueryClient();
  const [path, setPath] = useState<string | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const folders = useQuery<FolderList>({
    queryKey: ['folders', path ?? '', mode],
    queryFn: () => api.browseFolders(path, mode === 'video' ? 'video' : undefined),
    staleTime: 0,
  });
  const here = folders.data;
  // the path field: the folder shown, or one pasted
  const [draft, setDraft] = useState('');
  // the folder once it is read: a path that is not there keeps what was typed (review)
  useEffect(() => {
    if (here) setDraft(here.path ?? '');
  }, [here]);
  // sent as it is: the server reads quotes, ~, file:// and «My\ Photos» (albums.ts pastedPath —
  // its home and its separator; Mac check of 1.9.0) when the path as it is names nothing — a
  // folder «Свято » keeps its space (review) — and a file's path opens its folder
  const go = () => setPath(draft.trim() ? draft : undefined);
  // the file a pasted path named, marked among the folder's videos
  const picked = here?.file?.normalize('NFC');
  const add = async () => {
    if (!here?.path) return;
    setAdding(true);
    try {
      const a = await api.addAlbum(here.path);
      await queryClient.invalidateQueries({ queryKey: ['albums'] });
      notifications.show({
        message: tr('Альбом додано: {name}', { name: a.name }),
        color: 'green',
        autoClose: 1500,
      });
      onDone();
      onAdded?.(a.id);
    } catch (e) {
      notifications.show({ message: addRefusal(e, 'folder'), color: 'red' });
    } finally {
      setAdding(false);
    }
  };
  const addVideo = async (file: string) => {
    setAdding(true);
    try {
      const v = await api.addVideo(file);
      await queryClient.invalidateQueries({ queryKey: ['videos'] });
      notifications.show({
        message: tr('Відео додано: {name}', { name: v.name }),
        color: 'green',
        autoClose: 1500,
      });
      onDone();
      onAdded?.(v.id);
    } catch (e) {
      notifications.show({ message: addRefusal(e, 'file'), color: 'red' });
    } finally {
      setAdding(false);
    }
  };
  const mb = (bytes: number) => `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} МБ`; // i18n-ignore
  const files = mode === 'video' ? (here?.videos ?? []) : [];
  const startName = (f: FolderList['folders'][number]) =>
    f.kind === 'home' ? tr('Домашня папка ({name})', { name: f.name }) : f.name;
  const startIcon = (f: FolderList['folders'][number]) =>
    f.kind === 'home' ? (
      <IconHome size={14} />
    ) : f.kind === 'drive' ? (
      <IconStack2 size={14} />
    ) : f.kind === 'pictures' ? (
      <IconPhoto size={14} />
    ) : (
      <IconFolder size={14} />
    );
  return (
    <>
      <Group gap={6} wrap="nowrap" mb={6}>
        <Tooltip label={tr('Угору')} withArrow>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            disabled={!folders.isError && !here?.path}
            onClick={() => setPath(folders.isError ? undefined : (here?.parent ?? undefined))}
            aria-label={tr('Угору')}
          >
            <IconArrowUp size={14} />
          </ActionIcon>
        </Tooltip>
        <TextInput
          size="xs"
          style={{ flex: 1, minWidth: 0 }}
          value={draft}
          placeholder={tr('Виберіть папку нижче або вставте шлях до неї')}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              go();
            }
          }}
          aria-label={tr('Шлях до папки')}
        />
      </Group>
      {folders.isError ? (
        <Text size="sm" c="red" mb={6}>
          {tr((folders.error as Error).message)}
        </Text>
      ) : (
        <ScrollArea.Autosize
          mah="var(--vo-cap, min(260px, 28vh))"
          mb={6}
          scrollbars="y"
          className="vo-scroll-fit"
        >
          {here?.denied ? (
            <Text size="sm" c="dimmed">
              {deniedHint('folder', 'pick')}
            </Text>
          ) : here && here.folders.length === 0 && files.length === 0 ? (
            <Text size="sm" c="dimmed">
              {mode === 'video'
                ? tr('Тут немає ні папок, ні відео.')
                : tr('Тут немає вкладених папок.')}
            </Text>
          ) : (
            (here?.folders ?? []).map((f) => (
              <div
                key={f.path}
                className="vo-list-item vo-folder-row"
                role="button"
                tabIndex={0}
                onClick={() => setPath(f.path)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPath(f.path);
                  }
                }}
                title={f.path}
              >
                {startIcon(f)}
                <span>{here?.path ? f.name : startName(f)}</span>
              </div>
            ))
          )}
          {files.map((f) => (
            <div
              key={f.path}
              className="vo-list-item vo-folder-row"
              data-selected={f.path.normalize('NFC') === picked || undefined}
              role="button"
              tabIndex={0}
              aria-label={tr('Додати відео «{name}»', { name: f.name })}
              onClick={() => !adding && void addVideo(f.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!adding) void addVideo(f.path);
                }
              }}
              title={f.path}
            >
              <IconMovie size={14} />
              <span>{f.name}</span>
              <Text span size="xs" c="dimmed" ml="auto" style={{ flexShrink: 0 }}>
                {mb(f.size)}
              </Text>
            </div>
          ))}
        </ScrollArea.Autosize>
      )}
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="xs" c="dimmed" style={{ minWidth: 0 }}>
          {/* a folder the system won't open has nothing to count: the hint above says why */}
          {mode === 'video' && here?.path && !here.denied
            ? `${
                files.length > 0
                  ? tr('Натисніть відео, щоб додати його.')
                  : tr('У цій папці немає відео MP4, MOV, WebM чи MKV.')
              }${
                here.unplayable
                  ? ` ${trn(here.unplayable, '{n} відео браузер не відтворить (AVI, WMV…) — збережіть його як MP4.|{n} відео браузер не відтворить (AVI, WMV…) — збережіть їх як MP4.|{n} відео браузер не відтворить (AVI, WMV…) — збережіть їх як MP4.')}`
                  : ''
              }`
            : null}
          {mode !== 'album' || here?.denied
            ? null
            : here?.path
              ? here.photos > 0
                ? trn(here.photos, 'У цій папці {n} фото|У цій папці {n} фото|У цій папці {n} фото')
                : tr('У цій папці немає фото — відкрийте папку, де вони лежать.')
              : ''}
          {mode === 'album' && here?.path && here.heic > 0
            ? ` ${trn(here.heic, '{n} фото HEIC не покажуться — браузери їх не відкривають.|{n} фото HEIC не покажуться — браузери їх не відкривають.|{n} фото HEIC не покажуться — браузери їх не відкривають.')}`
            : ''}
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="default" onClick={onDone}>
            {tr('Скасувати')}
          </Button>
          {mode === 'copy' && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconFolderCheck size={14} />}
              disabled={!here?.path || here.denied}
              onClick={() => here?.path && onPick?.(here.path)}
            >
              {tr('Вибрати цю папку')}
            </Button>
          )}
          {mode === 'album' && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconFolderPlus size={14} />}
              disabled={!here?.path || here.denied}
              loading={adding}
              onClick={() => void add()}
            >
              {tr('Додати цю папку')}
            </Button>
          )}
        </Group>
      </Group>
    </>
  );
}

/** An open album: its photos in folder order, the steps and «Міняти кожні N с». */
function OpenAlbumView({
  show,
  onScreen,
  onAddToPlaylist,
}: {
  show: AlbumShow;
  onScreen: string | null;
  onAddToPlaylist: (album: AlbumInfo) => void;
}) {
  const info = show.albumInfo;
  const photos = show.photos ?? [];
  const viewport = useRef<HTMLDivElement>(null);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  // the photo stepped to stays in sight
  const current = show.current;
  // «Міняти кожні N с» as typed: kept once it is 2–600, the field set right when it is left
  const [everyDraft, setEveryDraft] = useState<string | number>(show.every);
  useEffect(() => setEveryDraft(show.every), [show.every]);
  useEffect(() => {
    if (current != null) tiles.current[current]?.scrollIntoView({ block: 'nearest' });
  }, [current]);
  return (
    <>
      <Group justify="space-between" wrap="nowrap" mb={4} gap="xs">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Tooltip label={tr('До альбомів')} withArrow>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => show.openAlbum(null)}
              aria-label={tr('До альбомів')}
            >
              <IconArrowLeft size={14} />
            </ActionIcon>
          </Tooltip>
          <Text size="sm" fw={600} truncate title={info?.path}>
            {info?.name ?? tr('Альбом')}
          </Text>
          {info && !info.missing && (
            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
              {show.current != null
                ? `${show.current + 1} / ${info.count}`
                : trn(info.count, '{n} фото|{n} фото|{n} фото')}
            </Text>
          )}
        </Group>
        <Group gap={2} wrap="nowrap">
          <Tooltip label={tr('Оновити: фото, додані в папку')} withArrow>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={show.reloadAlbum}
              aria-label={tr('Оновити альбом')}
            >
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
          {info && (
            <Tooltip label={tr('Додати в послідовність показу')} withArrow>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={() => onAddToPlaylist(info)}
                aria-label={tr('Додати «{name}» в послідовність показу', { name: info.name })}
              >
                <IconPlaylistAdd size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
      <Group gap={4} wrap="nowrap" mb={6}>
        <Tooltip label={tr('Попереднє фото (←)')} withArrow>
          <ActionIcon
            size="sm"
            variant="default"
            onClick={() => show.stepBy(-1)}
            disabled={photos.length === 0}
            aria-label={tr('Попереднє фото')}
          >
            <IconChevronLeft size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={tr('Наступне фото (→)')} withArrow>
          <ActionIcon
            size="sm"
            variant="default"
            onClick={() => show.stepBy(1)}
            disabled={photos.length === 0}
            aria-label={tr('Наступне фото')}
          >
            <IconChevronRight size={14} />
          </ActionIcon>
        </Tooltip>
        <Text size="xs" c="dimmed" ml="xs" style={{ whiteSpace: 'nowrap' }}>
          {tr('Міняти кожні')}
        </Text>
        <NumberInput
          size="xs"
          w={52}
          min={EVERY_MIN}
          max={EVERY_MAX}
          value={everyDraft}
          onChange={(v) => {
            setEveryDraft(v);
            if (typeof v === 'number' && v >= EVERY_MIN && v <= EVERY_MAX) show.setEvery(v);
          }}
          onBlur={() => setEveryDraft(show.every)}
          hideControls
          aria-label={tr('Міняти фото кожні … секунд')}
        />
        <Text size="xs" c="dimmed">
          {tr('с')}
        </Text>
        <Button
          size="xs"
          variant="light"
          ml={4}
          leftSection={show.playing ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
          disabled={photos.length === 0}
          onClick={() => (show.playing ? show.pause() : show.play())}
        >
          {show.playing ? tr('Пауза') : tr('Пуск')}
        </Button>
      </Group>
      {show.albumError ? (
        <Text size="sm" c="red">
          {tr(show.albumError.message)}
        </Text>
      ) : info?.elsewhere ? (
        <Text size="sm" c="dimmed">
          {tr(
            'Папку «{path}» додано на іншому комп’ютері — тут її немає. Відкрийте альбом там або додайте папку цього комп’ютера.',
            { path: info.path },
          )}
        </Text>
      ) : info?.denied ? (
        // before `missing`, which a refused folder is too: where to allow it, not «plug it in»
        <Text size="sm" c="dimmed">
          {deniedHint('folder', 'refresh')}
        </Text>
      ) : info?.missing ? (
        <Text size="sm" c="dimmed">
          {tr('Папку «{path}» не знайдено. Під’єднайте диск чи флешку й натисніть «Оновити».', {
            path: info.path,
          })}
        </Text>
      ) : info && photos.length === 0 ? (
        <Text size="sm" c="dimmed">
          {tr(
            'У папці немає фото JPEG, PNG, WebP, GIF, AVIF чи BMP. Додайте їх туди й натисніть «Оновити».',
          )}
        </Text>
      ) : (
        <>
          {info && (info.heic > 0 || info.truncated) && (
            <Text size="xs" c="dimmed" mb={4}>
              {info.heic > 0 &&
                trn(
                  info.heic,
                  '{n} фото HEIC не покажуться — браузери їх не відкривають.|{n} фото HEIC не покажуться — браузери їх не відкривають.|{n} фото HEIC не покажуться — браузери їх не відкривають.',
                )}
              {info.truncated && ` ${tr('Показано перші 5 000 фото.')}`}
            </Text>
          )}
          <ScrollArea.Autosize
            mah="var(--vo-cap, min(320px, 30vh))"
            viewportRef={viewport}
            scrollbars="y"
            className="vo-scroll-fit"
          >
            <div className="vo-image-grid">
              {photos.map((p, i) => (
                <div
                  key={p.src}
                  className="vo-image-tile"
                  data-live={p.src === onScreen || undefined}
                >
                  <button
                    ref={(el) => {
                      tiles.current[i] = el;
                    }}
                    type="button"
                    className="vo-image-pick"
                    onClick={() => show.pickPhoto(i)}
                    title={p.name}
                    aria-label={tr('Показати «{name}»', { name: photoTitle(p.name) })}
                    aria-current={i === show.current || undefined}
                  >
                    <LazyThumb src={p.small ?? p.src} root={viewport} />
                  </button>
                  <Text size="xs" truncate title={p.name} px={4} py={2}>
                    {photoTitle(p.name)}
                  </Text>
                </div>
              ))}
            </div>
          </ScrollArea.Autosize>
        </>
      )}
    </>
  );
}

/**
 * A photo's thumbnail, loaded only once it scrolls near the grid's view: an album of hundreds
 * of camera files would otherwise load them all (beta.1 has no small copies yet).
 */
function LazyThumb({ src, root }: { src: string; root: RefObject<HTMLDivElement | null> }) {
  const [near, setNear] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || near) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          seen.disconnect();
        }
      },
      { root: root.current, rootMargin: '200px' },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, [near, root]);
  return (
    <span ref={box} style={{ display: 'block', width: '100%', height: '100%' }}>
      {near && <img src={src} alt="" decoding="async" />}
    </span>
  );
}
