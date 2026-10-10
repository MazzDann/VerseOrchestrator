import { useRef, useState } from 'react';
import { Button, Checkbox, FileButton, Group, Paper, Stack, Switch, Text } from '@mantine/core';
import { IconArchive, IconArrowBackUp, IconUpload } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, ApiFailure, type AutoBackup, type BackupSummary, type RestoreParts } from '../api';
import { dropUiState, takeServerUiState } from '../lib/uiState';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { fmtDateTime, fmtNumber, tr, trn, useLang } from '../i18n';

/** The last part of a folder's path, the whole path in its title. */
const shortName = (folder: string) => folder.split(/[\\/]/).filter(Boolean).pop() ?? folder;

const when = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? fmtDateTime(t) : iso;
};

/** The browser a backup names (by its name; «system» — the system's). */
const browserName = (name: string) => (name === 'system' ? tr('Браузер системи') : name);

/** «2,4 МБ» */
const mb = (bytes: number) =>
  bytes < 1048576
    ? tr('менше 1 МБ')
    : tr('{n} МБ', {
        n: fmtNumber(bytes / 1048576, { maximumFractionDigits: bytes < 10 * 1048576 ? 1 : 0 }),
      });

/** Why an automatic copy was made: «щодня», «перед переходом на 1.12.1». */
const why = (b: AutoBackup) =>
  b.kind === 'daily'
    ? tr('щодня')
    : b.to
      ? tr('перед переходом на {version}', { version: b.to })
      : tr('перед зміною версії');

/** How many automatic copies show before «Показати всі». */
const SHOWN = 3;

/**
 * «Автоматичні копії» (1.12.0-beta.3, server/src/autoBackup.ts): the switch, and the copies the
 * app made — once a day and before a version change — each with «Відновити…», which checks it
 * the way a picked file is checked (the same card, the same restore).
 */
function AutoBackups({
  disabled,
  onPicked,
  onFail,
}: {
  disabled: boolean;
  onPicked: (summary: BackupSummary) => void;
  onFail: (e: unknown) => void;
}) {
  const qc = useQueryClient();
  const [all, setAll] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const settings = useQuery({ queryKey: ['server-settings'], queryFn: api.serverSettings });
  const list = useQuery({ queryKey: ['backup-auto'], queryFn: api.autoBackups });
  const toggle = useMutation({
    mutationFn: (auto: boolean) => api.updateServerSettings({ backups: { auto } }),
    onSuccess: (next) => qc.setQueryData(['server-settings'], next),
    onError: onFail,
  });
  const on = settings.data?.backups.auto ?? true;
  const backups = list.data ?? [];
  const shown = all ? backups : backups.slice(0, SHOWN);
  const check = async (b: AutoBackup) => {
    setChecking(b.name);
    try {
      onPicked(await api.checkAutoBackup(b.name));
    } catch (e) {
      onFail(e);
      void list.refetch();
    } finally {
      setChecking(null);
    }
  };
  return (
    <div>
      <Switch
        size="sm"
        checked={on}
        disabled={toggle.isPending || settings.isLoading}
        onChange={(e) => toggle.mutate(e.currentTarget.checked)}
        label={tr('Робити копії автоматично')}
        description={tr(
          'Щодня й перед кожною зміною версії. Зберігаються останні 7 щоденних і 3 перед змінами версії — у data/backups/auto.',
        )}
      />
      {backups.length > 0 && (
        <Stack gap={4} mt={8}>
          <Stack gap={4} role="list" aria-label={tr('Автоматичні копії')}>
            {shown.map((b) => (
              <Group key={b.name} gap="xs" wrap="nowrap" justify="space-between" role="listitem">
                <Text size="xs" c="dimmed" style={{ minWidth: 0 }} truncate="end" title={b.name}>
                  {[fmtDateTime(Date.parse(b.created)), why(b), b.app, mb(b.size)]
                    .concat(b.pictures ? [] : [tr('без зображень')])
                    .join(' · ')}
                </Text>
                <Button
                  size="compact-xs"
                  variant="light"
                  style={{ flexShrink: 0 }}
                  loading={checking === b.name}
                  disabled={disabled || (checking !== null && checking !== b.name)}
                  onClick={() => void check(b)}
                >
                  {tr('Відновити…')}
                </Button>
              </Group>
            ))}
          </Stack>
          {backups.length > SHOWN && (
            <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setAll(!all)}>
              {all
                ? tr('Показати менше')
                : trn(backups.length, 'Показати всі ({n})|Показати всі ({n})|Показати всі ({n})')}
            </Button>
          )}
        </Stack>
      )}
    </div>
  );
}

/**
 * What a backup holds, as parts to restore (1.12.0-beta.4): each part it has, ticked; a part it
 * lacks is not offered and changes nothing. «Відновити» puts in place only what is ticked.
 */
function RestoreCard({
  backup,
  busy,
  onRestore,
  onCancel,
}: {
  backup: BackupSummary;
  busy: boolean;
  onRestore: (parts: RestoreParts) => void;
  onCancel: () => void;
}) {
  // an older server says nothing of the running order: its counts do
  const playlist = backup.playlist ?? backup.programs + backup.items > 0;
  const pictures = backup.withPictures !== false && backup.pictures > 0;
  const has: RestoreParts = {
    look: backup.settings,
    programs: playlist,
    songs: backup.bundles.length > 0,
    pictures,
    start: !!backup.start,
  };
  const [parts, setParts] = useState<RestoreParts>(has);
  const tick = (key: keyof RestoreParts) => (e: { currentTarget: { checked: boolean } }) =>
    setParts({ ...parts, [key]: e.currentTarget.checked });
  const chosen = (Object.keys(has) as (keyof RestoreParts)[]).some((k) => has[k] && parts[k]);
  return (
    <Paper withBorder p="xs" radius="md" role="group" aria-label={tr('Відновити з копії')}>
      <Text size="xs" fw={500} mb={6}>
        {tr('Копія від {when}, версії {app}:', { when: when(backup.created), app: backup.app })}
      </Text>
      <Stack gap={6}>
        {has.look && (
          <Checkbox
            size="xs"
            checked={parts.look}
            onChange={tick('look')}
            label={tr('Вигляд і клавіші')}
            description={tr('вигляд слайдів, пресети, клавіші, закладки й історія')}
          />
        )}
        {has.programs && (
          <Checkbox
            size="xs"
            checked={parts.programs}
            onChange={tick('programs')}
            label={tr('Програми й послідовність показу')}
            description={`${trn(backup.programs, '{n} програма|{n} програми|{n} програм')}, ${trn(
              backup.items,
              '{n} пункт у послідовності|{n} пункти в послідовності|{n} пунктів у послідовності',
            )}`}
          />
        )}
        {has.songs && (
          <Checkbox
            size="xs"
            checked={parts.songs}
            onChange={tick('songs')}
            label={tr('Пісні')}
            description={backup.bundles.join(', ')}
          />
        )}
        {has.pictures && (
          <Checkbox
            size="xs"
            checked={parts.pictures}
            onChange={tick('pictures')}
            label={tr('Зображення')}
            description={trn(backup.pictures, '{n} зображення|{n} зображення|{n} зображень')}
          />
        )}
        {has.start && backup.start && (
          <Checkbox
            size="xs"
            checked={parts.start}
            onChange={tick('start')}
            label={tr('Налаштування запуску')}
            description={tr('браузер «{browser}», порт {port}', {
              browser: browserName(backup.start.browser),
              port: backup.start.port,
            })}
          />
        )}
        {backup.withPictures === false && (
          <Text size="xs" c="dimmed">
            {tr('Зображень у цій копії немає — ваші лишаться як є.')}
          </Text>
        )}
      </Stack>
      <Text size="xs" c="dimmed" mt={6} mb={6}>
        {tr(
          'Позначене замінить поточне. Поточне збережеться окремо — його можна буде повернути тут само.',
        )}
      </Text>
      <Group gap="xs">
        <Button size="xs" loading={busy} disabled={!chosen} onClick={() => onRestore(parts)}>
          {tr('Відновити')}
        </Button>
        <Button size="xs" variant="default" disabled={busy} onClick={onCancel}>
          {tr('Скасувати')}
        </Button>
      </Group>
    </Paper>
  );
}

/** Save a blob under a name, as a download. */
function saveAs(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * «Резервна копія» (1.5.0, Налаштування вигляду → Застосунок): one .zip of the operator's own
 * things — the look, hotkeys, bookmarks and history, the running order and saved programs, the
 * song bundles and the pictures (server/src/backup.ts). «Відновити з копії…» first says what the
 * file holds; restoring keeps the state it replaces, and «Повернути як було» brings that back.
 * Both reload the window: the restored settings are taken as the newest at its start.
 */
export function BackupSection() {
  useLang();
  const serverAvailable = useServer((s) => s.available);
  const off = serverAvailable === false;
  const state = useQuery({
    queryKey: ['backup-state'],
    queryFn: api.backupState,
    enabled: !off,
  });
  // the picker forgets its file after each pick: the same file picked again counts again
  const resetPicker = useRef<() => void>(null);
  // «Повернути як було» asks first: it replaces what was changed since the restore
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState<BackupSummary | null>(null);
  const [busy, setBusy] = useState(false);
  // «Зберегти копію» over 1 GB: «Зберегти без зображень» offered
  const [tooBig, setTooBig] = useState(false);
  const fail = (e: unknown) =>
    notifications.show({ message: tr((e as Error).message), color: 'red' });

  const save = async (pictures = true) => {
    setSaving(true);
    try {
      const { blob, name } = await api.downloadBackup(pictures);
      saveAs(blob, name);
      setTooBig(false);
      notifications.show({
        message: tr('Копію збережено: {name}', { name }),
        color: 'green',
        autoClose: 3000,
      });
    } catch (e) {
      // over 1 GB with the pictures (1.12.0-beta.4): offered without them instead of refused
      if (pictures && e instanceof ApiFailure && e.status === 413) setTooBig(true);
      else fail(e);
    } finally {
      setSaving(false);
    }
  };
  const pick = async (file: File | null) => {
    if (!file) return;
    setChecking(true);
    setPending(null);
    try {
      setPending(await api.checkBackup(file));
    } catch (e) {
      fail(e);
    } finally {
      setChecking(false);
      resetPicker.current?.();
    }
  };
  const reloadAfter = async (
    act: () => Promise<{ uiCleared?: boolean } | unknown>,
    message: string,
  ) => {
    setBusy(true);
    try {
      const done = (await act()) as { uiCleared?: boolean } | undefined;
      if (done?.uiCleared) dropUiState();
      // the restored state here first (and in this browser's other windows), then the reload:
      // nothing of the old state is left to send back (review of #47)
      else await takeServerUiState();
      notifications.show({ message, color: 'green', autoClose: 2000 });
      window.setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      fail(e);
      setBusy(false);
      // a restore that failed midway: its file is used up, the way back is offered
      setPending(null);
      setConfirmUndo(false);
      void state.refetch();
    }
  };

  const last = state.data?.lastRestore ?? null;
  return (
    <div>
      <Text size="sm" fw={500} mb={2}>
        {tr('Резервна копія')}
      </Text>
      <Text size="xs" c="dimmed" mb={8}>
        {tr(
          'Один файл .zip: вигляд слайдів, пресети, клавіші, закладки й історія, послідовність показу й програми, пісні та зображення, налаштування запуску. Модулі, бібліотека й пульти в нього не входять.',
        )}
      </Text>
      {off ? (
        <Text size="xs" c="dimmed">
          {tr(NEEDS_SERVER)}
        </Text>
      ) : (
        <Stack gap="xs">
          <Group gap="xs" grow>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconArchive size={14} />}
              loading={saving}
              disabled={busy}
              onClick={() => void save()}
            >
              {tr('Зберегти копію')}
            </Button>
            <FileButton
              onChange={(f) => void pick(f)}
              accept=".zip,application/zip"
              resetRef={resetPicker}
            >
              {(props) => (
                <Button
                  {...props}
                  size="xs"
                  variant="default"
                  leftSection={<IconUpload size={14} />}
                  loading={checking}
                  disabled={busy}
                >
                  {tr('Відновити з копії…')}
                </Button>
              )}
            </FileButton>
          </Group>
          <AutoBackups disabled={busy || checking} onPicked={setPending} onFail={fail} />
          {tooBig && !pending && (
            <Paper withBorder p="xs" radius="md" role="group" aria-label={tr('Копія завелика')}>
              <Text size="xs" mb={6}>
                {tr(
                  'Зображення займають понад 1 ГБ — з ними копія завелика. Збережіть її без зображень: решта ввійде вся.',
                )}
              </Text>
              <Group gap="xs">
                <Button size="xs" loading={saving} onClick={() => void save(false)}>
                  {tr('Зберегти без зображень')}
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  disabled={saving}
                  onClick={() => setTooBig(false)}
                >
                  {tr('Скасувати')}
                </Button>
              </Group>
            </Paper>
          )}
          {pending && (
            <RestoreCard
              key={pending.id}
              backup={pending}
              busy={busy}
              onRestore={(parts) =>
                void reloadAfter(
                  () => api.restoreBackup(pending.id ?? '', parts),
                  tr('Відновлено. Вікно перезавантажується…'),
                )
              }
              onCancel={() => setPending(null)}
            />
          )}
          {last && !pending && (
            <div>
              <Group gap="xs" wrap="nowrap" justify="space-between">
                <Text size="xs" c="dimmed" style={{ minWidth: 0 }} title={last.from}>
                  {last.from
                    ? tr('Перенесено {at} з копії {folder}.', {
                        at: when(last.at),
                        folder: shortName(last.from),
                      })
                    : tr('Відновлено {at} з копії від {when}.', {
                        at: when(last.at),
                        when: when(last.created),
                      })}
                </Text>
                {!confirmUndo && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    leftSection={<IconArrowBackUp size={14} />}
                    disabled={busy}
                    onClick={() => setConfirmUndo(true)}
                  >
                    {tr('Повернути як було')}
                  </Button>
                )}
              </Group>
              {confirmUndo && (
                <Paper withBorder p="xs" radius="md" mt={6}>
                  <Text size="xs" mb={6}>
                    {last.from
                      ? tr(
                          'Повернеться стан до перенесення. Те, що змінено після нього, буде замінено, але збережеться окремо в папці data/backups/.',
                        )
                      : tr(
                          'Повернеться стан до відновлення. Те, що змінено після нього, буде замінено, але збережеться окремо в папці data/backups/.',
                        )}
                  </Text>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      loading={busy}
                      onClick={() =>
                        void reloadAfter(
                          api.undoRestore,
                          tr('Повернуто як було. Вікно перезавантажується…'),
                        )
                      }
                    >
                      {tr('Повернути')}
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      disabled={busy}
                      onClick={() => setConfirmUndo(false)}
                    >
                      {tr('Скасувати')}
                    </Button>
                  </Group>
                </Paper>
              )}
            </div>
          )}
        </Stack>
      )}
    </div>
  );
}
