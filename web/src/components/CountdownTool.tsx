import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, Group, Popover, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconHourglassHigh } from '@tabler/icons-react';
import { type SlideCountdown } from '../presenterBus';
import { useSettings } from '../settingsStore';
import {
  COUNTDOWN_MINUTES,
  formatRemaining,
  untilAt,
  untilIn,
  useRemaining,
} from '../lib/countdown';
import { tr, useLang } from '../i18n';

/**
 * «Відлік» (1.5.0), next to «Заставка» in the header: «Починаємо за 5:00» under the logo and
 * text before a show. Off screen it offers minutes (or «до» a time of day) and the words over
 * the time; on screen — the time left, ±1 minute, and two ways off: back to what it covered,
 * or «Заставка» without the time. The keys typed here stay here: Esc closes this, it never
 * clears the screen, and L / B / digits don't reach the page's hotkeys.
 */
export function CountdownTool({
  running,
  disabled,
  onStart,
  onShift,
  onKeepCover,
  onRemove,
}: {
  /** the countdown on screen now (a «Заставка» slide's), if any */
  running: SlideCountdown | null;
  disabled: boolean;
  onStart: (countdown: SlideCountdown) => void;
  onShift: (minutes: number) => void;
  onKeepCover: () => void;
  onRemove: () => void;
}) {
  useLang();
  const [opened, setOpened] = useState(false);
  const saved = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);
  const left = useRemaining(running?.until);
  const counting = !!running && left > 0;
  const [mode, setMode] = useState<'in' | 'at'>('in');
  const [minutes, setMinutes] = useState(() =>
    Math.min(720, Math.max(1, Math.round(saved.countdownMinutes || 5))),
  );
  const [at, setAt] = useState('');
  const caption = saved.countdownCaption.trim() || tr('Починаємо за');
  const box = useRef<HTMLDivElement>(null);

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
    onStart({ until, caption });
    setOpened(false);
  };

  const label = counting ? tr('Відлік: {time}', { time: formatRemaining(left) }) : tr('Відлік');
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
            aria-label={label}
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
                {formatRemaining(left)}
              </Text>
            </Group>
            <Group gap="xs" grow>
              <Button size="xs" variant="default" onClick={() => onShift(-1)}>
                {tr('−1 хв')}
              </Button>
              <Button size="xs" variant="default" onClick={() => onShift(1)}>
                {tr('+1 хв')}
              </Button>
            </Group>
            <Button size="xs" variant="light" fullWidth onClick={onRemove}>
              {tr('Прибрати відлік')}
            </Button>
            <Button size="xs" variant="default" fullWidth onClick={onKeepCover}>
              {tr('Лишити заставку без часу')}
            </Button>
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
