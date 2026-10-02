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
import { IconHourglassHigh } from '@tabler/icons-react';
import { type SlideCountdown } from '../presenterBus';
import { useSettings } from '../settingsStore';
import {
  afterZeroOf,
  COUNTDOWN_MINUTES,
  formatRemaining,
  formatTimer,
  isAfterZero,
  untilAt,
  untilIn,
  useRemaining,
  type AfterZero,
} from '../lib/countdown';
import { tr, useLang } from '../i18n';

/**
 * «Відлік» (1.5.0), next to «Заставка» in the header: «Починаємо за 5:00» under the logo and
 * text before a show. Off screen it offers minutes (or «до» a time of day) and the words over
 * the time; on screen — the time left, ±1 minute, and two ways off: back to what it covered,
 * or «Заставка» without the time. The keys typed here stay here: Esc closes this, it never
 * clears the screen, and L / B / digits don't reach the page's hotkeys. «Після нуля» (1.8.0):
 * the time counts on past zero as −0:01 …, stays at 0:00, or goes — for the next countdown and
 * the one on screen.
 */
export function CountdownTool({
  running,
  disabled,
  onStart,
  onShift,
  onAfterZero,
  onKeepCover,
  onRemove,
  onOpenChange,
}: {
  /** the countdown on screen now (a «Заставка» slide's), if any */
  running: SlideCountdown | null;
  disabled: boolean;
  onStart: (countdown: SlideCountdown) => void;
  onShift: (minutes: number) => void;
  /** «Після нуля» changed while a countdown is on screen: it takes it too */
  onAfterZero: (afterZero: AfterZero) => void;
  onKeepCover: () => void;
  onRemove: () => void;
  /**
   * The popover opened or closed: the page pauses its own capture-phase keys meanwhile — the
   * songs' arrows (they put a stanza on screen) and the quick «3:16» digits (review of #45).
   */
  onOpenChange?: (open: boolean) => void;
}) {
  useLang();
  const [opened, setOpened] = useState(false);
  const saved = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);
  // the one on screen goes by its own «Після нуля»; the next one by the setting
  const runningAfterZero = afterZeroOf(running);
  const afterZero: AfterZero = isAfterZero(saved.countdownAfterZero)
    ? saved.countdownAfterZero
    : 'overtime';
  const left = useRemaining(running?.until, runningAfterZero === 'overtime');
  // on screen with its time: before zero, and after it unless the time goes there
  const counting = !!running && (left > 0 || runningAfterZero !== 'hide');
  const [mode, setMode] = useState<'in' | 'at'>('in');
  const [minutes, setMinutes] = useState(() =>
    Math.min(720, Math.max(1, Math.round(saved.countdownMinutes || 5))),
  );
  const [at, setAt] = useState('');
  const caption = saved.countdownCaption.trim() || tr('Починаємо за');
  const box = useRef<HTMLDivElement>(null);
  const openChange = useRef(onOpenChange);
  openChange.current = onOpenChange;
  useEffect(() => openChange.current?.(opened), [opened]);
  // gone with the header (another layout): the page's keys must not stay paused
  useEffect(() => () => openChange.current?.(false), []);

  // Esc closes this wherever the focus is — never the page's «Прибрати з екрана» (it caught an
  // Esc once the button under the focus had gone: the countdown ended with this open)
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
  // the content changes under the focus (the countdown starts, ends): the focus stays inside,
  // so the keys typed next still belong here and not to the page's hotkeys
  useEffect(() => {
    const el = box.current;
    if (!opened || !el || el.contains(document.activeElement)) return;
    el.querySelector<HTMLElement>('button:not(:disabled), input')?.focus();
  }, [opened, counting]);

  // «до» a time: checked as it is typed; nothing to start until it is a time still ahead today
  const atUntil = mode === 'at' && at ? untilAt(at, Date.now()) : null;
  const atError = mode === 'at' && at && atUntil == null ? tr('Цей час уже минув') : null;
  const startable = !disabled && (mode === 'in' || atUntil != null);
  const start = () => {
    const until = mode === 'in' ? untilIn(minutes, Date.now()) : untilAt(at, Date.now());
    if (until == null) return;
    if (mode === 'in') setAppearance({ countdownMinutes: minutes });
    onStart({ until, caption, afterZero });
    setOpened(false);
  };
  const setAfterZero = (v: string) => {
    if (!isAfterZero(v)) return;
    setAppearance({ countdownAfterZero: v });
    // the one on screen takes it only while its time shows: a finished «Прибрати час» one
    // stays finished (the start form's switch is for the next countdown)
    if (running && counting) onAfterZero(v);
  };
  // «Після нуля»: three short choices that fit the popover, the same in both views
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

  // the tooltip says the time left; the button's accessible name stays put — a name that
  // changed every second had a screen reader read the clock aloud (review of #45)
  const label = counting ? tr('Відлік: {time}', { time: formatTimer(left) }) : tr('Відлік');
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
            <Stack gap={2}>
              <Text size="xs" fw={500}>
                {label}
              </Text>
              <Text size="xs" c="dimmed" maw={240}>
                {tr('«Заставка» з часом до початку: «Починаємо за 5:00»')}
              </Text>
            </Stack>
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
            aria-label={tr('Відлік')}
            aria-pressed={counting}
            aria-haspopup="dialog"
            aria-expanded={opened}
          >
            <IconHourglassHigh size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown
        w={300}
        role="dialog"
        aria-label={tr('Відлік')}
        ref={box}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') e.stopPropagation();
        }}
      >
        {counting ? (
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm" fw={500}>
                {tr('Відлік на екрані')}
              </Text>
              <Text size="xl" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatTimer(left)}
              </Text>
            </Group>
            {left <= 0 && runningAfterZero === 'overtime' && (
              <Text size="xs" c="dimmed">
                {tr('Час вийшов: іде перевищення.')}
              </Text>
            )}
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
              {tr('Прибрати відлік')}
            </Button>
            <Button size="xs" variant="default" fullWidth disabled={disabled} onClick={onKeepCover}>
              {tr('Лишити заставку без часу')}
            </Button>
            {afterZeroControl}
          </Stack>
        ) : (
          <Stack gap="xs">
            {running && (
              <Text size="xs" c="dimmed">
                {tr('Відлік скінчився: заставка лишається на екрані.')}
              </Text>
            )}
            <div>
              <Text size="xs" fw={500} mb={4}>
                {tr('Скільки')}
              </Text>
              <Group gap={4}>
                {COUNTDOWN_MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="vo-chip"
                    data-selected={mode === 'in' && minutes === m}
                    aria-pressed={mode === 'in' && minutes === m}
                    onClick={() => {
                      setMode('in');
                      setMinutes(m);
                    }}
                  >
                    {tr('{n} хв', { n: m })}
                  </button>
                ))}
                <button
                  type="button"
                  className="vo-chip"
                  data-selected={mode === 'at'}
                  aria-pressed={mode === 'at'}
                  onClick={() => setMode('at')}
                >
                  {tr('до…')}
                </button>
              </Group>
            </div>
            {mode === 'at' && (
              <TextInput
                size="xs"
                type="time"
                label={tr('До котрої години')}
                value={at}
                error={atError}
                onChange={(e) => setAt(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && startable) start();
                }}
              />
            )}
            <TextInput
              size="xs"
              label={tr('Напис над часом')}
              placeholder={tr('Починаємо за')}
              value={saved.countdownCaption}
              onChange={(e) => setAppearance({ countdownCaption: e.currentTarget.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && startable) start();
              }}
            />
            {afterZeroControl}
            <Button
              size="xs"
              color="live"
              leftSection={<IconHourglassHigh size={14} />}
              disabled={!startable}
              onClick={start}
            >
              {mode === 'in'
                ? tr('Показати: {caption} {time}', {
                    caption,
                    time: formatRemaining(minutes * 60000),
                  })
                : tr('Показати відлік')}
            </Button>
            <Text size="xs" c="dimmed">
              {tr('Логотип і текст над часом — із розділу «Заставка» в налаштуваннях вигляду.')}
            </Text>
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
