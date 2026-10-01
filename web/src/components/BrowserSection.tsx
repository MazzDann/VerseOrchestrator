import { Select, Switch, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, DEFAULT_LAUNCH, type LaunchSettings } from '../api';
import { useServer, NEEDS_SERVER, versionText } from '../serverStore';
import { tr, useLang } from '../i18n';
import { appWindowState, browserOptions } from '../lib/launchBrowser';

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
      {version}
    </div>
  );
}
