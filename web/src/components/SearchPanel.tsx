import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Paper,
  TextInput,
  SegmentedControl,
  ScrollArea,
  Stack,
  Text,
  Box,
  Group,
  ActionIcon,
  Loader,
  Button,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch, IconX } from '@tabler/icons-react';
import { api, type SearchResult } from '../api';

export type SearchScope = 'current' | 'all';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Search folds accents (й→и, ї→і, ё→е), so a bare-letter query can match an accented
// verse word. Mirror that when highlighting: a base letter also matches its variant.
const FOLD_VARIANTS: Record<string, string> = { и: 'й', і: 'ї', е: 'ё' };
/** Build a regex source for a term where foldable base letters also match their variant. */
function termPattern(term: string): string {
  return [...term]
    .map((ch) => {
      const extra = FOLD_VARIANTS[ch.toLowerCase()];
      return extra ? `[${escapeRe(ch)}${extra}]` : escapeRe(ch);
    })
    .join('');
}

/** Bold the matched query words inside a result snippet (case-insensitive). */
function highlightTerms(text: string, terms: string[]): ReactNode {
  if (terms.length === 0) return text;
  const re = new RegExp(`(${terms.map(termPattern).join('|')})`, 'giu');
  const parts = text.split(re);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <Text span key={i} fw={700} c="brand">
        {p}
      </Text>
    ) : (
      p
    ),
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  primaryId: number | null;
  scope: SearchScope;
  onScopeChange: (scope: SearchScope) => void;
  onPick: (result: SearchResult) => void;
}

/**
 * Inline search panel (opened by F3 / Ctrl+F = current module, F4 = all).
 * Handles reference queries ("бут 2 3", "Ів 3:16-18") and full text; the server
 * decides which. Rendered inline (no Modal/portal) for reliability.
 */
export function SearchPanel({ open, onClose, primaryId, scope, onScopeChange, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 200);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const translationIds = scope === 'current' && primaryId != null ? [primaryId] : [];

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced, scope, primaryId],
    queryFn: () => api.search(debounced, translationIds),
    enabled: open && debounced.trim().length >= 2,
  });
  const results = (data?.results ?? []).slice(0, 80);
  const suggestions = data?.suggestions ?? [];
  // Words to highlight in text results (strip operators/quotes; ≥2 chars).
  const terms = useMemo(
    () =>
      data?.kind === 'text'
        ? debounced
            .replace(/["!-]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 2)
        : [],
    [debounced, data?.kind],
  );

  useEffect(() => {
    if (open) {
      setHighlight(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => setHighlight(0), [debounced, scope]);

  if (!open) return null;

  const pick = (r: SearchResult) => {
    onPick(r);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(results.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter' && results[highlight]) {
      e.preventDefault();
      pick(results[highlight]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <Paper withBorder shadow="sm" p="sm" m="sm">
      <Group gap="xs" wrap="nowrap">
        <TextInput
          ref={inputRef}
          flex={1}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder='Пошук: «любов», «Ів 3:16», «"світло життя"», «-темрява», «G2424»'
          leftSection={<IconSearch size={18} />}
          rightSection={isFetching ? <Loader size="xs" /> : null}
        />
        <SegmentedControl
          size="xs"
          value={scope}
          onChange={(v) => onScopeChange(v as SearchScope)}
          data={[
            { label: 'Поточний (F3)', value: 'current' },
            { label: 'Усі (F4)', value: 'all' },
          ]}
        />
        <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Закрити пошук">
          <IconX size={18} />
        </ActionIcon>
      </Group>
      {suggestions.length > 0 && (
        <Group gap={6} mt="xs" wrap="wrap">
          <Text size="xs" c="dimmed">
            Можливо:
          </Text>
          {suggestions.map((s) => (
            <Button
              key={`sug-${s.bookNumber}-${s.chapter}-${s.verse}`}
              size="compact-xs"
              variant="light"
              color="brand"
              onClick={() => pick(s)}
            >
              {s.shortName || s.longName} {s.chapter}:{s.verse}
            </Button>
          ))}
        </Group>
      )}
      {(debounced.trim().length >= 2 || results.length > 0) && (
        <ScrollArea.Autosize mah={320} mt="xs">
          <Stack gap={0}>
            {results.map((r, i) => (
              <Box
                key={`${r.translationId}-${r.bookNumber}-${r.chapter}-${r.verse}`}
                onClick={() => pick(r)}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  cursor: 'pointer',
                  borderRadius: 6,
                  padding: '6px 8px',
                  background: i === highlight ? 'var(--mantine-color-brand-light)' : undefined,
                }}
              >
                <Text size="xs" c="dimmed">
                  {r.longName || r.shortName} {r.chapter}:{r.verse}
                </Text>
                <Text size="sm" lineClamp={1}>
                  {highlightTerms(r.text, terms)}
                </Text>
              </Box>
            ))}
            {debounced.trim().length >= 2 && results.length === 0 && !isFetching && (
              <Text size="sm" c="dimmed" p="sm">
                Нічого не знайдено
              </Text>
            )}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Paper>
  );
}
