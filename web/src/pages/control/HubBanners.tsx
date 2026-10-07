import { type MutableRefObject } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { IconPlugConnectedX, IconPower } from '@tabler/icons-react';
import { START_AGAIN } from '../../serverStore';
import { tr, useLang } from '../../i18n';
import { closeThisWindow } from '../../lib/closeWindow';
import { type LiveConnection } from '../../lib/liveSocket';

/**
 * A banner with buttons in a narrow centre column (Mac check of 1.9.0, the user's report: the text
 * went one word per line and the buttons were cut — «Закрит…», «Слух…»): the row wraps — the text
 * keeps 16rem before it gives way, the buttons never shrink and go below it, to the right.
 */
const WRAP_TEXT = { flex: '1 1 16rem', minWidth: 0 } as const;
const WHOLE = { flex: 'none' } as const;

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
          wrap="wrap"
          px="md"
          py={6}
          role="status"
          style={{
            background: 'var(--mantine-color-default-hover)',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <Text size="sm" style={WRAP_TEXT}>
            {tr(
              'Показом керує інше вікно керування. Тут можна готувати наступне — на екран іде лише звідти.',
            )}
          </Text>
          <Group gap="sm" justify="flex-end" ml="auto">
            <Button size="xs" variant="subtle" color="gray" onClick={closeThisWindow} style={WHOLE}>
              {tr('Закрити це вікно')}
            </Button>
            <Button size="xs" variant="light" onClick={takeOver} style={WHOLE}>
              {tr('Взяти керування')}
            </Button>
          </Group>
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
          wrap="wrap"
          px="md"
          py={6}
          role="status"
          style={{
            background: 'var(--mantine-color-default-hover)',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <Text size="sm" style={WRAP_TEXT}>
            {hubMovedTo
              ? tr(
                  'Вікно керування перейшло в {browser}. Звідси показ іде лише на вікна виводу цього браузера.',
                  { browser: hubMovedTo },
                )
              : tr(
                  'Пульти й телефони глядачів слухають вікно керування в іншому браузері. Звідси показ іде лише на вікна виводу цього браузера.',
                )}
          </Text>
          <Group gap="sm" justify="flex-end" ml="auto">
            <Button size="xs" variant="subtle" color="gray" onClick={closeThisWindow} style={WHOLE}>
              {tr('Закрити це вікно')}
            </Button>
            <Button
              size="xs"
              variant="light"
              onClick={() => controlConn.current?.send({ type: 'take-control' })}
              style={WHOLE}
            >
              {tr('Слухати тут')}
            </Button>
          </Group>
        </Group>
      )}
    </>
  );
}
