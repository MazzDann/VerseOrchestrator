import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconDeviceMobilePlus, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type RemoteCommand } from '../api';
import { PhoneLink } from './PhoneLink';
import { REMOTE_LABEL } from '../lib/remote';

const ALL: RemoteCommand[] = ['next', 'prev', 'blank', 'black'];

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
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);

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
            Пульт «{fresh.name}» готовий
          </Text>
          <PhoneLink
            path={`/remote#${encodeURIComponent(fresh.token)}`}
            caption="Доповідач сканує цей QR своїм телефоном (та сама мережа Wi-Fi). Код показується лише зараз."
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
          Поки немає. Пульти діють до перезапуску сервера.
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
          ))}
        </Stack>
      )}
    </Stack>
  );
}
