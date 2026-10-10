import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Paper, TextInput, Text, Box, Group, Loader } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import {
  IconAdjustments,
  IconSearch,
  IconBook,
  IconMusic,
  IconArrowRight,
  IconBolt,
} from '@tabler/icons-react';
import { api, type Book } from '../api';
import { tr, trn, useLang } from '../i18n';
import { findSettings, SECTION_TITLES } from '../lib/settingsSearch';

/** A static operator action exposed in the palette. */
export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  keywords?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
  books: Book[];
  onJumpBook: (bookNumber: number) => void;
  onOpenSong: (songId: number) => void;
  onGoReference: (q: string) => void;
  /** a setting found by its name (1.13.0-beta.3): the settings panel opens on it */
  onSetting?: (label: string) => void;
}

/** One navigable row, flattened across sections (the section is just a display label). */
interface Row {
  key: string;
  section: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

const norm = (s: string) => s.toLowerCase().trim();

/**
 * Command palette (Ctrl+K): fuzzy-ish search over operator actions, books, and
 * songs, plus a reference jump. A custom centered portal overlay — NOT a Mantine
 * Modal/Spotlight (those don't render their content reliably in this project).
 */
export function CommandPalette({
  open,
  onClose,
  commands,
  books,
  onJumpBook,
  onOpenSong,
  onGoReference,
  onSetting,
}: Props) {
  useLang();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [debounced] = useDebouncedValue(query, 180);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Last real cursor position — to ignore scroll-synthesized mousemove events that
  // would otherwise fight arrow-key navigation (Chromium fires mousemove on the row
  // that scrolls under a stationary pointer).
  const lastPointer = useRef({ x: -1, y: -1 });

  // Reset on each open.
  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  const songsQuery = useQuery({
    queryKey: ['palette-songs', debounced],
    queryFn: () => api.songs(debounced),
    enabled: open && debounced.trim().length >= 1,
  });

  const rows = useMemo<Row[]>(() => {
    const q = norm(query);
    const out: Row[] = [];

    // Reference jump — offered when the query looks like a reference (has a digit).
    if (q && /\d/.test(q)) {
      out.push({
        key: 'ref',
        section: tr('Перейти'),
        label: tr('Перейти: {query}', { query: query.trim() }),
        icon: <IconArrowRight size={16} />,
        run: () => onGoReference(query.trim()),
      });
    }

    // Actions.
    const acts = commands.filter((c) => !q || norm(`${c.label} ${c.keywords ?? ''}`).includes(q));
    for (const c of acts) {
      out.push({
        key: `act:${c.id}`,
        section: tr('Дії'),
        label: c.label,
        hint: c.hint,
        icon: c.icon ?? <IconBolt size={16} />,
        run: c.run,
      });
    }

    // Settings by their names (1.13.0-beta.3, the author's Q9b) — only with a query, like the books
    if (q && onSetting) {
      for (const s of findSettings(q).slice(0, 8)) {
        out.push({
          key: `set:${s.section}:${s.label}`,
          section: tr('Налаштування'),
          label: `${tr(SECTION_TITLES[s.section])} → ${tr(s.label)}`,
          icon: <IconAdjustments size={16} />,
          run: () => onSetting(s.label),
        });
      }
    }

    // Books (only when there's a query, to avoid a 66-row dump).
    if (q) {
      const matched = books
        .filter((b) => norm(b.longName).includes(q) || norm(b.shortName).includes(q))
        .slice(0, 8);
      for (const b of matched) {
        out.push({
          key: `book:${b.bookNumber}`,
          section: tr('Книги'),
          label: b.longName || b.shortName,
          icon: <IconBook size={16} />,
          run: () => onJumpBook(b.bookNumber),
        });
      }
    }

    // Songs (API search) — only when the debounce has caught up to the current query,
    // so stale results from a prior query don't flash under a new/empty input.
    if (q && norm(debounced) === q) {
      const found = (songsQuery.data ?? []).slice(0, 8);
      // songs from several bundles (0.10.0): say whose each one is
      const several = new Set(found.map((s) => s.bundle)).size > 1;
      for (const s of found) {
        out.push({
          key: `song:${s.id}`,
          section: tr('Пісні'),
          label: `${s.number != null ? `№${s.number} ` : ''}${s.title}${several && s.bundle ? ` · ${s.bundle}` : ''}`,
          icon: <IconMusic size={16} />,
          run: () => onOpenSong(s.id),
        });
      }
    }

    return out;
  }, [
    query,
    debounced,
    commands,
    books,
    songsQuery.data,
    onGoReference,
    onJumpBook,
    onOpenSong,
    onSetting,
  ]);

  // Keep the selected index in range as the result set changes.
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  // Scroll the selected row into view.
  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!open) return null;

  const run = (row: Row | undefined) => {
    if (!row) return;
    row.run();
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // stopPropagation so the key doesn't leak to window-level listeners (e.g. a
    // FloatingPanel's Escape handler, which would otherwise also close underneath).
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setIndex((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      run(rows[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Tab') {
      // Rows are tabIndex=-1; keep focus on the input so Tab can't escape behind the overlay.
      e.preventDefault();
    }
  };

  // Group consecutive rows by section for labelled headers, but keep a flat index.
  let lastSection = '';

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <Paper
        shadow="xl"
        withBorder
        radius="md"
        role="dialog"
        aria-modal
        aria-label={tr('Палітра команд')}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(620px, 92vw)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TextInput
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={tr('Команда, книга, пісня або посилання…')}
          variant="unstyled"
          size="md"
          leftSection={<IconSearch size={18} />}
          rightSection={songsQuery.isFetching ? <Loader size="xs" /> : null}
          // only the right side: the left one is Mantine's room for the search icon
          styles={{ input: { paddingInlineEnd: 14 } }}
        />
        <Box
          ref={listRef}
          style={{
            maxHeight: '52vh',
            overflowY: 'auto',
            borderTop: '1px solid var(--mantine-color-default-border)',
          }}
        >
          {rows.length === 0 ? (
            <Text c="dimmed" size="sm" p="md" ta="center">
              {tr('Нічого не знайдено')}
            </Text>
          ) : (
            rows.map((row, i) => {
              const header = row.section !== lastSection ? row.section : null;
              lastSection = row.section;
              return (
                <Box key={row.key}>
                  {header && (
                    <Text size="10px" c="dimmed" fw={700} tt="uppercase" px="sm" pt={8} pb={2}>
                      {header}
                    </Text>
                  )}
                  <Box
                    data-row={i}
                    role="button"
                    tabIndex={-1}
                    onMouseMove={(e) => {
                      // Ignore scroll-synthesized events (pointer didn't actually move).
                      if (
                        e.clientX === lastPointer.current.x &&
                        e.clientY === lastPointer.current.y
                      )
                        return;
                      lastPointer.current = { x: e.clientX, y: e.clientY };
                      setIndex(i);
                    }}
                    onClick={() => run(row)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 14px',
                      cursor: 'pointer',
                      background: i === index ? 'var(--mantine-color-default-hover)' : undefined,
                    }}
                  >
                    <span style={{ opacity: 0.7, display: 'flex' }}>{row.icon}</span>
                    <Group gap={8} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                      <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                        {row.label}
                      </Text>
                      {row.hint && (
                        <Text size="xs" c="dimmed" truncate style={{ maxWidth: '45%' }}>
                          {row.hint}
                        </Text>
                      )}
                    </Group>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
        <Group
          justify="space-between"
          px="sm"
          py={4}
          style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
        >
          <Text size="10px" c="dimmed">
            {tr('↑↓ — вибір · Enter — виконати · Esc — закрити')}
          </Text>
          <Text size="10px" c="dimmed">
            {trn(rows.length, '{n} результат|{n} результати|{n} результатів')}
          </Text>
        </Group>
      </Paper>
    </div>,
    document.body,
  );
}
