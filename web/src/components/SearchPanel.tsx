import { useEffect, useRef, useState } from 'react';
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
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch, IconX } from '@tabler/icons-react';
import { api, type SearchResult } from '../api';

export type SearchScope = 'current' | 'all';

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
          placeholder="Пошук: «любов», «Ів 3:16», «бут 2 3-5»"
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
                  background: i === highlight ? 'var(--mantine-color-blue-light)' : undefined,
                }}
              >
                <Text size="xs" c="dimmed">
                  {r.longName || r.shortName} {r.chapter}:{r.verse}
                </Text>
                <Text size="sm" lineClamp={1}>
                  {r.text}
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
