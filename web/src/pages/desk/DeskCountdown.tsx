import { useState } from 'react';
import { Button, Group, Popover, Stack, TextInput } from '@mantine/core';
import { IconHourglassHigh, IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react';
import { type SlideCountdown } from '../../presenterBus';
import { isPaused, parseDuration } from '../../lib/countdown';
import { type RemoteCountdown } from '../../lib/commands';
import { ToolIcon } from '../../components/Toolbar';
import { tr, useLang } from '../../i18n';

/**
 * «Відлік» from the desk (1.9.0-beta.1, a permission of its own): a new one of a typed length —
 * empty: the operator's saved one —, pause / go on, off. The look, the words and the place are
 * the operator's (Налаштування вигляду → Відлік on the computer with the app).
 */
export function DeskCountdown({
  running,
  allowed,
  combo,
  onCountdown,
}: {
  running: SlideCountdown | null;
  allowed: boolean;
  combo: string;
  onCountdown: (c: RemoteCountdown) => void;
}) {
  useLang();
  const [opened, setOpened] = useState(false);
  const [length, setLength] = useState('');
  const ms = length.trim() ? parseDuration(length) : null;
  const bad = length.trim() !== '' && ms == null;
  const paused = isPaused(running);
  const start = () => {
    if (bad) return;
    onCountdown(ms ? { op: 'start', seconds: Math.round(ms / 1000) } : { op: 'start' });
    setOpened(false);
  };
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <div>
          <ToolIcon
            label={tr('Відлік')}
            hint={
              allowed
                ? tr('«Починаємо за 5:00» для глядачів: почати, пауза, прибрати')
                : tr('Не дозволено оператором')
            }
            combo={combo}
            icon={<IconHourglassHigh size={18} stroke={1.5} />}
            active={!!running}
            disabled={!allowed}
            onClick={() => setOpened((o) => !o)}
          />
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={240}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <Group gap="xs" align="flex-start" wrap="nowrap">
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                aria-label={tr('Тривалість')}
                placeholder={tr('Як збережено')}
                description={tr('Хвилини: 5 чи 7:30')}
                value={length}
                error={bad ? tr('Напишіть, як-от 5 чи 7:30') : null}
                onChange={(e) => setLength(e.currentTarget.value)}
              />
              <Button size="xs" type="submit" mt={22} disabled={bad}>
                {tr('Почати')}
              </Button>
            </Group>
          </form>
          {running && (
            <Stack gap={6}>
              <Button
                size="xs"
                fullWidth
                variant="light"
                leftSection={paused ? <IconPlayerPlay size={14} /> : <IconPlayerPause size={14} />}
                onClick={() => onCountdown({ op: 'pause' })}
              >
                {paused ? tr('Продовжити') : tr('Пауза')}
              </Button>
              <Button
                size="xs"
                fullWidth
                variant="default"
                onClick={() => {
                  onCountdown({ op: 'stop' });
                  setOpened(false);
                }}
              >
                {tr('Прибрати відлік')}
              </Button>
            </Stack>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
