import { useState } from 'react';
import {
  Anchor,
  Button,
  Group,
  Popover,
  Progress,
  SegmentedControl,
  Select,
  Switch,
  Text,
} from '@mantine/core';
import { IconArrowBackUp, IconDownload, IconRefresh, IconReload } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type CodeState, type GitSync, type UpdateState } from '../api';
import { useServer, NEEDS_SERVER, shownVersion } from '../serverStore';
import { fmtDateTime, tr, trn, useLang } from '../i18n';
import {
  compareVersions,
  useCodeState,
  useUpdateState,
  waitForRelaunch,
  waitForRestart,
} from '../lib/updates';
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
    mutationFn: (version?: string) => api.downloadUpdate(version),
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
    onSuccess: (r) => {
      // an older version picked in the dropdown (1.6.2): «Заставка» as that version reads it,
      // as before «Повернути версію»
      if (state && compareVersions(r.to, state.current) < 0) storeForOlderVersion();
      return afterRestart(r);
    },
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
  // «Канал» (1.8.11): the server's answer says which one it follows — the choice, or by the version
  const setChannel = useMutation({
    mutationFn: (channel: 'stable' | 'beta') => api.updateServerSettings({ updates: { channel } }),
    onSuccess: (s) => {
      queryClient.setQueryData(['server-settings'], s);
      void queryClient.invalidateQueries({ queryKey: ['update'] });
    },
    onError: fail,
  });
  const channel = state?.channel ?? settings.data?.updates.channel ?? 'stable';

  let status: string;
  if (restarting === 'code') status = tr('Перезапускаю застосунок з новим кодом…');
  else if (restarting)
    status = tr('Перезапускаю застосунок з версією {version}…', { version: restarting });
  else if (serverAvailable === false) status = tr(NEEDS_SERVER);
  else if (!state) status = tr('Перевіряю…');
  // an older version chosen over the newest (1.6.3): said plainly, no reminder
  else if (state.available && state.latest && state.pinned) {
    const vars = { current: state.current, version: state.latest.version };
    // a check that failed: no time it was checked, and why
    status =
      state.error || state.checkedAt === null
        ? [
            tr('Ви вибрали версію {current}; поточний реліз — {version}.', vars),
            state.error && tr(state.error),
          ]
            .filter(Boolean)
            .join(' ')
        : tr('Ви вибрали версію {current}; поточний реліз — {version}. Перевірено {when}.', {
            ...vars,
            when: fmtDateTime(state.checkedAt),
          });
  } else if (state.available && state.latest)
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
      <Text
        size="xs"
        c={(state?.available && !state.pinned) || restarting ? undefined : 'dimmed'}
        mb={4}
      >
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
      {!restarting &&
        state?.install === 'release' &&
        (state.available ||
          (state.versions?.length ?? 0) > 1 ||
          (state.installer?.phase ?? 'idle') !== 'idle') && (
          <Install
            state={state}
            outputsOpen={outputs.length}
            downloading={download.isPending}
            onDownload={(version) => download.mutate(version)}
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
      <Group gap="xs" wrap="nowrap" mt={6}>
        <Text size="xs">{tr('Канал')}</Text>
        <SegmentedControl
          size="xs"
          aria-label={tr('Канал оновлень')}
          value={channel}
          disabled={serverAvailable !== true || setChannel.isPending || !!restarting}
          onChange={(v) => setChannel.mutate(v === 'beta' ? 'beta' : 'stable')}
          data={[
            { value: 'stable', label: tr('Стабільний') },
            { value: 'beta', label: tr('Бета') },
          ]}
        />
      </Group>
      <Text size="xs" c="dimmed" mt={4}>
        {channel === 'beta'
          ? tr(
              'Бета-версії приносять нове раніше, але в них можуть бути вади. Повернутися можна будь-коли: перемкніть на «Стабільний» і виберіть стабільну версію в списку.',
            )
          : tr('Лише стабільні версії: кожна збирає кілька перевірених бета-версій.')}
      </Text>
      <Text size="xs" c="dimmed" mt={6}>
        {tr(
          'Раз на 12 годин застосунок питає GitHub про нові версії. Завантажує й установлює лише тоді, коли ви натиснете кнопку.',
        )}
      </Text>
    </div>
  );
}

/**
 * How the last update went: once, for a day. An older version picked in the dropdown comes as a
 * way back (1.6.2, installer.prepareSwap): the older version it lands on words it so too.
 */
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

/**
 * Download → check → unpack → «Перезапустити й оновити». Since 1.6.2 any release of the channel,
 * picked in a dropdown — newer or older (big projects let you stay on a version): an older one is
 * said to be older, and one before 1.4.0 can't come back by itself. A version already downloaded
 * can still give way to another one picked (its download replaces it).
 */
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
  onDownload: (version?: string) => void;
  restartPending: boolean;
  onRestart: () => void;
}) {
  const versions = state.versions ?? [];
  const newest = versions[0]?.version ?? state.latest?.version ?? null;
  const [pick, setPick] = useState<string | null>(null);
  const inst = state.installer;
  const phase = inst?.phase ?? 'idle';
  // the version waiting in app.next: downloaded now or by an earlier run
  const ready =
    (phase === 'ready' || phase === 'restarting') && inst?.version ? inst.version : null;
  // the dropdown shows the version picked; else the one waiting, the one whose download failed
  // (to try again), or the newest when it is newer than this one; else nothing yet
  // a version chosen over the newest (1.6.3): nothing picked for you — «Поточний реліз» is there
  const target =
    pick ??
    ready ??
    (phase === 'error' && inst?.version
      ? inst.version
      : state.available && !state.pinned
        ? newest
        : null);
  const chosen = versions.find((v) => v.version === target) ?? null;
  if (phase === 'download' || phase === 'verify' || phase === 'unpack') {
    const total = inst?.total || chosen?.size || state.latest?.asset?.size || 0;
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
  const older = !!target && compareVersions(target, state.current) < 0;
  const options = versions.map((v) => ({
    value: v.version,
    label:
      v.version === state.current
        ? tr('{version} · встановлена', { version: v.version })
        : v.version === newest
          ? tr('{version} · найновіша', { version: v.version })
          : v.version,
    // the one installed is there to show where you are, not to be picked
    disabled: v.version === state.current,
  }));
  const size = chosen?.size ?? state.latest?.asset?.size ?? 0;
  const restart = !!ready && target === ready;
  // «Поточний реліз» (1.6.3, the user's ask): back to the newest from a version chosen over it
  const current =
    !target && state.pinned && state.available && newest && newest !== state.current
      ? (versions.find((v) => v.version === newest) ?? null)
      : null;
  return (
    <div>
      {phase === 'error' && inst?.error && (
        <Text size="xs" c="red" mb={4}>
          {tr(inst.error, inst.vars)}
        </Text>
      )}
      {ready && (
        <Text size="xs" mb={4}>
          {tr(
            'Версію {version} завантажено. Перезапустіть застосунок, щоб перейти на неї: це займе до хвилини.',
            { version: ready },
          )}
        </Text>
      )}
      {/* wraps: a long button goes under the dropdown rather than lose its end */}
      <Group gap="xs" mb={4}>
        {options.length > 1 && (
          <Select
            size="xs"
            w={210} // «1.8.12-beta.1 · найновіша» whole (1.8.11)
            aria-label={tr('Версія')}
            placeholder={tr('Інша версія…')}
            data={options}
            value={target}
            onChange={setPick}
            allowDeselect={false}
            disabled={phase === 'restarting'}
            comboboxProps={{ withinPortal: true }}
          />
        )}
        {restart ? (
          <Button
            size="xs"
            leftSection={<IconReload size={14} />}
            loading={restartPending || phase === 'restarting'}
            disabled={outputsOpen > 0}
            onClick={onRestart}
          >
            {older
              ? tr('Перезапустити з версією {version}', { version: ready })
              : tr('Перезапустити й оновити')}
          </Button>
        ) : current ? (
          <Button
            size="xs"
            variant="light"
            leftSection={<IconDownload size={14} />}
            loading={downloading}
            disabled={!current.installable}
            onClick={() => onDownload(current.version)}
          >
            {tr('Поточний реліз {version} ({mb} МБ)', {
              version: current.version,
              mb: mb(current.size),
            })}
          </Button>
        ) : (
          // a version other than this one is picked (or the newest is newer)
          target &&
          target !== state.current && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconDownload size={14} />}
              loading={downloading}
              disabled={!!chosen && !chosen.installable}
              onClick={() => onDownload(target)}
            >
              {phase === 'error' && inst?.version === target
                ? tr('Спробувати ще раз')
                : target !== newest || older
                  ? tr('Завантажити версію {version} ({mb} МБ)', { version: target, mb: mb(size) })
                  : tr('Завантажити оновлення ({mb} МБ)', { mb: mb(size) })}
            </Button>
          )
        )}
      </Group>
      {restart && outputsOpen > 0 && (
        <Text size="xs" c="dimmed" mb={4}>
          {tr('Спершу закрийте вікна виводу — під час показу застосунок не перезапускається.')}
        </Text>
      )}
      {chosen && !chosen.installable && (
        <Text size="xs" c="dimmed" mb={4}>
          {tr('Для цієї системи в релізі немає архіву: завантажте застосунок зі сторінки релізу.')}
        </Text>
      )}
      {older && (
        <Text size="xs" c="dimmed" mb={4}>
          {tr(
            'Старіша версія не знає того, що з’явилося пізніше: частину налаштувань вона може скинути до типових. Перш ніж перейти, збережіть резервну копію.',
          )}
          {/* not among the releases listed (none listed offline): nothing said of the way back */}
          {chosen &&
            (chosen.selfReturn
              ? ` ${tr('Повернутися на {current} можна буде тут само.', { current: state.current })}`
              : ` ${tr('У версії {version} ще немає «Повернути версію»: з неї можна лише оновитися до найновішої версії, потрібен інтернет.', { version: chosen.version })}`)}
        </Text>
      )}
    </div>
  );
}
