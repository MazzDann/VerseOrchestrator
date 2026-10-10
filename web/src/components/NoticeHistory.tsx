import { useEffect, useRef, type ReactNode } from 'react';
import { Box, Button, Group, Popover, ScrollArea, Text } from '@mantine/core';
import { currentLocale, tr, useLang } from '../i18n';
import { useNoticeHistory, type NoticeEntry } from '../lib/noticeHistory';

/** HH:MM:SS the interface language's way. */
const clock = (at: number) =>
  new Date(at).toLocaleTimeString(currentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

function NoticeRow({ entry }: { entry: NoticeEntry }) {
  return (
    <li className="vo-notice-row">
      {/* the notice's own colour: green done, red failed, gray — none given */}
      <Box className="vo-notice-dot" bg={entry.color ?? 'gray'} aria-hidden />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {clock(entry.at)}
        </Text>
        {entry.title && (
          <Text size="sm" fw={600} lh={1.35} style={{ overflowWrap: 'anywhere' }}>
            {entry.title}
          </Text>
        )}
        {entry.text && (
          <Text
            size="sm"
            lh={1.35}
            lineClamp={3}
            title={entry.text}
            style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}
          >
            {entry.text}
          </Text>
        )}
      </Box>
    </li>
  );
}

/**
 * «Сповіщення» (the user's ask, 2026-10-09): what the control window said this session, newest
 * first — a notice that went by while the operator looked at another window is there to read.
 * A pop-up under `children`: the header's bell, or «Ще» when the app zone has folded into it.
 * Opening it marks everything seen. Its keys stay inside, as in «Повідомлення на сцену»: Esc
 * closes it wherever the focus is (never the page's «Прибрати з екрана»), arrows scroll the list.
 */
export function NoticeHistoryPopover({
  opened,
  onChange,
  children,
}: {
  opened: boolean;
  onChange: (opened: boolean) => void;
  children: ReactNode;
}) {
  useLang();
  const entries = useNoticeHistory((s) => s.entries);
  const markSeen = useNoticeHistory((s) => s.markSeen);
  const clear = useNoticeHistory((s) => s.clear);
  const box = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  change.current = onChange;
  // open: all of it is seen — and what comes while it stays open
  useEffect(() => {
    if (opened) markSeen();
  }, [opened, entries, markSeen]);
  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      change.current(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [opened]);
  // the focus inside: from «Ще», its menu hands the focus back to its button as this opens
  useEffect(() => {
    if (!opened) return;
    const t = window.setTimeout(() => {
      const el = box.current;
      if (!el || el.contains(document.activeElement)) return;
      (el.querySelector<HTMLElement>('[data-autofocus]') ?? el).focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
  }, [opened]);

  return (
    <Popover
      opened={opened}
      onChange={onChange}
      position="bottom-end"
      withArrow
      shadow="md"
      closeOnEscape={false}
      trapFocus
      returnFocus
      withRoles={false}
      middlewares={{ flip: true, shift: true, inline: false }}
    >
      <Popover.Target>
        <Box style={{ display: 'flex' }}>{children}</Box>
      </Popover.Target>
      <Popover.Dropdown
        ref={box}
        w="22rem"
        maw="calc(100vw - 2rem)"
        p="xs"
        role="dialog"
        aria-label={tr('Сповіщення')}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') e.stopPropagation();
        }}
      >
        <Group justify="space-between" wrap="nowrap" gap="xs" mb={4}>
          <Text size="sm" fw={600}>
            {tr('Сповіщення за цей сеанс')}
          </Text>
          <Button size="xs" variant="subtle" disabled={!entries.length} onClick={clear}>
            {tr('Очистити')}
          </Button>
        </Group>
        {entries.length ? (
          // the list's width, never wider: rows wrap, nothing scrolls sideways (styles.css)
          <ScrollArea.Autosize mah="60vh" scrollbars="y" className="vo-scroll-fit vo-scroll-rows">
            {/* focusable: ↑/↓ and Page Up/Down scroll it */}
            <Box
              component="ul"
              m={0}
              p={0}
              style={{ listStyle: 'none' }}
              tabIndex={0}
              data-autofocus
              aria-label={tr('Сповіщення за цей сеанс')}
            >
              {entries.map((e) => (
                <NoticeRow key={e.seq} entry={e} />
              ))}
            </Box>
          </ScrollArea.Autosize>
        ) : (
          <Text size="sm" c="dimmed" py={4}>
            {tr('Сповіщень ще не було.')}
          </Text>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
