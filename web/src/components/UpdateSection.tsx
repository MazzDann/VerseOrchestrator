import { useState } from 'react';
import { Anchor, Button, Group, Popover, Progress, Switch, Text } from '@mantine/core';
import { IconArrowBackUp, IconDownload, IconRefresh, IconReload } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type CodeState, type GitSync, type UpdateState } from '../api';
import { useServer, NEEDS_SERVER, shownVersion } from '../serverStore';
import { fmtDateTime, tr, trn, useLang } from '../i18n';
import { useCodeState, useUpdateState, waitForRelaunch, waitForRestart } from '../lib/updates';
import { useOutputWindows } from '../lib/outputs';
import { storeForOlderVersion } from '../presenterBus';

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
  // a git checkout: «у вас dev 1.4.2.try7, mac-test · 20dd850» rather than the release it grew from
  const devLabel = useServer((s) => s.devLabel);
  const queryClient = useQueryClient();
  const state = useUpdateState();
  // a copy of the repository whose code changed under it (upd2, 1.6.0)
  const code = useCodeState();
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
    onSuccess: ({ git, ...s }) => {
      queryClient.setQueryData(['update'], s);
      // a copy of the repository looked at its upstream too (1.6.1)
      void queryClient.invalidateQueries({ queryKey: ['update-code'] });
      // new commits upstream are news too: never «the latest» above «N new changes»
      if (git && git.behind > 0 && git.upstream)
        notifications.show({
          message: trn(
            git.behind,
            'Гілка {branch}: на {upstream} є {n} нова зміна|Гілка {branch}: на {upstream} є {n} нові зміни|Гілка {branch}: на {upstream} є {n} нових змін',
            { branch: git.branch ?? '', upstream: git.upstream },
          ),
          color: 'green',
          autoClose: 3000,
        });
      else if (!s.available && !s.error && !git?.error)
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
  const afterRestart = async ({ to }: { to: string }) => {
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
  };
  // «Повернути попередню версію» (1.4.0): the same restart, into what the last update replaced
  const rollback = useMutation({
    mutationFn: api.rollbackUpdate,
    onSuccess: (to) => {
      // «Заставка» on screen: its logo as that version reads it (1.4.2, lib/bus.ts)
      storeForOlderVersion();
      return afterRestart(to);
    },
    onError: fail,
  });
  const restart = useMutation({
    mutationFn: api.restartForUpdate,
    onSuccess: afterRestart,
    onError: fail,
  });
  // «Перезапустити» (1.6.0): the launcher starts again with the new code; this page waits for it
  const relaunch = useMutation({
    mutationFn: api.relaunch,
    onSuccess: async ({ boot }) => {
      setRestarting('code');
      if (await waitForRelaunch(boot)) window.location.reload();
      else {
        setRestarting(null);
        notifications.show({
          message: tr(
            'Застосунок не відповідає після перезапуску. Запустіть його файлом запуску; що сталося — у data/standby.log.',
          ),
          color: 'red',
        });
      }
    },
    onError: fail,
  });
  // «Отримати оновлення» (1.6.1): git pull from the app; then «Перезапустити»
  const pull = useMutation({
    mutationFn: api.pullUpdates,
    onSuccess: ({ pulled, code: next }) => {
      if (next) queryClient.setQueryData(['update-code'], next);
      notifications.show({
        message:
          pulled > 0
            ? `${trn(pulled, 'Отримано {n} зміну|Отримано {n} зміни|Отримано {n} змін')}. ${tr('Перезапустіть застосунок, щоб вони запрацювали.')}`
            : tr('Нових змін немає.'),
        color: 'green',
        autoClose: pulled > 0 ? 4000 : 2000,
      });
    },
    onError: (e) => {
      fail(e);
      void queryClient.invalidateQueries({ queryKey: ['update-code'] });
    },
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
  if (restarting === 'code') status = tr('Перезапускаю застосунок з новим кодом…');
  else if (restarting)
    status = tr('Перезапускаю застосунок з версією {version}…', { version: restarting });
  else if (serverAvailable === false) status = tr(NEEDS_SERVER);
  else if (!state) status = tr('Перевіряю…');
  else if (state.available && state.latest)
    status = tr('Доступна версія {version} (у вас {current}).', {
      version: state.latest.version,
      current: shownVersion(devLabel, state.current),
    });
  else if (state.error) status = tr(state.error);
  else if (state.checkedAt === null) status = tr('Ще не перевіряли.');
  // a copy of the repository: about releases only — its branch has a line of its own (1.6.1)
  else if (state.install === 'source' && code?.git?.upstream)
    status = tr('Нових релізів немає ({current}). Перевірено {when}.', {
      current: shownVersion(devLabel, state.current),
      when: fmtDateTime(state.checkedAt),
    });
  else
    status = tr('У вас остання версія ({current}). Перевірено {when}.', {
      current: shownVersion(devLabel, state.current),
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
            !code?.git?.upstream &&
            ` · ${tr('Щоб оновити копію репозиторію, виконайте git pull і запустіть застосунок.')}`}
        </Text>
      )}
      {!restarting && code?.git && (
        <GitSyncLine git={code.git} pending={pull.isPending} onPull={() => pull.mutate()} />
      )}
      {!restarting && code?.changed && (
        <CodeChanged
          code={code}
          outputsOpen={outputs.length}
          pending={relaunch.isPending || code.restarting}
          onRelaunch={() => relaunch.mutate()}
        />
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
      {!restarting && state?.install === 'release' && state.previous && (
        <Rollback
          version={state.previous}
          current={state.current}
          selfReturn={state.previousHasRollback !== false}
          phase={state.installer?.phase ?? 'idle'}
          outputsOpen={outputs.length}
          pending={rollback.isPending}
          onRollback={() => rollback.mutate()}
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
  const vars = { from: last.from, to: last.to, when: fmtDateTime(last.at) };
  const back = last.kind === 'rollback';
  return last.ok ? (
    <Text size="xs" c="dimmed" mb={4}>
      {back
        ? tr('Повернуто версію {to} замість {from} ({when}).', vars)
        : tr('Оновлено з {from} до {to} ({when}).', vars)}
    </Text>
  ) : (
    <Text size="xs" c="red" mb={4}>
      {back
        ? tr('Повернути версію {to} не вдалося.', vars)
        : tr('Оновлення до {to} не вдалося.', vars)}{' '}
      {last.error && `${tr(last.error)}. `}
      {tr('Подробиці — у data/updates/swap.log.')}
    </Text>
  );
}

/**
 * «Повернути попередню версію» (1.4.0): the version the last update replaced is kept next to the
 * app (`app.previous/`); a confirmation, then the same restart as an update — and back to this
 * one by itself if that one doesn't start. Not during a show, nor while an update unpacks; a
 * download under way stops, and the confirmation says so (1.4.1). A version before 1.4.0 can't
 * come back here by itself: the confirmation says how (1.4.1).
 */
function Rollback({
  version,
  current,
  selfReturn,
  phase,
  outputsOpen,
  pending,
  onRollback,
}: {
  version: string;
  current: string;
  /** `version` has «Повернути версію» of its own (1.4.0 or later) */
  selfReturn: boolean;
  /** the installer's phase */
  phase: string;
  outputsOpen: number;
  pending: boolean;
  onRollback: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const wait =
    phase === 'restarting'
      ? tr('Застосунок уже перезапускається')
      : phase === 'unpack'
        ? tr('Зачекайте, доки оновлення розпакується')
        : null;
  const downloading = phase === 'download' || phase === 'verify';
  return (
    <div>
      <Text size="xs" c="dimmed" mb={4}>
        {tr('Попередня версія {version} лишилася в папці застосунку.', { version })}
      </Text>
      <Popover opened={confirm} onChange={setConfirm} position="bottom-start" withArrow shadow="md">
        <Popover.Target>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconArrowBackUp size={14} />}
            loading={pending}
            disabled={outputsOpen > 0 || !!wait}
            onClick={() => setConfirm((o) => !o)}
          >
            {tr('Повернути версію {version}', { version })}
          </Button>
        </Popover.Target>
        <Popover.Dropdown maw={300}>
          <Text size="xs" mb="xs">
            {selfReturn
              ? tr(
                  'Застосунок перезапуститься з версією {version}: це займе до хвилини. Версія {current} лишиться поруч — до неї можна повернутися тут само.',
                  { version, current },
                )
              : tr(
                  'Застосунок перезапуститься з версією {version}: це займе до хвилини. Версія {version} ще не вміє повертати версії: щоб знову перейти на {current}, оновіться в «Оновлення» — потрібен інтернет.',
                  { version, current },
                )}
            {downloading && ` ${tr('Завантаження оновлення зупиниться.')}`}
          </Text>
          <Group gap="xs" justify="flex-end">
            <Button size="xs" variant="default" onClick={() => setConfirm(false)}>
              {tr('Скасувати')}
            </Button>
            <Button
              size="xs"
              onClick={() => {
                setConfirm(false);
                onRollback();
              }}
            >
              {tr('Повернути')}
            </Button>
          </Group>
        </Popover.Dropdown>
      </Popover>
      {wait ? (
        <Text size="xs" c="dimmed" mt={4}>
          {`${wait}.`}
        </Text>
      ) : (
        outputsOpen > 0 && (
          <Text size="xs" c="dimmed" mt={4}>
            {tr('Спершу закрийте вікна виводу — під час показу застосунок не перезапускається.')}
          </Text>
        )
      )}
    </div>
  );
}

/**
 * upd2 (1.6.1): where a copy of the repository stands against its upstream (as of the last
 * fetch — «Перевірити зараз», or twice a day) and «Отримати оновлення» when it is behind and git
 * can go on by itself; otherwise why not, in words.
 */
function GitSyncLine({
  git,
  pending,
  onPull,
}: {
  git: GitSync;
  pending: boolean;
  onPull: () => void;
}) {
  const vars = { branch: git.branch ?? '', upstream: git.upstream ?? '' };
  // no branch, or no upstream (a local branch; one deleted after its merge): why, and nothing else
  if (!git.branch || !git.upstream)
    return git.why ? (
      <Text size="xs" c="dimmed" mb={4}>
        {tr(git.why, vars)}.
      </Text>
    ) : null;
  // before our own fetch the upstream may be known already (GitHub Desktop fetches by itself):
  // say it when something is there, keep quiet otherwise
  if (git.fetchedAt === null && !git.error && git.behind === 0) return null;
  return (
    <div>
      {git.error ? (
        <Text size="xs" c="red" mb={4}>
          {tr(git.error)}
          {git.detail ? `: ${git.detail}` : '.'}
        </Text>
      ) : (
        <Text size="xs" mb={4}>
          {git.behind > 0
            ? trn(
                git.behind,
                'Гілка {branch}: на {upstream} є {n} нова зміна|Гілка {branch}: на {upstream} є {n} нові зміни|Гілка {branch}: на {upstream} є {n} нових змін',
                vars,
              )
            : tr('Гілка {branch}: нових змін на {upstream} немає.', vars)}
        </Text>
      )}
      {git.behind > 0 &&
        (git.why ? (
          <Text size="xs" c="dimmed" mb={4}>
            {tr(git.why, vars)}.
          </Text>
        ) : (
          <Button
            size="xs"
            variant="light"
            leftSection={<IconDownload size={14} />}
            loading={pending}
            onClick={onPull}
            mb={4}
          >
            {tr('Отримати оновлення')}
          </Button>
        ))}
    </div>
  );
}

/**
 * upd2 (1.6.0): a copy of the repository whose code changed under it (`git pull`, another branch)
 * starts again on request — the launcher does what the start file does, in the background.
 */
function CodeChanged({
  code,
  outputsOpen,
  pending,
  onRelaunch,
}: {
  code: CodeState;
  outputsOpen: number;
  pending: boolean;
  onRelaunch: () => void;
}) {
  return (
    <div>
      <Text size="xs" mb={4}>
        {tr('Код застосунку змінився: {from} → {to}.', { from: code.from, to: code.to })}
      </Text>
      <Button
        size="xs"
        leftSection={<IconReload size={14} />}
        loading={pending}
        disabled={outputsOpen > 0}
        onClick={onRelaunch}
      >
        {tr('Перезапустити')}
      </Button>
      <Text size="xs" c="dimmed" mt={4} mb={4}>
        {outputsOpen > 0
          ? tr('Спершу закрийте вікна виводу — під час показу застосунок не перезапускається.')
          : tr(
              'Застосунок перебудує інтерфейс і запуститься знову у фоні — вікно запуску закриється. Сторінка оновиться сама.',
            )}
      </Text>
    </div>
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
