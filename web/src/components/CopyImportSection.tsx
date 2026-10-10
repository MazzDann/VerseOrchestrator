import { useState } from 'react';
import { Badge, Button, Checkbox, Group, Paper, Stack, Text } from '@mantine/core';
import { IconFolderSearch, IconTransferIn } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type CopyInfo, type CopyParts } from '../api';
import { takeServerUiState } from '../lib/uiState';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { fmtDateTime, tr, trn, useLang } from '../i18n';
import { FolderPicker } from './AlbumsView';

/** The last part of a folder's path: «VerseOrchestrator-1.8.4-windows-x64». */
const shortName = (folder: string) => folder.split(/[\\/]/).filter(Boolean).pop() ?? folder;

/** What a copy holds, in one line: only what it has. */
function holds(c: CopyInfo, pairings = true): string {
  const parts = [
    c.look ? tr('вигляд і клавіші') : null,
    c.programs > 0 ? trn(c.programs, '{n} програма|{n} програми|{n} програм') : null,
    c.bundles > 0 ? trn(c.bundles, '{n} бандл пісень|{n} бандли пісень|{n} бандлів пісень') : null,
    c.pictures > 0 ? trn(c.pictures, '{n} зображення|{n} зображення|{n} зображень') : null,
    c.albums + c.videos > 0
      ? trn(c.albums + c.videos, '{n} альбом чи відео|{n} альбоми чи відео|{n} альбомів чи відео')
      : null,
    pairings && c.pairings > 0 ? trn(c.pairings, '{n} пульт|{n} пульти|{n} пультів') : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : tr('даних немає');
}

/** «1.11.0 · змінено 09.10, 19:26 · працює» */
function about(c: CopyInfo): string {
  return [
    c.version ? tr('версія {version}', { version: c.version }) : null,
    c.changed ? tr('змінено {when}', { when: fmtDateTime(c.changed) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * «Перенести з іншої копії…» (1.12.0-beta.2, Налаштування вигляду → Застосунок, under «Резервна
 * копія»): another copy of the app on this computer — the one running on the port, the ones beside
 * this folder, or a folder picked — hands over the operator's things, the start settings and the
 * speaker remotes' pairings (server/src/otherCopy.ts). What it replaces is kept: «Повернути як
 * було» in «Резервна копія» brings it back.
 */
export function CopyImportSection() {
  useLang();
  const queryClient = useQueryClient();
  const off = useServer((s) => s.available) === false;
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<CopyInfo | null>(null);
  const [parts, setParts] = useState<CopyParts>({ things: true, launch: true, pairings: true });
  const [busy, setBusy] = useState(false);
  const copies = useQuery({
    queryKey: ['copies'],
    queryFn: api.copies,
    enabled: open && !off,
    staleTime: 0,
  });
  const fail = (e: unknown) =>
    notifications.show({ message: tr((e as Error).message), color: 'red' });

  /**
   * A copy picked: a part it has nothing of starts unticked, and so do the pairings of a folder
   * picked by hand — one found beside this copy is as trusted as this copy's own folder, a folder
   * from elsewhere (a flash drive) is not: its remotes come over only when ticked (review).
   */
  const choose = (c: CopyInfo, byHand = false) => {
    setChosen(c);
    setPicking(false);
    setParts({
      things: c.look || c.programs + c.bundles + c.pictures + c.albums + c.videos > 0,
      launch: c.settings,
      pairings: c.app && c.pairings > 0 && !byHand,
    });
  };
  const picked = async (path: string) => {
    try {
      choose(await api.describeCopy(path), true);
    } catch (e) {
      fail(e);
    }
  };
  const carry = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      await api.importCopy(chosen.folder, parts);
      if (parts.things) {
        // the carried look here first (and in this browser's other windows), then the reload —
        // as a restore does (BackupSection)
        await takeServerUiState();
        notifications.show({
          message: tr('Перенесено. Вікно перезавантажується…'),
          color: 'green',
          autoClose: 2000,
        });
        window.setTimeout(() => window.location.reload(), 700);
        return;
      }
      notifications.show({
        message: parts.launch
          ? tr('Перенесено. Нові налаштування запуску діятимуть з наступного запуску.')
          : tr('Перенесено.'),
        color: 'green',
        autoClose: 3000,
      });
      setChosen(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['backup-state'] });
      void queryClient.invalidateQueries({ queryKey: ['server-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['remotes'] });
    } catch (e) {
      fail(e);
      void queryClient.invalidateQueries({ queryKey: ['backup-state'] });
    }
    setBusy(false);
  };

  const nothing = !parts.things && !parts.launch && !parts.pairings;
  return (
    <div>
      <Text size="sm" fw={500} mb={2}>
        {tr('Інша копія')}
      </Text>
      <Text size="xs" c="dimmed" mb={8}>
        {tr(
          'Якщо поруч є старіша чи інша копія застосунку, перенесіть з неї вигляд, програми, пісні, зображення, налаштування запуску й пульти.',
        )}
      </Text>
      {off ? (
        <Text size="xs" c="dimmed">
          {tr(NEEDS_SERVER)}
        </Text>
      ) : !open ? (
        <Button
          size="xs"
          variant="default"
          fullWidth
          leftSection={<IconTransferIn size={14} />}
          onClick={() => setOpen(true)}
        >
          {tr('Перенести з іншої копії…')}
        </Button>
      ) : chosen ? (
        <Paper
          withBorder
          p="xs"
          radius="md"
          role="group"
          aria-label={tr('Перенести з іншої копії')}
        >
          <Text size="xs" fw={500} truncate="end" title={chosen.folder}>
            {shortName(chosen.folder)}
          </Text>
          <Text size="xs" c="dimmed" mb={6} truncate="end" title={chosen.folder}>
            {[about(chosen), chosen.folder].filter(Boolean).join(' · ')}
          </Text>
          <Stack gap={6} mb={6}>
            <Checkbox
              size="xs"
              checked={parts.things}
              onChange={(e) => setParts({ ...parts, things: e.currentTarget.checked })}
              label={tr('Вигляд, програми, пісні, зображення, альбоми й відео')}
              description={holds(chosen, false)}
            />
            <Checkbox
              size="xs"
              checked={parts.launch}
              disabled={!chosen.settings}
              onChange={(e) => setParts({ ...parts, launch: e.currentTarget.checked })}
              label={tr('Налаштування запуску')}
              description={
                chosen.browser
                  ? tr('браузер ({browser}), адреса, оновлення; модулі лишаються цієї копії', {
                      browser: chosen.browser,
                    })
                  : tr('браузер, адреса, оновлення; модулі лишаються цієї копії')
              }
            />
            <Checkbox
              size="xs"
              checked={parts.pairings}
              disabled={chosen.pairings === 0 || !chosen.app}
              onChange={(e) => setParts({ ...parts, pairings: e.currentTarget.checked })}
              label={trn(
                chosen.pairings,
                'Пульти доповідача ({n})|Пульти доповідача ({n})|Пульти доповідача ({n})',
              )}
              description={
                !chosen.app
                  ? tr('лише з папки копії застосунку — тієї, де лежать app і data')
                  : chosen.pairingNames.length > 0
                    ? tr(
                        '{names} — додаються до пультів цієї копії, телефони не треба зв’язувати знову',
                        {
                          names:
                            chosen.pairingNames.join(', ') +
                            (chosen.pairings > chosen.pairingNames.length ? '…' : ''),
                        },
                      )
                    : tr('додаються до пультів цієї копії — телефони не треба зв’язувати знову')
              }
            />
          </Stack>
          {chosen.newer && (
            <Text size="xs" c="orange" mb={6}>
              {tr(
                'Та копія новіша ({version}): частину її даних ця версія може не прочитати. Краще спершу оновіть цю копію.',
                { version: chosen.version ?? '' },
              )}
            </Text>
          )}
          <Text size="xs" c="dimmed" mb={6}>
            {tr(
              'Позначене замінить поточне в цій копії. Поточне збережеться окремо — його можна буде повернути в «Резервна копія». Та копія лишиться як є.',
            )}
          </Text>
          <Group gap="xs">
            <Button size="xs" loading={busy} disabled={nothing} onClick={() => void carry()}>
              {tr('Перенести')}
            </Button>
            <Button size="xs" variant="default" disabled={busy} onClick={() => setChosen(null)}>
              {tr('Назад')}
            </Button>
          </Group>
        </Paper>
      ) : picking ? (
        <Paper withBorder p="xs" radius="md">
          <FolderPicker
            mode="copy"
            onDone={() => setPicking(false)}
            onPick={(p) => void picked(p)}
          />
        </Paper>
      ) : (
        <Paper withBorder p="xs" radius="md">
          {copies.isLoading ? (
            <Text size="xs" c="dimmed">
              {tr('Шукаю інші копії…')}
            </Text>
          ) : copies.isError ? (
            <Text size="xs" c="red">
              {tr((copies.error as Error).message)}
            </Text>
          ) : (copies.data ?? []).length === 0 ? (
            <Text size="xs" c="dimmed">
              {tr('Поруч з цією копією інших не знайдено. Виберіть папку іншої копії вручну.')}
            </Text>
          ) : (
            <div>
              {(copies.data ?? []).map((c) => (
                <div
                  key={c.dataDir}
                  role="button"
                  tabIndex={0}
                  className="vo-verse-item"
                  title={c.folder}
                  onClick={() => choose(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      choose(c);
                    }
                  }}
                  style={{ minWidth: 0 }}
                >
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <Text size="xs" fw={500} truncate="end" style={{ minWidth: 0 }}>
                      {shortName(c.folder)}
                    </Text>
                    {c.running && (
                      <Badge size="xs" variant="light" color="brand" style={{ flexShrink: 0 }}>
                        {tr('працює')}
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed" truncate="end">
                    {about(c)}
                  </Text>
                  <Text size="xs" c="dimmed" truncate="end">
                    {holds(c)}
                  </Text>
                </div>
              ))}
            </div>
          )}
          <Group gap="xs" mt={6} justify="space-between" wrap="nowrap">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconFolderSearch size={14} />}
              onClick={() => setPicking(true)}
            >
              {tr('Вибрати папку…')}
            </Button>
            <Button size="xs" variant="subtle" color="gray" onClick={() => setOpen(false)}>
              {tr('Закрити')}
            </Button>
          </Group>
        </Paper>
      )}
    </div>
  );
}
