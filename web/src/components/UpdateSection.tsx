import { useState } from 'react';
import { Anchor, Button, Group, Progress, Switch, Text } from '@mantine/core';
import { IconDownload, IconRefresh, IconReload } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type UpdateState } from '../api';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { fmtDateTime, tr, useLang } from '../i18n';
import { useUpdateState, waitForRestart } from '../lib/updates';
import { useOutputWindows } from '../lib/outputs';

const mb = (bytes: number) => String(Math.max(1, Math.round(bytes / 1048576)));

/**
 * «Оновлення» (1.0.0): is there a newer version on GitHub? The server asks twice a day at most;
 * «Перевірити зараз» asks at once. A copy from a release archive installs it on request:
 * download → check → unpack next to the running one (the show goes on), then «Перезапустити й
 * оновити» swaps the folders and comes back as the new version — or as the old one, if the new
 * one doesn't start (server/src/installer.ts, swap.ts).
 */
export function UpdateSection() {
  useLang();
  const serverAvailable = useServer((s) => s.available);
  const queryClient = useQueryClient();
  const state = useUpdateState();
  const outputs = useOutputWindows();
  const [restarting, setRestarting] = useState<string | null>(null);
  const settings = useQuery({
    queryKey: ['server-settings'],
    queryFn: api.serverSettings,
    enabled: serverAvailable === true,
  });
  const fail = (e: unknown) => notifications.show({ message: (e as Error).message, color: 'red' });
  const check = useMutation({
    mutationFn: api.checkUpdate,
    onSuccess: (s) => {
      queryClient.setQueryData(['update'], s);
      if (!s.available && !s.error)
        notifications.show({
          message: tr('У вас остання версія'),
          color: 'green',
          autoClose: 2000,
        });
    },
    onError: fail,
  });
  const download = useMutation({
    mutationFn: api.downloadUpdate,
    onSuccess: (s) => queryClient.setQueryData(['update'], s),
    onError: fail,
  });
  const restart = useMutation({
    mutationFn: api.restartForUpdate,
    onSuccess: async ({ to }) => {
      setRestarting(to);
      if (await waitForRestart(to)) window.location.reload();
      else {
        setRestarting(null);
        notifications.show({
          message: tr(
            'Застосунок не відповідає після оновлення. Запустіть його знову файлом запуску; що сталося — у data/updates/swap.log.',
          ),
          color: 'red',
        });
      }
    },
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: (on: boolean) => api.updateServerSettings({ updates: { check: on } }),
    onSuccess: (s) => {
      queryClient.setQueryData(['server-settings'], s);
      void queryClient.invalidateQueries({ queryKey: ['update'] });
    },
  });
  const enabled = settings.data?.updates.check ?? true;

  let status: string;
  if (restarting)
    status = tr('Перезапускаю застосунок з версією {version}…', { version: restarting });
  else if (serverAvailable === false) status = tr(NEEDS_SERVER);
  else if (!state) status = tr('Перевіряю…');
  else if (state.available && state.latest)
    status = tr('Доступна версія {version} (у вас {current}).', {
      version: state.latest.version,
      current: state.current,
    });
  else if (state.error) status = tr(state.error);
  else if (state.checkedAt === null) status = tr('Ще не перевіряли.');
  else
    status = tr('У вас остання версія ({current}). Перевірено {when}.', {
      current: state.current,
      when: fmtDateTime(state.checkedAt),
    });

  return (
    <div>
      <Text size="sm" fw={500} mb={2}>
        {tr('Оновлення')}
      </Text>
      <Text size="xs" c={state?.available || restarting ? undefined : 'dimmed'} mb={4}>
        {status}
      </Text>
      {!restarting && state?.lastUpdate && <LastUpdate last={state.lastUpdate} />}
      {!restarting && state?.available && state.latest && (
        <Text size="xs" c="dimmed" mb={4}>
          <Anchor href={state.latest.url} target="_blank" rel="noreferrer" size="xs">
            {tr('Що нового')}
          </Anchor>
          {state.install === 'source' &&
            ` · ${tr('Щоб оновити копію репозиторію, виконайте git pull і запустіть застосунок.')}`}
        </Text>
      )}
      {!restarting && state?.available && state.install === 'release' && (
        <Install
          state={state}
          outputsOpen={outputs.length}
          downloading={download.isPending}
          onDownload={() => download.mutate()}
          restartPending={restart.isPending}
          onRestart={() => restart.mutate()}
        />
      )}
      {restarting && (
        <Text size="xs" c="dimmed" mb={4}>
          {tr(
            'Сторінка оновиться сама, щойно застосунок відповість. Телефони під’єднаються знову.',
          )}
        </Text>
      )}
      <Group gap="xs" wrap="nowrap" mt={6}>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconRefresh size={14} />}
          loading={check.isPending}
          disabled={serverAvailable !== true || !!restarting}
          onClick={() => check.mutate()}
        >
          {tr('Перевірити зараз')}
        </Button>
        <Switch
          size="xs"
          checked={enabled}
          disabled={serverAvailable !== true || toggle.isPending}
          onChange={(e) => toggle.mutate(e.currentTarget.checked)}
          label={tr('Перевіряти оновлення')}
        />
      </Group>
      <Text size="xs" c="dimmed" mt={6}>
        {tr(
          'Раз на 12 годин застосунок питає GitHub про нові версії. Завантажує й установлює лише тоді, коли ви натиснете кнопку.',
        )}
      </Text>
    </div>
  );
}

/** How the last update went: once, for a day. */
function LastUpdate({ last }: { last: NonNullable<UpdateState['lastUpdate']> }) {
  return last.ok ? (
    <Text size="xs" c="dimmed" mb={4}>
      {tr('Оновлено з {from} до {to} ({when}).', {
        from: last.from,
        to: last.to,
        when: fmtDateTime(last.at),
      })}
    </Text>
  ) : (
    <Text size="xs" c="red" mb={4}>
      {tr('Оновлення до {to} не вдалося.', { to: last.to })} {last.error && `${tr(last.error)}. `}
      {tr('Подробиці — у data/updates/swap.log.')}
    </Text>
  );
}

/** Download → check → unpack → «Перезапустити й оновити». */
function Install({
  state,
  outputsOpen,
  downloading,
  onDownload,
  restartPending,
  onRestart,
}: {
  state: UpdateState;
  outputsOpen: number;
  downloading: boolean;
  onDownload: () => void;
  restartPending: boolean;
  onRestart: () => void;
}) {
  const asset = state.latest?.asset;
  const inst = state.installer;
  const phase = inst?.phase ?? 'idle';
  if (!asset)
    return (
      <Text size="xs" c="dimmed" mb={4}>
        {tr('Для цієї системи в релізі немає архіву: завантажте застосунок зі сторінки релізу.')}
      </Text>
    );
  if (phase === 'download' || phase === 'verify' || phase === 'unpack') {
    const total = inst?.total || asset.size;
    const label =
      phase === 'download'
        ? tr('Завантажую: {got} з {total} МБ', { got: mb(inst?.received ?? 0), total: mb(total) })
        : phase === 'verify'
          ? tr('Перевіряю контрольну суму…')
          : tr('Розпаковую…');
    return (
      <div>
        <Progress
          size="sm"
          value={phase === 'download' && total ? ((inst?.received ?? 0) / total) * 100 : 100}
          animated={phase !== 'download'}
          mb={4}
          aria-label={label}
        />
        <Text size="xs" c="dimmed" mb={4}>
          {label}
        </Text>
      </div>
    );
  }
  if (phase === 'ready' || phase === 'restarting')
    return (
      <div>
        <Text size="xs" mb={4}>
          {tr(
            'Версію {version} завантажено. Перезапустіть застосунок, щоб перейти на неї: це займе до хвилини.',
            { version: inst?.version ?? '' },
          )}
        </Text>
        <Button
          size="xs"
          leftSection={<IconReload size={14} />}
          loading={restartPending || phase === 'restarting'}
          disabled={outputsOpen > 0}
          onClick={onRestart}
        >
          {tr('Перезапустити й оновити')}
        </Button>
        {outputsOpen > 0 && (
          <Text size="xs" c="dimmed" mt={4}>
            {tr('Спершу закрийте вікна виводу — під час показу застосунок не перезапускається.')}
          </Text>
        )}
      </div>
    );
  return (
    <div>
      {phase === 'error' && inst?.error && (
        <Text size="xs" c="red" mb={4}>
          {tr(inst.error, inst.vars)}
        </Text>
      )}
      <Button
        size="xs"
        variant="light"
        leftSection={<IconDownload size={14} />}
        loading={downloading}
        onClick={onDownload}
      >
        {phase === 'error'
          ? tr('Спробувати ще раз')
          : tr('Завантажити оновлення ({mb} МБ)', { mb: mb(asset.size) })}
      </Button>
    </div>
  );
}
