import { useState } from 'react';
import { Button, Group, Popover, Select, Switch, Text } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, ApiFailure, DEFAULT_LAUNCH, type BrowserListing, type LaunchSettings } from '../api';
import { useServer, NEEDS_SERVER, versionText } from '../serverStore';
import { tr, useLang } from '../i18n';
import {
  appWindowState,
  browserOptions,
  openNowAsks,
  openNowTarget,
  pageBrowsers,
  type NavigatorLike,
} from '../lib/launchBrowser';
import { rememberedBrowser } from '../lib/handover';
import { useOutputWindows } from '../lib/outputs';

/**
 * «Відкривати вікно керування в…» (2026-10-01, the user's ask: work in one browser, the show in
 * another): the browser the start file and the shortcut open the control window in — the
 * system's, or one found on this computer (server/src/browsers.ts) — and «Окремим вікном» for the
 * ones that can (Chromium's `--app`). Kept in data/settings.json → launch: the launcher reads it
 * before it opens anything. The version stands here too, as asked («туди ж й цифри»). The list is
 * read only while the «Застосунок» group is open (`active`).
 */
export function BrowserSection({ active }: { active: boolean }) {
  useLang();
  const serverAvailable = useServer((s) => s.available);
  const devLabel = useServer((s) => s.devLabel);
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['server-settings'],
    queryFn: api.serverSettings,
    enabled: serverAvailable === true,
  });
  const browsers = useQuery({
    queryKey: ['browsers'],
    queryFn: api.browsers,
    enabled: serverAvailable === true && active,
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: (launch: Partial<LaunchSettings>) => api.updateServerSettings({ launch }),
    onSuccess: (s) => qc.setQueryData(['server-settings'], s),
    onError: (e) => notifications.show({ message: tr((e as Error).message), color: 'red' }),
  });

  const version = (
    <Text size="xs" c="dimmed" mt={8}>
      {tr('Версія: {version}', { version: versionText(devLabel, __APP_VERSION__) })}
    </Text>
  );
  const title = (
    <Text size="sm" fw={500} mb={2}>
      {tr('Відкривати вікно керування в…')}
    </Text>
  );
  if (serverAvailable === false)
    return (
      <div>
        {title}
        <Text size="xs" c="dimmed">
          {tr(NEEDS_SERVER)}
        </Text>
        {version}
      </div>
    );

  const launch = settings.data?.launch ?? DEFAULT_LAUNCH;
  const list = browsers.data?.browsers ?? [];
  const options = browserOptions(launch, list);
  const ready = !!settings.data && !!browsers.data;
  const appWindow = appWindowState(launch, list);
  // «Відкрити в {browser} зараз» (2026-10-01): to the chosen browser at once, not at the next start
  const target = ready
    ? openNowTarget(
        launch,
        list,
        pageBrowsers(navigator as unknown as NavigatorLike),
        rememberedBrowser(),
      )
    : null;

  return (
    <div>
      {title}
      <Text size="xs" c="dimmed" mb={8}>
        {tr('Так його відкривають файл запуску й ярлик — з наступного запуску.')}
      </Text>
      <Select
        aria-label={tr('Відкривати вікно керування в…')}
        data={options}
        value={ready ? launch.browser : null}
        placeholder={
          browsers.isError
            ? tr('Стан недоступний: {error}', { error: tr(browsers.error.message) })
            : tr('Завантаження…')
        }
        disabled={!ready || save.isPending}
        allowDeselect={false}
        onChange={(v) => {
          if (v && v !== launch.browser) save.mutate({ browser: v });
        }}
        mb={8}
      />
      <Switch
        label={tr('Окремим вікном')}
        description={ready ? appWindow.hint : undefined}
        checked={ready && appWindow.can && launch.appWindow}
        disabled={!ready || !appWindow.can || save.isPending}
        onChange={(e) => save.mutate({ appWindow: e.currentTarget.checked })}
      />
      {target && <OpenNow browser={target} disabled={save.isPending} />}
      {version}
    </div>
  );
}

/**
 * «Відкрити в {browser} зараз»: the server opens the control window in the chosen browser (as
 * the start file would), and that window takes charge (server/src/handover.ts, lib/handover.ts);
 * this one stays, saying where control went. The output windows opened from this browser can't
 * follow (each browser has a window bus of its own): with any open, a word first.
 */
function OpenNow({ browser, disabled }: { browser: BrowserListing; disabled: boolean }) {
  const qc = useQueryClient();
  const outputs = useOutputWindows();
  const [confirm, setConfirm] = useState(false);
  const open = useMutation({
    mutationFn: () => api.openControlWindow(window.location.origin),
    onSuccess: (r) =>
      notifications.show({
        message: tr('Відкриваю вікно керування в {browser}…', { browser: r.browser }),
        color: 'brand',
        autoClose: 4000,
      }),
    onError: (e) => {
      notifications.show({ message: (e as Error).message, color: 'red' });
      // gone from the computer: the field marks it «(не знайдено)», the button goes
      if (e instanceof ApiFailure && e.status === 404)
        void qc.invalidateQueries({ queryKey: ['browsers'] });
    },
  });
  const vars = { browser: browser.name };
  return (
    <Popover opened={confirm} onChange={setConfirm} position="bottom-start" withArrow shadow="md">
      <Popover.Target>
        <Button
          size="xs"
          variant="light"
          mt={8}
          leftSection={<IconExternalLink size={14} />}
          loading={open.isPending}
          disabled={disabled}
          onClick={() => (openNowAsks(outputs) ? setConfirm((o) => !o) : open.mutate())}
        >
          {tr('Відкрити в {browser} зараз', vars)}
        </Button>
      </Popover.Target>
      <Popover.Dropdown maw={300}>
        <Text size="xs" mb="xs">
          {tr(
            'Вікна показу цього браузера лишаться тут — відкрийте показ знову в {browser}.',
            vars,
          )}
        </Text>
        <Group gap="xs" justify="flex-end">
          <Button size="xs" variant="default" onClick={() => setConfirm(false)}>
            {tr('Скасувати')}
          </Button>
          <Button
            size="xs"
            onClick={() => {
              setConfirm(false);
              open.mutate();
            }}
          >
            {tr('Перейти в {browser}', vars)}
          </Button>
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}
