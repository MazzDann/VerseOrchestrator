import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, Group, Progress, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { IconLink, IconX } from '@tabler/icons-react';
import { api, type VideoDownload } from '../api';
import { tr, useLang } from '../i18n';

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const size = (n: number) => (n >= GB ? `${(n / GB).toFixed(1)} ГБ` : `${Math.round(n / MB)} МБ`); // i18n-ignore: units

/** Why a download failed, in words. */
function failureText(job: VideoDownload): string {
  switch (job.failure) {
    case 'page':
      return tr(
        'За посиланням сторінка, а не файл відео — потрібне пряме посилання на файл .mp4 чи .webm',
      );
    case 'type':
      return tr('Це не відео MP4, MOV, WebM чи MKV, яке відтворює браузер');
    case 'size':
      return tr('Відео завелике — до 20 ГБ');
    case 'disk':
      return tr('На диску забракло місця');
    default:
      return job.status
        ? tr('Сервер за посиланням відповів {status} — перевірте посилання', { status: job.status })
        : tr('Не вдалося завантажити — перевірте посилання й інтернет');
  }
}

/**
 * «За посиланням…» in «Відео» (1.19.0-beta.8): a direct link to a video file; the app downloads it once
 * (server/src/videoDownload.ts) — the progress here, «Зупинити» — and then it is a video of the list
 * that plays without the internet.
 */
export function VideoLinkButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  useLang();
  return (
    <Tooltip
      label={tr('За посиланням — пряме посилання на файл відео; застосунок завантажить його')}
      withArrow
    >
      <ActionIcon
        size="input-xs"
        variant={open ? 'filled' : 'light'}
        onClick={onToggle}
        aria-label={tr('За посиланням…')}
        aria-pressed={open}
      >
        <IconLink size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

export function VideoLink({ open, onClose }: { open: boolean; onClose: () => void }) {
  useLang();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [job, setJob] = useState<VideoDownload | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  // the download's progress, twice a second, to its end; a job the server lost (a restart) ends after
  // three unanswered asks (review)
  useEffect(() => {
    if (!job || job.state !== 'running') return;
    let missed = 0;
    const t = window.setInterval(() => {
      void api.videoDownload(job.id).then(
        (now) => {
          setJob(now);
          if (now.state === 'done') {
            void queryClient.invalidateQueries({ queryKey: ['videos'] });
            notifications.show({
              message: tr('Завантажено: {name}', { name: now.video?.name ?? now.name }),
              color: 'green',
              autoClose: 2500,
            });
            setJob(null);
            setUrl('');
            onClose();
          } else if (now.state === 'failed') {
            notifications.show({ message: failureText(now), color: 'red' });
            setJob(null);
          } else if (now.state === 'stopped') {
            notifications.show({
              message: tr('Завантаження зупинено'),
              color: 'gray',
              autoClose: 2000,
            });
            setJob(null);
          }
        },
        (e) => {
          missed += 1;
          if (missed < 3) return;
          notifications.show({ message: tr((e as Error).message), color: 'red' });
          setJob(null);
        },
      );
    }, 500);
    return () => window.clearInterval(t);
  }, [job, queryClient, onClose]);

  const start = async () => {
    const u = url.trim();
    if (!u || job) return;
    try {
      setJob(await api.downloadVideo(u));
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    }
  };

  if (job)
    return (
      <div style={{ marginBottom: 8 }}>
        <Group gap={6} wrap="nowrap" justify="space-between">
          <Text size="xs" truncate style={{ minWidth: 0 }}>
            {job.name
              ? tr('Завантажую «{name}»…', { name: job.name })
              : tr('Завантажую відео за посиланням…')}
          </Text>
          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {job.total ? `${size(job.got)} / ${size(job.total)}` : size(job.got)}
            </Text>
            <Tooltip label={tr('Зупинити')} withArrow>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={() => void api.stopVideoDownload(job.id).catch(() => {})}
                aria-label={tr('Зупинити завантаження')}
              >
                <IconX size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        <Progress
          size="sm"
          mt={4}
          value={job.total ? (100 * job.got) / job.total : 0}
          animated={!job.total}
          striped={!job.total}
          aria-label={tr('Завантаження відео')}
        />
      </div>
    );
  if (!open) return null;
  return (
    <Group gap={6} wrap="nowrap" mb={8}>
      <TextInput
        ref={field}
        size="xs"
        style={{ flex: 1 }}
        placeholder={tr('https://… — пряме посилання на файл відео')}
        aria-label={tr('Посилання на файл відео')}
        value={url}
        onChange={(e) => setUrl(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            void start();
          }
        }}
      />
      <Button size="xs" disabled={!url.trim()} onClick={() => void start()}>
        {tr('Завантажити відео')}
      </Button>
    </Group>
  );
}
