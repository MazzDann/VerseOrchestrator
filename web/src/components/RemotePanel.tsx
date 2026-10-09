import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  Popover,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconAdjustmentsHorizontal,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceMobilePlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type PairingKind, type RemoteCommand } from '../api';
import { PhoneLink } from './PhoneLink';
import { REMOTE_LABEL } from '../lib/remote';
import { tr, useLang } from '../i18n';

/** In display order. New abilities (`show`, 0.6.0) start unticked — the operator turns them on. */
const ALL: RemoteCommand[] = [
  'next',
  'prev',
  'show',
  'pick',
  'songs',
  'playlist',
  'blank',
  'black',
  // a computer's (`/desk`) since 1.9.0-beta.10, a phone's too since 1.11.0-beta.1
  'cover',
  'countdown',
];
/** Without these a computer can't put its own verses on screen: said under the boxes. */
const DESK_SHOWS: RemoteCommand[] = ['show', 'pick'];

/**
 * Speaker-remote pairing (server/src/remote.ts): create a scoped remote, show its QR once
 * (the token is only returned at creation), and list/revoke pairings. Rendered inside a
 * FloatingPanel. The list refreshes when the control socket reports a change.
 */
export function RemotePanel() {
  useLang();
  const qc = useQueryClient();
  const remotes = useQuery({
    queryKey: ['remotes'],
    queryFn: api.remotes,
    refetchInterval: 10_000, // safety net if a change notification is missed
  });
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PairingKind>('phone');
  const [allowed, setAllowed] = useState<RemoteCommand[]>(['next', 'prev', 'blank']);
  const [fresh, setFresh] = useState<{
    name: string;
    token: string;
    kind: PairingKind;
    reissued?: boolean;
  } | null>(null);
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
        message: tr('Не вдалося змінити налаштування: {error}', {
          error: tr((e as Error).message),
        }),
        color: 'red',
      });
    }
  };

  // What an existing remote may do (0.6.0); its open page updates its buttons at once.
  const setRemoteAllowed = async (id: string, next: RemoteCommand[]) => {
    try {
      await api.updateRemote(id, next);
      void qc.invalidateQueries({ queryKey: ['remotes'] });
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося змінити дозволи: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    }
  };

  const reissue = async (id: string) => {
    setConfirmId(null);
    try {
      const r = await api.reissueRemote(id);
      setFresh({ name: r.name, token: r.token, kind: r.kind, reissued: true });
      void qc.invalidateQueries({ queryKey: ['remotes'] });
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося перевипустити код: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.createRemote(
        name.trim() || tr('Пульт {n}', { n: (remotes.data?.length ?? 0) + 1 }),
        allowed.filter((c) => ALL.includes(c)),
        kind,
      );
      setFresh({ name: r.name, token: r.token, kind: r.kind });
      setName('');
      void qc.invalidateQueries({ queryKey: ['remotes'] });
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося створити пульт: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string, n: string) => {
    try {
      await api.revokeRemote(id);
      notifications.show({
        message: tr('Пульт «{remote}» відкликано', { remote: n }),
        color: 'green',
        autoClose: 1500,
      });
      void qc.invalidateQueries({ queryKey: ['remotes'] });
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося відкликати: {error}', { error: tr((e as Error).message) }),
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
            {fresh.reissued
              ? tr('Новий код для «{remote}»', { remote: fresh.name })
              : tr('Пульт «{remote}» готовий', { remote: fresh.name })}
          </Text>
          {fresh.reissued && (
            <Text size="xs" c="dimmed">
              {fresh.kind === 'desk'
                ? tr('Комп’ютер зі старим посиланням уже відключено.')
                : tr('Телефон зі старим кодом уже відключено.')}
            </Text>
          )}
          {fresh.kind === 'desk' ? (
            <PhoneLink
              computer
              path={`/desk#${encodeURIComponent(fresh.token)}`}
              caption={tr(
                'Відкрийте це посилання в браузері іншого комп’ютера (та сама мережа): там буде вікно керування з дозволеним вище. Посилання показується лише зараз; загубили — перевипустіть.',
              )}
            />
          ) : (
            <PhoneLink
              path={`/remote#${encodeURIComponent(fresh.token)}`}
              caption={tr(
                'Доповідач сканує цей QR своїм телефоном (та сама мережа Wi-Fi). Код показується лише зараз; загубили — перевипустіть.',
              )}
            />
          )}
          <Button variant="default" size="xs" onClick={() => setFresh(null)}>
            {tr('Готово')}
          </Button>
        </>
      ) : (
        <>
          <SegmentedControl
            size="xs"
            fullWidth
            aria-label={tr('Для чого пульт')}
            value={kind}
            onChange={(v) => setKind(v as PairingKind)}
            data={[
              { value: 'phone', label: tr('Телефон') },
              { value: 'desk', label: tr('Комп’ютер') },
            ]}
          />
          <Text size="xs" c="dimmed">
            {kind === 'desk'
              ? tr(
                  'Вікно керування на іншому комп’ютері мережі: пошук, вірші, переклади й те, що ви дозволите. Налаштувань і вікон виводу там немає.',
                )
              : tr(
                  'Дайте доповідачу телефон-пульт: він зможе гортати показ, але не бачитиме налаштувань.',
                )}
          </Text>
          <TextInput
            size="xs"
            label={tr('Назва')}
            placeholder={tr('Наприклад, «Доповідач»')}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={40}
          />
          <Checkbox.Group
            label={tr('Що дозволено')}
            value={allowed}
            onChange={(v) => setAllowed(v as RemoteCommand[])}
          >
            <Group gap="sm" mt={4}>
              {ALL.map((c) => (
                <Checkbox key={c} size="xs" value={c} label={tr(REMOTE_LABEL[c])} />
              ))}
            </Group>
          </Checkbox.Group>
          {kind === 'desk' && DESK_SHOWS.some((c) => !allowed.includes(c)) && (
            <Text size="xs" c="dimmed">
              {tr('Щоб показувати звідти свої вірші, позначте «На екран» і «Вибір віршів».')}
            </Text>
          )}
          <Button
            size="xs"
            leftSection={
              kind === 'desk' ? <IconDeviceDesktop size={14} /> : <IconDeviceMobilePlus size={14} />
            }
            disabled={allowed.filter((c) => ALL.includes(c)).length === 0}
            loading={busy}
            onClick={create}
          >
            {kind === 'desk' ? tr('Створити посилання') : tr('Створити пульт')}
          </Button>
        </>
      )}

      <Divider label={tr('Пульти')} labelPosition="left" />
      {list.length === 0 ? (
        <Text size="xs" c="dimmed">
          {tr('Поки немає.')}
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
                  <Group gap={4} wrap="nowrap">
                    {p.kind === 'desk' ? (
                      <IconDeviceDesktop size={14} aria-label={tr('Комп’ютер')} />
                    ) : (
                      <IconDeviceMobile size={14} aria-label={tr('Телефон')} />
                    )}
                    <Text size="sm" fw={500} truncate>
                      {p.name}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" truncate>
                    {p.online
                      ? tr('на зв’язку')
                      : p.lastSeen
                        ? tr('не на зв’язку')
                        : tr('ще не підключався')}{' '}
                    · {p.allowed.map((c) => tr(REMOTE_LABEL[c])).join(', ')}
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
                    {tr('Перевипустити')}
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => setConfirmId(null)}
                  >
                    {tr('Ні')}
                  </Button>
                </Group>
              ) : (
                <Group gap={2} wrap="nowrap">
                  <Popover position="bottom-end" withArrow shadow="md" width={220}>
                    <Popover.Target>
                      <Tooltip label={tr('Що дозволено цьому пульту')}>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          aria-label={tr('Дозволи: {remote}', { remote: p.name })}
                        >
                          <IconAdjustmentsHorizontal size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Checkbox.Group
                        label={tr('Що дозволено «{remote}»', { remote: p.name })}
                        value={p.allowed}
                        onChange={(v) => void setRemoteAllowed(p.id, v as RemoteCommand[])}
                      >
                        <Stack gap={6} mt={6}>
                          {ALL.map((c) => (
                            <Checkbox key={c} size="xs" value={c} label={tr(REMOTE_LABEL[c])} />
                          ))}
                        </Stack>
                      </Checkbox.Group>
                      <Text size="xs" c="dimmed" mt={8}>
                        {p.kind === 'desk'
                          ? tr('Комп’ютер отримає зміни одразу, без нового посилання.')
                          : tr('Телефон отримає зміни одразу, без нового QR.')}
                      </Text>
                    </Popover.Dropdown>
                  </Popover>
                  <Tooltip
                    label={
                      p.kind === 'desk'
                        ? tr(
                            'Перевипустити посилання: нове посилання, старий комп’ютер втратить керування',
                          )
                        : tr('Перевипустити код: новий QR, старий телефон втратить керування')
                    }
                  >
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      onClick={() => setConfirmId(p.id)}
                      aria-label={tr('Перевипустити код {remote}', { remote: p.name })}
                    >
                      <IconRefresh size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip
                    label={
                      p.kind === 'desk'
                        ? tr('Відкликати: комп’ютер одразу втратить керування')
                        : tr('Відкликати: телефон одразу втратить керування')
                    }
                  >
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => void revoke(p.id, p.name)}
                      aria-label={tr('Відкликати {remote}', { remote: p.name })}
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
        label={tr('Пам’ятати пульти після перезапуску сервера')}
        description={
          persist
            ? tr('Зберігаються в data/secrets.json (лише хеш коду, не сам код).')
            : tr('Перезапуск сервера відкличе всі пульти.')
        }
      />
    </Stack>
  );
}
