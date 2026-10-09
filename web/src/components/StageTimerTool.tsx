import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Popover,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconPlayerPause, IconPlayerPlay, IconStopwatch } from '@tabler/icons-react';
import { useSettings } from '../settingsStore';
import {
  formatRemaining,
  formatTimer,
  isAfterZero,
  parseDuration,
  savedLength,
  STAGE_MINUTES,
  useCountdown,
  type AfterZero,
  type StageTimer,
} from '../lib/countdown';
import { Tip } from './Toolbar';
import { tr, useLang } from '../i18n';

/**
 * «Таймер доповідача» (1.8.4, the user's ask: «таймер на «Сцені»»), next to «Відлік» in the
 * header: a time for the speaker that only the «Сцена» window shows — the audience sees nothing
 * of it. Off: a length and «Після нуля»; on: the time, «Пауза» / «Продовжити», «±1 хв», and
 * «Прибрати таймер». The keys typed here stay here, as in «Відлік».
 */
export function StageTimerTool({
  running,
  disabled,
  onStart,
  onPause,
  onShift,
  onAfterZero,
  onRemove,
  onOpenChange,
}: {
  /** the speaker's timer now, if any */
  running: StageTimer | null;
  disabled: boolean;
  onStart: (ms: number, afterZero: AfterZero) => void;
  onPause: () => void;
  onShift: (minutes: number) => void;
  onAfterZero: (afterZero: AfterZero) => void;
  onRemove: () => void;
  /** the page pauses its own capture-phase keys while this is open (as for «Відлік») */
  onOpenChange?: (open: boolean) => void;
}) {
  useLang();
  const [opened, setOpened] = useState(false);
  const saved = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);
  const { left, counting, paused, afterZero: runningAfterZero } = useCountdown(running);
  const afterZero: AfterZero = isAfterZero(saved.stageTimerAfterZero)
    ? saved.stageTimerAfterZero
    : 'overtime';
  const [length, setLength] = useState(() => formatRemaining(savedLength(saved.stageTimerMinutes)));
  const lengthMs = parseDuration(length);
  const box = useRef<HTMLDivElement>(null);
  const openChange = useRef(onOpenChange);
  openChange.current = onOpenChange;
  useEffect(() => openChange.current?.(opened), [opened]);
  useEffect(() => () => openChange.current?.(false), []);
  // Esc closes this wherever the focus is — never the page's «Прибрати з екрана»
  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpened(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [opened]);
  // the content changes under the focus (the timer starts, ends): the focus stays inside
  useEffect(() => {
    const el = box.current;
    if (!opened || !el || el.contains(document.activeElement)) return;
    el.querySelector<HTMLElement>('button:not(:disabled), input')?.focus();
  }, [opened, counting]);

  const startable = !disabled && lengthMs != null;
  const start = () => {
    if (lengthMs == null || disabled) return;
    setAppearance({ stageTimerMinutes: lengthMs / 60000 });
    onStart(lengthMs, afterZero);
    setOpened(false);
  };
  const setAfterZero = (v: string) => {
    if (!isAfterZero(v)) return;
    setAppearance({ stageTimerAfterZero: v });
    if (running && counting) onAfterZero(v);
  };
  const afterZeroControl = (
    <div>
      <Text size="xs" fw={500} mb={4}>
        {tr('Після нуля')}
      </Text>
      <SegmentedControl
        size="xs"
        fullWidth
        value={running && counting ? runningAfterZero : afterZero}
        onChange={setAfterZero}
        disabled={disabled}
        aria-label={tr('Після нуля')}
        data={[
          { value: 'overtime', label: tr('У мінус') },
          { value: 'stop', label: tr('Стоп на 0:00') },
          { value: 'hide', label: tr('Прибрати час') },
        ]}
      />
    </div>
  );
  const label = !counting
    ? tr('Таймер доповідача')
    : paused
      ? tr('Таймер доповідача: {time}, пауза', { time: formatTimer(left) })
      : tr('Таймер доповідача: {time}', { time: formatTimer(left) });
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      withArrow
      shadow="md"
      closeOnEscape={false}
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <Tooltip
          label={
            <Tip
              label={label}
              hint={tr('Час для доповідача — у вікні «Сцена» і на пульті-телефоні')}
            />
          }
          withArrow
          openDelay={250}
          multiline
          disabled={opened}
        >
          <ActionIcon
            variant={counting ? 'filled' : 'default'}
            color="brand"
            size="lg"
            w={24}
            miw={24}
            onClick={() => setOpened((o) => !o)}
            aria-label={tr('Таймер доповідача')}
            aria-pressed={counting}
            aria-haspopup="dialog"
            aria-expanded={opened}
          >
            <IconStopwatch size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown
        w={300}
        role="dialog"
        aria-label={tr('Таймер доповідача')}
        ref={box}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') e.stopPropagation();
        }}
      >
        {counting ? (
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm" fw={500}>
                {tr('Таймер на «Сцені»')}
              </Text>
              <Text size="xl" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatTimer(left)}
              </Text>
            </Group>
            {paused ? (
              <Text size="xs" c="dimmed">
                {tr('На паузі: час на «Сцені» стоїть.')}
              </Text>
            ) : (
              left <= 0 &&
              runningAfterZero === 'overtime' && (
                <Text size="xs" c="dimmed">
                  {tr('Час вийшов: іде перевищення.')}
                </Text>
              )
            )}
            <Button
              size="xs"
              variant={paused ? 'filled' : 'default'}
              color="brand"
              fullWidth
              disabled={disabled}
              leftSection={paused ? <IconPlayerPlay size={14} /> : <IconPlayerPause size={14} />}
              onClick={onPause}
            >
              {paused ? tr('Продовжити') : tr('Пауза')}
            </Button>
            <Group gap="xs" grow>
              <Button
                size="xs"
                variant="default"
                disabled={disabled || (left <= 0 && runningAfterZero !== 'overtime')}
                onClick={() => onShift(-1)}
              >
                {tr('−1 хв')}
              </Button>
              <Button size="xs" variant="default" disabled={disabled} onClick={() => onShift(1)}>
                {tr('+1 хв')}
              </Button>
            </Group>
            <Button size="xs" variant="light" fullWidth disabled={disabled} onClick={onRemove}>
              {tr('Прибрати таймер')}
            </Button>
            {afterZeroControl}
          </Stack>
        ) : (
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              {tr(
                'Час бачить лише доповідач — у вікні «Сцена» і на пульті-телефоні; глядачі його не бачать.',
              )}
            </Text>
            <div>
              <Text size="xs" fw={500} mb={4}>
                {tr('Скільки')}
              </Text>
              <Group gap={4}>
                {STAGE_MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="vo-chip"
                    data-selected={lengthMs === m * 60000}
                    aria-pressed={lengthMs === m * 60000}
                    onClick={() => setLength(formatRemaining(m * 60000))}
                  >
                    {tr('{n} хв', { n: m })}
                  </button>
                ))}
              </Group>
            </div>
            <TextInput
              size="xs"
              label={tr('Тривалість')}
              description={tr('Хвилини або хв:сс')}
              value={length}
              error={lengthMs == null ? tr('Від 0:01 до 12:00:00, наприклад 7 або 7:30') : null}
              onChange={(e) => setLength(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && startable) start();
              }}
            />
            {afterZeroControl}
            <Button
              size="xs"
              leftSection={<IconStopwatch size={14} />}
              disabled={!startable}
              onClick={start}
            >
              {lengthMs != null
                ? tr('Запустити на «Сцені»: {time}', { time: formatRemaining(lengthMs) })
                : tr('Запустити на «Сцені»')}
            </Button>
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
