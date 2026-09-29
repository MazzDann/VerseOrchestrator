import { useState } from 'react';
import { Button, Checkbox, Group, Popover, Stack, Text } from '@mantine/core';
import { IconPower } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useServer, NEEDS_SERVER, START_AGAIN } from '../serverStore';
import { browserDataBytes, clearBrowserData } from '../lib/browserData';
import { currentOutputs } from '../lib/outputs';
import { closeOutput } from '../openPresenter';
import { tr, useLang } from '../i18n';

const size = (b: number) =>
  b < 1048576 ? tr('менше 1 МБ') : tr('≈ {mb} МБ', { mb: Math.round(b / 1048576) });

/**
 * «Вимкнути повністю» (0.7.1): the app, its standby waiter and the «Запуск за адресою»
 * autostart go — nothing keeps running or starts with the computer; the output windows close;
 * phones and remotes say «Застосунок вимкнено». Optionally the browser also forgets what it
 * keeps for this address (lib/browserData.ts).
 */
export function ShutdownSection() {
  const serverAvailable = useServer((s) => s.available);
  const [confirming, setConfirming] = useState(false);
  const [forget, setForget] = useState(false);
  const [bytes, setBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const qc = useQueryClient();
  useLang();

  const openConfirm = () => {
    setForget(false);
    setConfirming(true);
    void browserDataBytes().then(setBytes);
  };

  const shutDown = async () => {
    setBusy(true);
    try {
      await api.shutdown();
      for (const o of currentOutputs()) closeOutput(o);
      if (forget) await clearBrowserData();
      // «Запуск за адресою» above must not keep showing the last «працює»
      qc.removeQueries({ queryKey: ['standby'] });
      setConfirming(false);
      setDone(true);
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося вимкнути: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div role="status">
        <Text size="sm" fw={500} mb={2}>
          {tr('Застосунок вимкнено')}
        </Text>
        <Text size="xs" c="dimmed">
          {tr(START_AGAIN)} {tr('Цю вкладку можна закрити.')}
        </Text>
      </div>
    );
  }
  return (
    <div>
      <Text size="sm" fw={500} mb={2}>
        {tr('Вимкнути повністю')}
      </Text>
      <Text size="xs" c="dimmed" mb={8}>
        {tr(
          'Зупиняє застосунок і очікувача, вимикає «Запуск за адресою» разом з комп’ютером, закриває вікна виводу. Після цього нічого не працює у фоні.',
        )}
      </Text>
      <Popover
        opened={confirming}
        onChange={setConfirming}
        width={300}
        position="top-start"
        withArrow
        shadow="md"
        trapFocus
      >
        <Popover.Target>
          <Button
            size="xs"
            variant="default"
            fullWidth
            leftSection={<IconPower size={14} />}
            disabled={serverAvailable === false || busy}
            title={serverAvailable === false ? tr(NEEDS_SERVER) : undefined}
            onClick={() => (confirming ? setConfirming(false) : openConfirm())}
          >
            {tr('Вимкнути повністю…')}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {tr('Вимкнути застосунок?')}
            </Text>
            <Text size="xs">
              {tr(
                'Показ зупиниться: пульти й телефони глядачів відключаться, вікна виводу закриються.',
              )}{' '}
              {tr(START_AGAIN)}
            </Text>
            <Checkbox
              size="xs"
              checked={forget}
              onChange={(e) => setForget(e.currentTarget.checked)}
              label={
                tr('Також стерти дані браузера для {host}', { host: location.host }) +
                (bytes != null ? ` (${size(bytes)})` : '')
              }
              description={tr(
                'Копії налаштувань і послідовності в цьому браузері та кеш бібліотеки. Самі налаштування лишаються в папці застосунку (data/).',
              )}
            />
            <Group gap="xs" justify="flex-end">
              <Button size="xs" variant="default" onClick={() => setConfirming(false)}>
                {tr('Скасувати')}
              </Button>
              <Button size="xs" loading={busy} onClick={() => void shutDown()}>
                {tr('Вимкнути')}
              </Button>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
}
