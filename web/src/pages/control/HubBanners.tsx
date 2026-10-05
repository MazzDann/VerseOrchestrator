import { type MutableRefObject } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { IconPlugConnectedX, IconPower } from '@tabler/icons-react';
import { START_AGAIN } from '../../serverStore';
import { tr, useLang } from '../../i18n';
import { closeThisWindow } from '../../lib/closeWindow';
import { type LiveConnection } from '../../lib/liveSocket';

/**
 * The banners above the centre column: this window on standby, the app switched off, the hub
 * lost, and another browser's control window the one the hub listens to.
 */
export function HubBanners({
  isLeader,
  appOff,
  hubLost,
  hubActive,
  hubMovedTo,
  takeOver,
  controlConn,
}: {
  isLeader: boolean;
  appOff: boolean;
  hubLost: boolean;
  hubActive: boolean;
  hubMovedTo: string | null;
  takeOver: () => void;
  controlConn: MutableRefObject<LiveConnection | null>;
}) {
  useLang();
  return (
    <>
      {!isLeader && (
        <Group
          gap="sm"
          wrap="nowrap"
          px="md"
          py={6}
          role="status"
          style={{
            background: 'var(--mantine-color-default-hover)',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <Text size="sm" style={{ flex: 1 }}>
            {tr(
              'Показом керує інше вікно керування. Тут можна готувати наступне — на екран іде лише звідти.',
            )}
          </Text>
          <Button size="xs" variant="subtle" color="gray" onClick={closeThisWindow}>
            {tr('Закрити це вікно')}
          </Button>
          <Button size="xs" variant="light" onClick={takeOver}>
            {tr('Взяти керування')}
          </Button>
        </Group>
      )}
      {isLeader && appOff && (
        <Group
          gap="sm"
          wrap="nowrap"
          px="md"
          py={6}
          role="status"
          style={{
            background: 'var(--mantine-color-default-hover)',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <IconPower
            size={16}
            color="var(--mantine-color-dimmed)"
            aria-hidden
            style={{ flex: 'none' }}
          />
          <Text size="sm" style={{ flex: 1 }}>
            {tr(
              'Застосунок вимкнено: пульти й телефони глядачів відключено, вікна виводу закрито.',
            )}{' '}
            {tr(START_AGAIN)}
          </Text>
        </Group>
      )}
      {isLeader && hubLost && !appOff && (
        <Group
          gap="sm"
          wrap="nowrap"
          px="md"
          py={6}
          role="status"
          style={{
            background: 'var(--mantine-color-default-hover)',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <IconPlugConnectedX
            size={16}
            color="var(--mantine-color-orange-filled)"
            aria-hidden
            style={{ flex: 'none' }}
          />
          <Text size="sm" style={{ flex: 1 }}>
            {tr(
              'Немає зв’язку із сервером застосунку: пульти й телефони глядачів зараз не чують цього вікна, вікна виводу працюють далі. Перевірте, чи запущено застосунок, — зв’язок відновиться сам.',
            )}
          </Text>
        </Group>
      )}
      {isLeader && !hubLost && !appOff && !hubActive && (
        <Group
          gap="sm"
          wrap="nowrap"
          px="md"
          py={6}
          role="status"
          style={{
            background: 'var(--mantine-color-default-hover)',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <Text size="sm" style={{ flex: 1 }}>
            {hubMovedTo
              ? tr(
                  'Вікно керування перейшло в {browser}. Звідси показ іде лише на вікна виводу цього браузера.',
                  { browser: hubMovedTo },
                )
              : tr(
                  'Пульти й телефони глядачів слухають вікно керування в іншому браузері. Звідси показ іде лише на вікна виводу цього браузера.',
                )}
          </Text>
          <Button size="xs" variant="subtle" color="gray" onClick={closeThisWindow}>
            {tr('Закрити це вікно')}
          </Button>
          <Button
            size="xs"
            variant="light"
            onClick={() => controlConn.current?.send({ type: 'take-control' })}
          >
            {tr('Слухати тут')}
          </Button>
        </Group>
      )}
    </>
  );
}
