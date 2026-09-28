import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  Popover,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconAdjustmentsHorizontal,
  IconDeviceMobilePlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type RemoteCommand } from '../api';
import { PhoneLink } from './PhoneLink';
import { REMOTE_LABEL } from '../lib/remote';

/** In display order. New abilities (`show`, 1.5.0) start unticked — the operator turns them on. */
const ALL: RemoteCommand[] = ['next', 'prev', 'show', 'blank', 'black'];

/**
 * Speaker-remote pairing (server/src/remote.ts): create a scoped remote, show its QR once
 * (the token is only returned at creation), and list/revoke pairings. Rendered inside a
 * FloatingPanel. The list refreshes when the control socket reports a change.
 */
export function RemotePanel() {
  const qc = useQueryClient();
  const remotes = useQuery({
    queryKey: ['remotes'],
    queryFn: api.remotes,
    refetchInterval: 10_000, // safety net if a change notification is missed
  });
  const [name, setName] = useState('');
  const [allowed, setAllowed] = useState<RemoteCommand[]>(['next', 'prev', 'blank']);
  const [fresh, setFresh] = useState<{ name: string; token: string; reissued?: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  /** Row awaiting «Перевипустити?» confirmation — reissuing cuts the current phone off. */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const serverSettings = useQuery({ queryKey: ['server-settings'], queryFn: api.serverSettings });
  const persist = serverSettings.data?.remotes.persist ?? true;

  const setPersist = async (on: boolean) => {
    try {
      await api.updateServerSettings({ remotes: { persist: on } });
      void qc.invalidateQueries({ queryKey: ['server-settings'] });
    } catch (e) {
      notifications.show({
        message: `Не вдалося змінити налаштування: ${(e as Error).message}`,
        color: 'red',
      });
    }
  };

  // What an existing remote may do (1.5.0); its open page updates its buttons at once.
  const setRemoteAllowed = async (id: string, next: RemoteCommand[]) => {
    try {
      await api.updateRemote(id, next);
      void qc.invalidateQueries({ queryKey: ['remotes'] });
    } catch (e) {
      notifications.show({
        message: `Не вдалося змінити дозволи: ${(e as Error).message}`,
        color: 'red',
      });
    }
  };

  const reissue = async (id: string) => {
    setConfirmId(null);
    try {
      const r = await api.reissueRemote(id);
      setFresh({ name: r.name, token: r.token, reissued: true });
      void qc.invalidateQueries({ queryKey: ['remotes'] });
    } catch (e) {
      notifications.show({
        message: `Не вдалося перевипустити код: ${(e as Error).message}`,
        color: 'red',
      });
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.createRemote(name, allowed);
      setFresh({ name: r.name, token: r.token });
      setName('');
      void qc.invalidateQueries({ queryKey: ['remotes'] });
    } catch (e) {
      notifications.show({
        message: `Не вдалося створити пульт: ${(e as Error).message}`,
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string, n: string) => {
    try {
      await api.revokeRemote(id);
      notifications.show({ message: `Пульт «${n}» відкликано`, color: 'green', autoClose: 1500 });
      void qc.invalidateQueries({ queryKey: ['remotes'] });
    } catch (e) {
      notifications.show({
        message: `Не вдалося відкликати: ${(e as Error).message}`,
        color: 'red',
      });
    }
  };

  const list = remotes.data ?? [];

  return (
    <Stack gap="sm" p="md">
      {fresh ? (
        <>
          <Text size="sm" fw={600}>
            {fresh.reissued ? `Новий код для «${fresh.name}»` : `Пульт «${fresh.name}» готовий`}
          </Text>
          {fresh.reissued && (
            <Text size="xs" c="dimmed">
              Телефон зі старим кодом уже відключено.
            </Text>
          )}
          <PhoneLink
            path={`/remote#${encodeURIComponent(fresh.token)}`}
            caption="Доповідач сканує цей QR своїм телефоном (та сама мережа Wi-Fi). Код показується лише зараз; загубили — перевипустіть."
          />
          <Button variant="default" size="xs" onClick={() => setFresh(null)}>
            Готово
          </Button>
        </>
      ) : (
        <>
          <Text size="xs" c="dimmed">
            Дайте доповідачу телефон-пульт: він зможе гортати показ, але не бачитиме налаштувань.
          </Text>
          <TextInput
            size="xs"
            label="Назва"
            placeholder="Наприклад, «Доповідач»"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={40}
          />
          <Checkbox.Group
            label="Що дозволено"
            value={allowed}
            onChange={(v) => setAllowed(v as RemoteCommand[])}
          >
            <Group gap="sm" mt={4}>
              {ALL.map((c) => (
                <Checkbox key={c} size="xs" value={c} label={REMOTE_LABEL[c]} />
              ))}
            </Group>
          </Checkbox.Group>
          <Button
            size="xs"
            leftSection={<IconDeviceMobilePlus size={14} />}
            disabled={allowed.length === 0}
            loading={busy}
            onClick={create}
          >
            Створити пульт
          </Button>
        </>
      )}

      <Divider label="Пульти" labelPosition="left" />
      {list.length === 0 ? (
        <Text size="xs" c="dimmed">
          Поки немає.
        </Text>
      ) : (
        <Stack gap={4}>
          {list.map((p) => (
            <Group key={p.id} gap={8} wrap="nowrap" justify="space-between">
              <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flex: 'none',
                    background: p.online
                      ? 'var(--mantine-color-green-filled)'
                      : 'var(--mantine-color-dimmed)',
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500} truncate>
                    {p.name}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {p.online ? 'на зв’язку' : p.lastSeen ? 'не на зв’язку' : 'ще не підключався'} ·{' '}
                    {p.allowed.map((c) => REMOTE_LABEL[c]).join(', ')}
                  </Text>
                </div>
              </Group>
              {confirmId === p.id ? (
                <Group gap={4} wrap="nowrap">
                  <Button
                    size="compact-xs"
                    color="red"
                    variant="light"
                    onClick={() => void reissue(p.id)}
                  >
                    Перевипустити
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => setConfirmId(null)}
                  >
                    Ні
                  </Button>
                </Group>
              ) : (
                <Group gap={2} wrap="nowrap">
                  <Popover position="bottom-end" withArrow shadow="md" width={220}>
                    <Popover.Target>
                      <Tooltip label="Що дозволено цьому пульту">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          aria-label={`Дозволи: ${p.name}`}
                        >
                          <IconAdjustmentsHorizontal size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Checkbox.Group
                        label={`Що дозволено «${p.name}»`}
                        value={p.allowed}
                        onChange={(v) => void setRemoteAllowed(p.id, v as RemoteCommand[])}
                      >
                        <Stack gap={6} mt={6}>
                          {ALL.map((c) => (
                            <Checkbox key={c} size="xs" value={c} label={REMOTE_LABEL[c]} />
                          ))}
                        </Stack>
                      </Checkbox.Group>
                      <Text size="xs" c="dimmed" mt={8}>
                        Телефон отримає зміни одразу, без нового QR.
                      </Text>
                    </Popover.Dropdown>
                  </Popover>
                  <Tooltip label="Перевипустити код: новий QR, старий телефон втратить керування">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      onClick={() => setConfirmId(p.id)}
                      aria-label={`Перевипустити код ${p.name}`}
                    >
                      <IconRefresh size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Відкликати: телефон одразу втратить керування">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => void revoke(p.id, p.name)}
                      aria-label={`Відкликати ${p.name}`}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              )}
            </Group>
          ))}
        </Stack>
      )}
      <Switch
        size="xs"
        mt="xs"
        checked={persist}
        disabled={!serverSettings.data}
        onChange={(e) => void setPersist(e.currentTarget.checked)}
        label="Пам’ятати пульти після перезапуску сервера"
        description={
          persist
            ? 'Зберігаються в data/secrets.json (лише хеш коду, не сам код).'
            : 'Перезапуск сервера відкличе всі пульти.'
        }
      />
    </Stack>
  );
}
