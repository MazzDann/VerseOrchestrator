import { useState } from 'react';
import { Button, Group, Loader, Stack, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { EMBED_MODELS, isEmbedModelId, N_ } from '@vo/shared';
import { api, type DiskPart } from '../api';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { tr, useLang } from '../i18n';
import { formatSize } from '../lib/modules';
import { browserDataBytes, clearBrowserCaches } from '../lib/browserData';

/** Each part's name and what removing it means (or whose it is). */
const PARTS: Record<DiskPart['id'], { name: string; note: string }> = {
  app: { name: N_('Застосунок (app/)'), note: N_('Сама програма.') },
  previous: {
    name: N_('Попередня версія'),
    note: N_('Для «Повернути версію» — без неї повернутися не вийде.'),
  },
  updates: { name: N_('Лишки оновлень'), note: N_('Те, що лишилося після оновлення.') },
  library: {
    name: N_('Бібліотека (library.db)'),
    note: N_('Збирається з модулів: «Пересканувати модулі».'),
  },
  modules: { name: N_('Модулі й документи (modules/)'), note: N_('Ваші файли.') },
  segments: {
    name: N_('Сегменти для «У браузері»'),
    note: N_('Збираються командою npm run build:segments.'),
  },
  stats: {
    name: N_('Статистика показу'),
    note: N_('Що й коли було на екрані; очищується на сторінці статистики.'),
  },
  vectors: {
    name: N_('Вектори для пошуку за змістом'),
    note: N_('Обчислюються знову в «Пошук за змістом».'),
  },
  models: { name: N_('Модель «{name}»'), note: N_('Завантажується знову одним клацанням.') },
  'album-cache': {
    name: N_('Малі копії фото для телефонів'),
    note: N_('Застосунок зробить їх знову, коли знадобляться.'),
  },
  'video-cache': {
    name: N_('Обкладинки відео'),
    note: N_('Застосунок зробить їх знову, коли знадобляться.'),
  },
  images: { name: N_('Зображення'), note: N_('Ваші файли.') },
  downloads: {
    name: N_('Відео за посиланням'),
    note: N_('Завантажені відео; файл іде, коли ви прибираєте відео в «Відео».'),
  },
  'images-trash': {
    name: N_('Видалені зображення'),
    note: N_('Чекають на «Скасувати»; після прибирання повернути не вийде.'),
  },
  'documents-trash': {
    name: N_('Видалені й замінені документи'),
    note: N_('Чекають на «Скасувати»; після прибирання повернути не вийде.'),
  },
  backups: {
    name: N_('Резервні копії'),
    note: N_('Найновіші автоматичні копії й стани перед відновленням.'),
  },
  'backups-old': {
    name: N_('Старі автоматичні копії'),
    note: N_('Найновіша копія кожного виду лишається.'),
  },
  'logs-old': { name: N_('Старий журнал запуску'), note: '' },
  'data-other': {
    name: N_('Інші дані'),
    note: N_('Налаштування, презентації, програми показу й решта папки data/.'),
  },
};

const partName = (p: DiskPart) =>
  tr(PARTS[p.id].name, {
    name: p.sub && isEmbedModelId(p.sub) ? tr(EMBED_MODELS[p.sub].label) : (p.sub ?? ''),
  });

/**
 * «Місце на диску» (1.17.0-beta.4, the Mac's idea of 2026-10-12): what the app keeps on this
 * computer, part by part, with «Прибрати» for what can go — counted on demand (the app's own
 * folder holds tens of thousands of files) — and this browser's caches.
 */
export function DiskSection({ active }: { active: boolean }) {
  useLang();
  const serverAvailable = useServer((s) => s.available);
  const queryClient = useQueryClient();
  const [shown, setShown] = useState(false);
  /** the part asking «Прибрати?» */
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const disk = useQuery({
    queryKey: ['disk'],
    queryFn: api.disk,
    enabled: active && shown && serverAvailable !== false,
    staleTime: 30_000,
  });
  const browser = useQuery({
    queryKey: ['browser-bytes'],
    queryFn: browserDataBytes,
    enabled: active,
  });

  const parts = disk.data?.parts ?? [];
  const total = parts.reduce((a, p) => a + p.bytes, 0);
  const keyOf = (p: DiskPart) => `${p.id}:${p.sub ?? ''}`;

  const clean = async (p: DiskPart) => {
    setBusy(keyOf(p));
    try {
      const { freed } = await api.cleanDisk(p.id, p.sub);
      notifications.show({
        message: tr('Прибрано: {what} — звільнено {size}', {
          what: partName(p),
          size: formatSize(freed),
        }),
        color: 'green',
        autoClose: 2500,
      });
      for (const k of ['disk', 'semantic', 'images', 'documents'])
        void queryClient.invalidateQueries({ queryKey: [k] });
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    } finally {
      setBusy(null);
      setAsking(null);
    }
  };

  return (
    <div>
      <Group justify="space-between" wrap="nowrap" mb={2}>
        <Text size="sm" fw={500}>
          {tr('Місце на диску')}
        </Text>
        {shown && (
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconRefresh size={14} />}
            loading={disk.isFetching}
            onClick={() => {
              void disk.refetch();
              void browser.refetch();
            }}
          >
            {tr('Порахувати знову')}
          </Button>
        )}
      </Group>
      {!shown ? (
        <>
          <Text size="xs" c="dimmed" mb={6}>
            {tr(
              'Що застосунок зберігає на цьому комп’ютері: моделі, вектори, кеші, старі копії — і що з цього можна прибрати.',
            )}
          </Text>
          <Button
            variant="light"
            fullWidth
            disabled={serverAvailable === false}
            title={serverAvailable === false ? tr(NEEDS_SERVER) : undefined}
            onClick={() => setShown(true)}
          >
            {tr('Показати, що займає місце')}
          </Button>
        </>
      ) : serverAvailable === false ? (
        <Text size="xs" c="dimmed">
          {tr(NEEDS_SERVER)}
        </Text>
      ) : disk.isLoading ? (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            {tr('Рахую…')}
          </Text>
        </Group>
      ) : disk.isError ? (
        <Text size="xs" c="red">
          {tr((disk.error as Error).message)}
        </Text>
      ) : (
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            {tr('Застосунок займає {size}.', { size: formatSize(total) })}
          </Text>
          {[...parts]
            .sort((a, b) => b.bytes - a.bytes)
            .map((p) => {
              const key = keyOf(p);
              return (
                <Group key={key} justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Text size="sm" truncate>
                      {partName(p)} · {formatSize(p.bytes)}
                    </Text>
                    {PARTS[p.id].note && (
                      <Text size="xs" c="dimmed">
                        {tr(PARTS[p.id].note)}
                      </Text>
                    )}
                  </div>
                  {p.removable &&
                    (asking === key ? (
                      <Group gap={4} wrap="nowrap">
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="red"
                          loading={busy === key}
                          onClick={() => void clean(p)}
                        >
                          {tr('Так, прибрати')}
                        </Button>
                        <Button size="compact-xs" variant="default" onClick={() => setAsking(null)}>
                          {tr('Ні')}
                        </Button>
                      </Group>
                    ) : (
                      <Button
                        size="compact-xs"
                        variant="default"
                        disabled={busy !== null}
                        onClick={() => setAsking(key)}
                      >
                        {tr('Прибрати')}
                      </Button>
                    ))}
                </Group>
              );
            })}
        </Stack>
      )}
      {/* this browser's caches: here even without a server (the «У браузері» mode needs it most) */}
      <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start" mt="xs">
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text size="sm">
            {tr('Дані цього браузера')}
            {browser.data != null ? ` · ${formatSize(browser.data)}` : ''}
          </Text>
          <Text size="xs" c="dimmed">
            {tr(
              'Кеш бібліотеки для «У браузері» (сегменти, знімок PostgreSQL). Налаштування лишаються; вікно перезавантажиться. Інші вікна застосунку в цьому браузері (показ, сцена) спершу закрийте.',
            )}
          </Text>
        </div>
        {asking === 'browser' ? (
          <Group gap={4} wrap="nowrap">
            <Button
              size="compact-xs"
              variant="light"
              color="red"
              onClick={() => void clearBrowserCaches().then(() => window.location.reload())}
            >
              {tr('Так, очистити')}
            </Button>
            <Button size="compact-xs" variant="default" onClick={() => setAsking(null)}>
              {tr('Ні')}
            </Button>
          </Group>
        ) : (
          <Button size="compact-xs" variant="default" onClick={() => setAsking('browser')}>
            {tr('Очистити кеш')}
          </Button>
        )}
      </Group>
    </div>
  );
}
