import { useRef, useState } from 'react';
import { Button, FileButton, Group, Paper, Stack, Text } from '@mantine/core';
import { IconArchive, IconArrowBackUp, IconUpload } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type BackupSummary } from '../api';
import { takeServerUiState } from '../lib/uiState';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { fmtDateTime, tr, trn, useLang } from '../i18n';

const when = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? fmtDateTime(t) : iso;
};

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
  const fail = (e: unknown) =>
    notifications.show({ message: tr((e as Error).message), color: 'red' });

  const save = async () => {
    setSaving(true);
    try {
      const { blob, name } = await api.downloadBackup();
      saveAs(blob, name);
      notifications.show({
        message: tr('Копію збережено: {name}', { name }),
        color: 'green',
        autoClose: 3000,
      });
    } catch (e) {
      fail(e);
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
  const reloadAfter = async (act: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await act();
      // the restored state here first (and in this browser's other windows), then the reload:
      // nothing of the old state is left to send back (review of #47)
      await takeServerUiState();
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
          'Один файл .zip: вигляд слайдів, пресети, клавіші, закладки й історія, послідовність показу й програми, пісні та зображення. Модулі, бібліотека й пульти в нього не входять.',
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
          {pending && (
            <Paper withBorder p="xs" radius="md" role="group" aria-label={tr('Відновити з копії')}>
              <Text size="xs" fw={500} mb={4}>
                {tr('Копія від {when}, версії {app}:', {
                  when: when(pending.created),
                  app: pending.app,
                })}
              </Text>
              <Text size="xs" component="ul" m={0} pl="md">
                {pending.settings && <li>{tr('вигляд, клавіші, закладки й історія')}</li>}
                <li>
                  {trn(pending.programs, '{n} програма|{n} програми|{n} програм')},{' '}
                  {trn(
                    pending.items,
                    '{n} пункт у послідовності|{n} пункти в послідовності|{n} пунктів у послідовності',
                  )}
                </li>
                <li>
                  {pending.bundles.length > 0
                    ? tr('пісні: {bundles}', { bundles: pending.bundles.join(', ') })
                    : tr('пісень немає')}
                </li>
                <li>{trn(pending.pictures, '{n} зображення|{n} зображення|{n} зображень')}</li>
              </Text>
              <Text size="xs" c="dimmed" mt={6} mb={6}>
                {tr(
                  'Вони замінять поточні. Поточні збережуться окремо — їх можна буде повернути тут само.',
                )}
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  loading={busy}
                  onClick={() =>
                    void reloadAfter(api.restoreBackup, tr('Відновлено. Вікно перезавантажується…'))
                  }
                >
                  {tr('Відновити')}
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  disabled={busy}
                  onClick={() => setPending(null)}
                >
                  {tr('Скасувати')}
                </Button>
              </Group>
            </Paper>
          )}
          {last && !pending && (
            <div>
              <Group gap="xs" wrap="nowrap" justify="space-between">
                <Text size="xs" c="dimmed" style={{ minWidth: 0 }}>
                  {tr('Відновлено {at} з копії від {when}.', {
                    at: when(last.at),
                    when: when(last.created),
                  })}
                </Text>
                {!confirmUndo && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    leftSection={<IconArrowBackUp size={14} />}
                    onClick={() => setConfirmUndo(true)}
                  >
                    {tr('Повернути як було')}
                  </Button>
                )}
              </Group>
              {confirmUndo && (
                <Paper withBorder p="xs" radius="md" mt={6}>
                  <Text size="xs" mb={6}>
                    {tr(
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
