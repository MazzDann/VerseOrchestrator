import { useState } from 'react';
import {
  Box,
  Group,
  Text,
  Badge,
  ActionIcon,
  SegmentedControl,
  ScrollArea,
  Stack,
  UnstyledButton,
  Loader,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { type StrongPickRef } from './StrongView';

interface Props {
  strong: string;
  primaryId: number | null;
  onPick: (r: StrongPickRef) => void;
  onClose: () => void;
}

/**
 * Concordance ("where else is this word used") shown beside the chapter's verse
 * list. Lists every verse carrying a Strong number, scoped to the current
 * translation or all Strong translations; clicking a row jumps to that verse.
 */
export function ConcordancePanel({ strong, primaryId, onPick, onClose }: Props) {
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const translationId = scope === 'current' && primaryId != null ? primaryId : undefined;

  const { data, isFetching } = useQuery({
    queryKey: ['strongRefs', strong, translationId],
    queryFn: () => api.strongRefs(strong, { translationId }),
  });
  const results = data?.results ?? [];

  return (
    <Box
      style={{
        width: 300,
        minWidth: 240,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderLeft: '1px solid var(--mantine-color-default-border)',
      }}
    >
      <Group justify="space-between" px="sm" py="xs" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={600}>
            Стронг {strong}
          </Text>
          {data && (
            <Badge size="sm" variant="light">
              {data.total}
            </Badge>
          )}
          {isFetching && <Loader size="xs" />}
        </Group>
        <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Закрити">
          <IconX size={16} />
        </ActionIcon>
      </Group>
      <Box px="sm" pb="xs">
        <SegmentedControl
          fullWidth
          size="xs"
          value={scope}
          onChange={(v) => setScope(v as 'current' | 'all')}
          data={[
            { label: 'Цей переклад', value: 'current' },
            { label: 'Усі', value: 'all' },
          ]}
        />
      </Box>
      {data?.truncated && (
        <Text size="xs" c="dimmed" px="sm" pb={4}>
          Показано перші {results.length} із {data.total}.
        </Text>
      )}
      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={1} px="xs" pb="md">
          {results.map((r, i) => (
            <UnstyledButton
              key={i}
              className="vo-strong-occurrence"
              onClick={() =>
                onPick({
                  translationId: r.translationId,
                  bookNumber: r.bookNumber,
                  chapter: r.chapter,
                  verse: r.verse,
                })
              }
            >
              <Text size="xs" truncate>
                <Text span fw={600} c="brand" mr={6}>
                  {(r.shortName || r.longName) ?? ''} {r.chapter}:{r.verse}
                </Text>
                {r.text}
              </Text>
            </UnstyledButton>
          ))}
          {!isFetching && results.length === 0 && (
            <Text size="xs" c="dimmed" p="sm">
              Немає входжень.
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </Box>
  );
}
