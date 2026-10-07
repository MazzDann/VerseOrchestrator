import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Popover,
  ScrollArea,
  Slider,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import {
  IconMovie,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlaylistAdd,
  IconRefresh,
  IconTrash,
  IconVolume,
} from '@tabler/icons-react';
import { api, type VideoInfo } from '../api';
import { clockOf, positionIn } from '../lib/video';
import type { useVideo } from '../pages/control/useVideo';
import { usePlaylist, type SeqItem } from '../playlistStore';
import { useSettings, videoVolumeOf } from '../settingsStore';
import { FolderPicker } from './AlbumsView';
import { tr, useLang } from '../i18n';

type VideoShow = ReturnType<typeof useVideo>;

/**
 * «Відео» in «Зображення» (1.8.12-beta.3, F1005-14): video files on this computer, picked one by
 * one and read where they are. A click plays one from its start; the controls — ⏯, a seek, the
 * time, «Повторювати», the loudness — change the clock on the slide (pages/control/useVideo.ts),
 * and every window follows; the sound is this window's.
 */
export function VideosView({
  show,
  onAddToPlaylist,
}: {
  show: VideoShow;
  onAddToPlaylist: (video: VideoInfo) => void;
}) {
  useLang();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const order = usePlaylist((s) => s.items);
  const programs = usePlaylist((s) => s.saved);
  if (picking)
    return <FolderPicker mode="video" onDone={() => setPicking(false)} onAdded={() => {}} />;
  const uses = (id: string) => {
    const n = (list: SeqItem[]) =>
      list.filter((it) => it.kind === 'video' && it.videoId === id).length;
    return n(order) + programs.filter((p) => n(p.items) > 0).length;
  };
  const remove = async (v: VideoInfo) => {
    setAsking(null);
    try {
      await api.removeVideo(v.id);
      // the one on screen leaves it with its list (as a deleted picture does)
      show.videoRemoved(v.id);
      notifications.show({
        message: tr('Відео прибрано: {name}', { name: v.name }),
        color: 'green',
        autoClose: 1500,
      });
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    }
    void queryClient.invalidateQueries({ queryKey: ['videos'] });
  };
  const live = show.onScreen?.videoId ?? null;
  return (
    <>
      <Group justify="space-between" wrap="nowrap" mb={6}>
        <Text size="xs" c="dimmed">
          {tr('Відео з цього комп’ютера — без копій. Звук іде з цього вікна.')}
        </Text>
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          <Tooltip label={tr('Оновити список відео')} withArrow>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={show.reloadVideos}
              aria-label={tr('Оновити список відео')}
            >
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconMovie size={14} />}
            onClick={() => setPicking(true)}
          >
            {tr('Додати відео…')}
          </Button>
        </Group>
      </Group>
      {show.onScreen && <VideoControls show={show} />}
      {show.videosError ? (
        <Text size="sm" c="red">
          {tr(show.videosError.message)}
        </Text>
      ) : !show.videosLoading && show.videos.length === 0 ? (
        <Text size="sm" c="dimmed">
          {tr('Відео ще немає. Натисніть «Додати відео…» і виберіть файл MP4, MOV, WebM чи MKV.')}
        </Text>
      ) : (
        <ScrollArea.Autosize mah="var(--vo-cap, min(320px, 30vh))">
          <div className="vo-image-grid">
            {show.videos.map((v) => (
              <div key={v.id} className="vo-image-tile" data-live={v.id === live || undefined}>
                <button
                  type="button"
                  className="vo-image-pick"
                  onClick={() => show.showVideo(v)}
                  title={v.missing ? tr('Файл не знайдено: {path}', { path: v.path }) : v.path}
                  aria-label={tr('Показати «{name}»', { name: v.name })}
                  disabled={v.missing}
                >
                  {v.hasPoster ? (
                    <img src={v.poster} alt="" loading="lazy" />
                  ) : (
                    <span className="vo-video-blank">
                      <IconMovie size={28} stroke={1.25} />
                    </span>
                  )}
                </button>
                <Text
                  size="xs"
                  truncate
                  title={v.name}
                  px={4}
                  py={2}
                  c={v.missing ? 'orange' : undefined}
                >
                  {v.missing ? tr('Файл не знайдено: {name}', { name: v.name }) : v.name}
                </Text>
                <Group gap={2} className="vo-image-actions" wrap="nowrap">
                  <Tooltip label={tr('Додати в послідовність показу')} withArrow>
                    <ActionIcon
                      size="sm"
                      variant="default"
                      onClick={() => onAddToPlaylist(v)}
                      aria-label={tr('Додати «{name}» в послідовність показу', { name: v.name })}
                    >
                      <IconPlaylistAdd size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Popover
                    opened={asking === v.id}
                    onChange={(o) => !o && setAsking(null)}
                    position="bottom-end"
                    withArrow
                    shadow="md"
                  >
                    <Popover.Target>
                      <Tooltip label={tr('Прибрати відео')} withArrow>
                        <ActionIcon
                          size="sm"
                          variant="default"
                          color="red"
                          onClick={() => setAsking(v.id)}
                          aria-label={tr('Прибрати відео «{name}»', { name: v.name })}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Popover.Target>
                    <Popover.Dropdown maw={280}>
                      <Text size="xs" fw={500} mb={4}>
                        {tr('Прибрати відео «{name}»?', { name: v.name })}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {tr('Файл лишиться на місці; додати його можна знову.')}
                      </Text>
                      {v.id === live && (
                        <Text size="xs" c="dimmed">
                          {tr('Воно зараз на екрані: застосунок прибере його з екрана.')}
                        </Text>
                      )}
                      {uses(v.id) > 0 && (
                        <Text size="xs" c="dimmed">
                          {tr(
                            'Пункти послідовності показу й програм з ним лишаться з позначкою «Відео прибрано».',
                          )}
                        </Text>
                      )}
                      <Group gap="xs" justify="flex-end" mt="xs">
                        <Button size="xs" variant="default" onClick={() => setAsking(null)}>
                          {tr('Скасувати')}
                        </Button>
                        <Button size="xs" color="red" onClick={() => void remove(v)}>
                          {tr('Прибрати')}
                        </Button>
                      </Group>
                    </Popover.Dropdown>
                  </Popover>
                </Group>
              </div>
            ))}
          </div>
        </ScrollArea.Autosize>
      )}
    </>
  );
}

/** The video on screen: ⏯, where it is (a seek), «Повторювати» and this window's loudness. */
function VideoControls({ show }: { show: VideoShow }) {
  const on = show.onScreen!;
  const v = on.video;
  const duration = show.duration;
  // the time moves four times a second while it plays
  const [, tick] = useState(0);
  useEffect(() => {
    if (v.paused != null) return;
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, [v.paused, v.at]);
  const at = positionIn(v, duration);
  const [dragging, setDragging] = useState<number | null>(null);
  const volume = useSettings((s) => videoVolumeOf(s.appearance.videoVolume));
  const setAppearance = useSettings((s) => s.setAppearance);
  const paused = v.paused != null;
  return (
    <div className="vo-video-controls">
      <Group gap="xs" wrap="nowrap">
        <Tooltip label={paused ? tr('Пуск') : tr('Пауза')} withArrow>
          <ActionIcon
            size="md"
            variant="light"
            onClick={show.togglePause}
            aria-label={paused ? tr('Пуск') : tr('Пауза')}
          >
            {paused ? <IconPlayerPlay size={16} /> : <IconPlayerPause size={16} />}
          </ActionIcon>
        </Tooltip>
        <Text size="sm" fw={500} truncate style={{ minWidth: 0 }} title={v.name}>
          {v.name}
        </Text>
        <Text
          size="xs"
          c="dimmed"
          ml="auto"
          style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
        >
          {clockOf(dragging ?? at)} / {duration > 0 ? clockOf(duration) : '–:––'}
        </Text>
      </Group>
      <Slider
        size="sm"
        mt={6}
        min={0}
        max={Math.max(1, duration)}
        step={1}
        value={duration > 0 ? Math.min(dragging ?? at, duration) : 0}
        onChange={setDragging}
        onChangeEnd={(t) => {
          setDragging(null);
          show.seek(t);
        }}
        disabled={!(duration > 0)}
        label={(t) => clockOf(t)}
        thumbLabel={tr('Де відео зараз')}
      />
      <Group gap="md" wrap="nowrap" mt={6}>
        <Switch
          size="xs"
          checked={v.loop}
          onChange={(e) => show.setLoop(e.currentTarget.checked)}
          label={tr('Повторювати')}
        />
        <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <IconVolume size={14} aria-hidden />
          <Slider
            size="xs"
            style={{ flex: 1 }}
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(n) => setAppearance({ videoVolume: n / 100 })}
            label={(n) => `${n} %`}
            thumbLabel={tr('Гучність відео в цьому вікні')}
          />
        </Group>
      </Group>
      {show.needsClick && (
        <Text size="xs" c="orange" mt={4}>
          {tr(
            'Натисніть будь-де в цьому вікні, щоб увімкнути звук відео: браузер дає звук лише після кліку.',
          )}
        </Text>
      )}
    </div>
  );
}
