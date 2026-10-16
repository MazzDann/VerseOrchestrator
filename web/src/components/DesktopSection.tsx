import { useEffect, useRef, useState } from 'react';
import { Button, Group, Progress, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAppWindow, IconDownload } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DesktopState } from '../api';
import { tr, useLang } from '../i18n';
import { clearBrowserData } from '../lib/browserData';
import { formatSize } from '../lib/modules';
import { useServer } from '../serverStore';

/**
 * «Окремий застосунок» (1.18.0-beta.1): in a browser, the way over to the desktop app (desktop/, Electron).
 * A release copy has it next to app/ or fetches it from its own version's archive; «Відкрити
 * застосунок» starts it on this app (it takes over as the control window, this tab goes standby),
 * and «Прибрати дані з цього браузера» clears what this browser kept for the app (browserData.ts,
 * then public/moved.html, a page with none of the app's code).
 */
export function DesktopSection({ active }: { active: boolean }) {
  useLang();
  const serverAvailable = useServer((s) => s.available);
  const qc = useQueryClient();
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ['desktop'],
    queryFn: api.desktop,
    enabled: active && serverAvailable === true,
    refetchInterval: (x) =>
      ['download', 'verify', 'unpack'].includes(x.state.data?.install?.phase ?? '') ? 1000 : false,
  });
  const act = async (fn: () => Promise<DesktopState>, after?: () => void) => {
    setBusy(true);
    try {
      qc.setQueryData(['desktop'], await fn());
      after?.();
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    } finally {
      setBusy(false);
    }
  };
  // installed from here (1.18.1, the user's ask): the app opens by itself and takes charge — this
  // browser's window then closes (lib/desktop.ts leaveForDesktop)
  const askedInstall = useRef(false);
  const installedNow = q.data?.install?.phase === 'done' && q.data.present;
  useEffect(() => {
    if (!installedNow || !askedInstall.current) return;
    askedInstall.current = false;
    void act(api.openDesktop, () => setOpened(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installedNow]);
  const s = q.data;
  if (serverAvailable !== true || !s) return null;
  const install = s.install;
  const working = ['download', 'verify', 'unpack'].includes(install?.phase ?? '');

  return (
    <Stack gap={6} mt="sm">
      <Text size="sm" fw={500}>
        {tr('Окремий застосунок')}
      </Text>
      <Text size="xs" c="dimmed">
        {tr(
          'VerseOrchestrator може працювати у власному вікні, без браузера: вікна виводу самі стають на весь екран на іншому екрані, звук іде без кліку, а вікно керування завжди одне.',
        )}
      </Text>
      {!s.release ? (
        <Text size="xs" c="dimmed">
          {tr('У копії-репозиторії застосунок запускається з теки desktop/: npm start.')}
        </Text>
      ) : working && install ? (
        <Stack gap={4}>
          <Progress
            value={install.total ? (install.received / install.total) * 100 : 0}
            aria-label={tr('Застосунок')}
          />
          <Text size="xs" c="dimmed" aria-live="polite">
            {install.phase === 'download'
              ? tr('Завантажую застосунок: {got} з {total}', {
                  got: formatSize(install.received),
                  total: formatSize(install.total),
                })
              : install.phase === 'verify'
                ? tr('Перевіряю архів…')
                : tr('Розпаковую…')}
          </Text>
        </Stack>
      ) : !s.present ? (
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconDownload size={14} />}
            loading={busy}
            onClick={() => {
              askedInstall.current = true;
              void act(api.installDesktop);
            }}
          >
            {tr('Встановити застосунок')}
          </Button>
          <Text size="xs" c="dimmed">
            {tr(
              'Завантажиться архів цієї версії з GitHub (близько 230 МБ), з нього лишиться сам застосунок.',
            )}
          </Text>
        </Group>
      ) : (
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconAppWindow size={14} />}
            loading={busy}
            onClick={() => void act(api.openDesktop, () => setOpened(true))}
          >
            {tr('Відкрити застосунок')}
          </Button>
        </Group>
      )}
      {/* a failed try is moot once the app is there (put by hand, or a later try) */}
      {!s.present && install?.phase === 'error' && install.error && (
        <Text size="xs" c="orange">
          {tr(install.error)}
        </Text>
      )}
      {s.release && s.present && (
        <Text size="xs" c="dimmed">
          {opened
            ? tr(
                'Застосунок відкривається й бере керування на себе. Коли він з’явиться, ця вкладка закриється сама. Щоб цей браузер не зберігав даних застосунку, приберіть їх — налаштування лишаться в застосунку.',
              )
            : tr(
                'Відтепер файл запуску відкриває застосунок. Перейшовши, приберіть дані застосунку з браузера — налаштування лишаються в застосунку.',
              )}
        </Text>
      )}
      {s.release && s.present && (
        <Group>
          <Button
            size="xs"
            variant="default"
            onClick={() =>
              void clearBrowserData().then(() =>
                // after its second wipe (another window's last write), off to a page with no stores
                setTimeout(() => window.location.replace('/moved.html'), 700),
              )
            }
          >
            {tr('Прибрати дані з цього браузера')}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
