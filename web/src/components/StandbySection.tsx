import { useState } from 'react';
import { Button, Group, NumberInput, Popover, Stack, Switch, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type StandbyStatus } from '../api';
import { useServer, NEEDS_SERVER } from '../serverStore';

const STATE_LABEL: Record<string, string> = {
  waiting: 'Адреса чекає, застосунок зупинено',
  starting: 'Застосунок запускається…',
  running: 'Застосунок працює',
  stopping: 'Застосунок зупиняється…',
};

/** Mirrors validStandbyPort on the server: unprivileged, not the app's own 5173/8787. */
const validPort = (n: unknown): n is number =>
  typeof n === 'number' &&
  Number.isInteger(n) &&
  n >= 1024 &&
  n <= 65535 &&
  n !== 5173 &&
  n !== 8787;

/** Resolves once something answers on `port` of this host (an opaque no-cors reply is enough). */
async function waitForPort(port: number, timeoutMs = 20_000): Promise<boolean> {
  const url = `${location.protocol}//${location.hostname}:${port}/__standby`;
  for (const end = Date.now() + timeoutMs; Date.now() < end; ) {
    try {
      await fetch(url, { mode: 'no-cors', cache: 'no-store' });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return false;
}

/**
 * «Запуск за адресою» (1.4.2): the standby waiter (server/src/standby.ts) keeps a port
 * and starts the app when someone opens it; it starts with the computer. Switching off
 * removes the autostart entry and retires the waiter. Changing the port relaunches a
 * running waiter on the new one — confirmed first, since everything the browser keeps
 * (settings, bookmarks, history, cached segments) belongs to the address.
 * Polls only while its settings group is open (`active`).
 */
export function StandbySection({ active }: { active: boolean }) {
  const serverAvailable = useServer((s) => s.available);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['standby'],
    queryFn: api.standby,
    enabled: active && serverAvailable !== false,
    refetchInterval: 3000,
    retry: false,
  });
  const [draft, setDraft] = useState<number | string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // what the confirmation says, fixed when it opens (the status keeps polling underneath)
  const [plan, setPlan] = useState({ port: 0, relaunch: false, moves: false });
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<number | null>(null);

  const apply = async (patch: { enabled?: boolean; port?: number }) => {
    setBusy(true);
    try {
      const r = await api.updateStandby(patch);
      qc.setQueryData<StandbyStatus>(['standby'], r);
      // a waiter just started or moved answers a moment later
      if (r.relaunching || (patch.enabled && !r.waiter)) {
        setTimeout(() => void qc.invalidateQueries({ queryKey: ['standby'] }), 1000);
      }
      return r;
    } catch (e) {
      notifications.show({ message: (e as Error).message, color: 'red' });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const title = (
    <Text size="sm" fw={500} mb={2}>
      Запуск за адресою
    </Text>
  );
  if (serverAvailable === false) {
    return (
      <div>
        {title}
        <Text size="xs" c="dimmed">
          {NEEDS_SERVER}
        </Text>
      </div>
    );
  }
  const s = q.data;
  if (!s) {
    return (
      <div>
        {title}
        <Text size="xs" c="dimmed">
          {q.isError ? `Стан недоступний: ${q.error.message}` : 'Завантаження…'}
        </Text>
      </div>
    );
  }

  const next = draft ?? s.port;
  const portChanged = validPort(next) && next !== s.port;
  const relaunchNeeded = !!s.waiter;
  const thisPageMoves = relaunchNeeded && location.port === String(s.port);

  const openConfirm = () => {
    if (!portChanged) return;
    setPlan({ port: next, relaunch: relaunchNeeded, moves: thisPageMoves });
    setConfirming(true);
  };

  const changePort = async () => {
    const { port } = plan;
    setConfirming(false);
    const r = await apply({ port });
    if (!r) return;
    setDraft(null);
    if (r.relaunching && location.port === String(s.port)) {
      // this page came through the waiter, whose app is about to stop: follow it
      setMoving(port);
      const up = await waitForPort(port);
      if (up) {
        const u = new URL(location.href);
        u.port = String(port);
        location.href = u.toString();
        return;
      }
      setMoving(null);
      notifications.show({ message: `Нова адреса не відповідає: ${r.urls.local}`, color: 'red' });
      return;
    }
    notifications.show({
      message: r.relaunching
        ? `Перезапуск на новій адресі ${r.urls.local}`
        : `Нова адреса: ${r.urls.local}`,
      color: 'green',
      autoClose: 2500,
    });
  };

  let status: string;
  if (moving) status = `Перезапуск на порту ${moving}… сторінка перейде туди сама`;
  else if (s.waiter?.retiring)
    status = 'Вимикається — щойно застосунок перестануть використовувати';
  else if (s.waiter) {
    const rss = s.waiter.rssBytes
      ? ` · очікувач ${Math.round(s.waiter.rssBytes / 1048576)} МБ`
      : '';
    status = `${STATE_LABEL[s.waiter.state] ?? s.waiter.state}${rss}`;
  } else if (s.enabled) status = 'Очікувач не працює — запуститься разом з комп’ютером';
  else status = '';

  return (
    <Stack gap={8}>
      <Switch
        size="sm"
        checked={s.enabled}
        disabled={!s.supported || busy || !!moving}
        onChange={(e) => void apply({ enabled: e.currentTarget.checked })}
        label="Запуск за адресою"
        description={
          s.supported
            ? `Невеликий процес тримає адресу й запускає застосунок, щойно її відкрити (і з телефона теж). Без роботи ${s.idleMinutes} хв застосунок зупиняється, а адреса чекає далі. Стартує разом з комп’ютером.`
            : 'Автозапуск не підтримується на цій системі.'
        }
      />
      {status && (
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {status}
          </Text>
          {s.enabled && !s.waiter && (
            <Button
              size="compact-xs"
              variant="light"
              loading={busy}
              onClick={() => void apply({ enabled: true })}
            >
              Запустити зараз
            </Button>
          )}
        </Group>
      )}
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <NumberInput
          size="xs"
          label="Порт"
          w={96}
          min={1024}
          max={65535}
          allowDecimal={false}
          allowNegative={false}
          hideControls
          value={next}
          disabled={busy || !!moving}
          onChange={(v) => setDraft(v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openConfirm();
          }}
        />
        <Popover
          opened={confirming}
          onChange={setConfirming}
          width={300}
          position="bottom-start"
          withArrow
          shadow="md"
          trapFocus
        >
          <Popover.Target>
            <Button
              size="xs"
              variant="light"
              disabled={!portChanged || busy || !!moving}
              onClick={() => (confirming ? setConfirming(false) : openConfirm())}
            >
              Змінити
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Змінити порт на {plan.port}?
              </Text>
              <Text size="xs">
                {plan.relaunch
                  ? plan.moves
                    ? 'Потрібен перезапуск: очікувач і застосунок перезапустяться на новій адресі, а ця сторінка перейде туди сама.'
                    : 'Потрібен перезапуск: очікувач перезапуститься на новій адресі.'
                  : 'Застосунок відкриватиметься за новою адресою; перезапуск не потрібен.'}
              </Text>
              <Text size="xs" c="orange">
                Налаштування вигляду, закладки й історія браузер зберігає окремо для кожної адреси —
                за новою вони почнуться з нуля.
              </Text>
              <Group gap="xs" justify="flex-end">
                <Button size="xs" variant="default" onClick={() => setConfirming(false)}>
                  Скасувати
                </Button>
                <Button size="xs" onClick={() => void changePort()}>
                  {plan.relaunch ? 'Так, перезапустити' : 'Змінити'}
                </Button>
              </Group>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>
      <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
        {[s.urls.local, ...s.urls.lan].join(' · ')}
      </Text>
    </Stack>
  );
}
