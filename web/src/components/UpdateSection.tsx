import { Anchor, Button, Group, Switch, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api } from '../api';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { fmtDateTime, tr, useLang } from '../i18n';
import { useUpdateState } from '../lib/updates';

/**
 * «Оновлення» (1.0.0): is there a newer version on GitHub? The server asks twice a day at most;
 * «Перевірити зараз» asks at once. Installing is the next step — for now the release page.
 */
export function UpdateSection() {
  useLang();
  const serverAvailable = useServer((s) => s.available);
  const queryClient = useQueryClient();
  const state = useUpdateState();
  const settings = useQuery({
    queryKey: ['server-settings'],
    queryFn: api.serverSettings,
    enabled: serverAvailable === true,
  });
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
    onError: (e) => notifications.show({ message: (e as Error).message, color: 'red' }),
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
  if (serverAvailable === false) status = tr(NEEDS_SERVER);
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
      <Text size="xs" c={state?.available ? undefined : 'dimmed'} mb={4}>
        {status}
      </Text>
      {state?.available && state.latest && (
        <Text size="xs" c="dimmed" mb={4}>
          <Anchor href={state.latest.url} target="_blank" rel="noreferrer" size="xs">
            {tr('Що нового')}
          </Anchor>
          {' · '}
          {state.install === 'release'
            ? tr('Щоб оновити, завантажте архів зі сторінки релізу й замініть папку app/.')
            : tr('Щоб оновити копію репозиторію, виконайте git pull і запустіть застосунок.')}
        </Text>
      )}
      <Group gap="xs" wrap="nowrap" mt={6}>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconRefresh size={14} />}
          loading={check.isPending}
          disabled={serverAvailable !== true}
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
          'Раз на 12 годин застосунок питає GitHub про нові версії. Нічого не завантажує й не встановлює сам.',
        )}
      </Text>
    </div>
  );
}
