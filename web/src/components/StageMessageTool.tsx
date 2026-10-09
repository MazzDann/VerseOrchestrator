import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, Group, Popover, Stack, Text, Textarea, Tooltip } from '@mantine/core';
import { IconMessage } from '@tabler/icons-react';
import { STAGE_MESSAGE_MAX, type StageMessage } from '../presenterBus';
import { Tip } from './Toolbar';
import { tr, useLang } from '../i18n';

/** The last messages sent from this browser, to send again with one click (per browser). */
const RECENT_KEY = 'vo:stageMessages';
const RECENT_MAX = 3;

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

function remember(text: string): void {
  try {
    const next = [text, ...readRecent().filter((t) => t !== text)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* a full or blocked storage: the message still goes */
  }
}

/**
 * «Повідомлення на сцену» (1.9.0-beta.11, F1005-09), beside «Таймер доповідача» in the header: a
 * line for the speaker that only the «Сцена» window shows — «Лишилося 5 хвилин», «Голосніше».
 * The last three come back with one click. The keys typed here stay here, as in «Відлік»: Esc
 * closes it wherever the focus is, and the focus stays inside while it is open.
 */
export function StageMessageTool({
  message,
  disabled,
  onSend,
  onOpenChange,
}: {
  /** the message on «Сцена» now, if any */
  message: StageMessage | null;
  disabled: boolean;
  /** a line, or null to take it off */
  onSend: (text: string | null) => void;
  /** the page pauses its own capture-phase keys while this is open (as for «Відлік») */
  onOpenChange?: (open: boolean) => void;
}) {
  useLang();
  const [opened, setOpened] = useState(false);
  const [text, setText] = useState('');
  const [recent, setRecent] = useState<string[]>(readRecent);
  const box = useRef<HTMLDivElement>(null);
  const on = !!message;
  const openChange = useRef(onOpenChange);
  openChange.current = onOpenChange;
  useEffect(() => {
    openChange.current?.(opened);
    if (opened) setRecent(readRecent());
  }, [opened]);
  // the header folding away while this is open must not leave the page's keys paused (review)
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
  // «Прибрати» goes away under the focus: the focus stays inside, in the field
  useEffect(() => {
    const el = box.current;
    if (!opened || !el || el.contains(document.activeElement)) return;
    el.querySelector<HTMLElement>('textarea')?.focus();
  }, [opened, on]);

  const send = (words: string) => {
    const t = words.trim();
    if (!t || disabled) return;
    onSend(t);
    remember(t);
    setRecent(readRecent());
    setText('');
  };
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
              label={
                on
                  ? tr('Повідомлення на сцені: «{text}»', { text: message.text })
                  : tr('Повідомлення на сцену')
              }
              hint={tr('Рядок для доповідача — у вікні «Сцена» і на пульті-телефоні')}
            />
          }
          withArrow
          openDelay={250}
          multiline
          w={260}
          disabled={opened}
        >
          <ActionIcon
            variant={on ? 'filled' : 'default'}
            color="brand"
            size="lg"
            w={24}
            miw={24}
            onClick={() => setOpened((o) => !o)}
            aria-label={tr('Повідомлення на сцену')}
            aria-pressed={on}
            aria-haspopup="dialog"
            aria-expanded={opened}
          >
            <IconMessage size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown
        w={300}
        role="dialog"
        aria-label={tr('Повідомлення на сцену')}
        ref={box}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') e.stopPropagation();
        }}
      >
        <Stack gap="xs">
          {on && (
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Text size="sm" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {tr('Зараз: «{text}»', { text: message.text })}
              </Text>
              <Button
                size="compact-xs"
                variant="default"
                disabled={disabled}
                onClick={() => onSend(null)}
              >
                {tr('Прибрати')}
              </Button>
            </Group>
          )}
          <Textarea
            // the focus trap's first stop: the field, not «Прибрати» (review)
            data-autofocus
            size="xs"
            autosize
            minRows={2}
            maxRows={4}
            maxLength={STAGE_MESSAGE_MAX}
            label={tr('Текст для доповідача')}
            placeholder={tr('Наприклад, «Лишилося 5 хвилин»')}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
          />
          <Button
            size="xs"
            fullWidth
            disabled={disabled || !text.trim()}
            onClick={() => send(text)}
          >
            {tr('Показати на «Сцені»')}
          </Button>
          {recent.length > 0 && (
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                {tr('Нещодавні')}
              </Text>
              {recent.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="vo-list-item vo-plain-button"
                  disabled={disabled}
                  onClick={() => send(r)}
                >
                  <Text size="sm" truncate>
                    {r}
                  </Text>
                </button>
              ))}
            </Stack>
          )}
          <Text size="xs" c="dimmed">
            {tr('Enter — показати, Shift+Enter — новий рядок. Глядачі й телефони його не бачать.')}
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
