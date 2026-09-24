import { Stack, Text, Group, Badge, Loader, Box } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { api, type Verse, type Book } from '../api';
import { type StrongPickRef } from './StrongView';

interface Props {
  /** The selected verse(s) of the primary translation; [0] is the focus. */
  verses: Verse[];
  /** Primary translation's books, to resolve cross-reference book names. */
  books: Book[];
  onPickRef?: (r: StrongPickRef) => void;
}

/** Verse context: cross-references (clickable → jump) and commentary notes. */
export function StudyContext({ verses, books, onPickRef }: Props) {
  const v = verses[0];

  const xrefQuery = useQuery({
    queryKey: ['crossrefs', v?.bookNumber, v?.chapter, v?.verse],
    queryFn: () => api.crossrefs(v!.bookNumber, v!.chapter, v!.verse),
    enabled: !!v,
  });
  const comQuery = useQuery({
    queryKey: ['commentary', v?.bookNumber, v?.chapter, v?.verse],
    queryFn: () => api.commentary(v!.bookNumber, v!.chapter, v!.verse),
    enabled: !!v,
  });

  if (!v) {
    return (
      <Text size="sm" c="dimmed" p="md">
        Оберіть вірш у списку.
      </Text>
    );
  }

  const bookName = (n: number) => {
    const b = books.find((x) => x.bookNumber === n);
    return b?.shortName || b?.longName || `#${n}`;
  };
  const xrefs = xrefQuery.data ?? [];
  const notes = comQuery.data ?? [];
  const loading = xrefQuery.isFetching || comQuery.isFetching;

  return (
    <Stack p="md" gap="sm">
      <Group gap={6} wrap="nowrap">
        <Text fw={600} size="sm">
          Перехресні посилання
        </Text>
        {loading && <Loader size="xs" />}
      </Group>
      {xrefs.length > 0 ? (
        <Group gap={6}>
          {xrefs.map((x, i) => (
            <Badge
              key={i}
              variant="light"
              color="brand"
              style={{ cursor: onPickRef ? 'pointer' : 'default' }}
              onClick={() =>
                onPickRef?.({
                  translationId: v.translationId,
                  bookNumber: x.bookNumber,
                  chapter: x.chapter,
                  verse: x.verseStart,
                })
              }
            >
              {bookName(x.bookNumber)} {x.chapter}:{x.verseStart}
              {x.verseEnd > x.verseStart ? `-${x.verseEnd}` : ''}
            </Badge>
          ))}
        </Group>
      ) : (
        !xrefQuery.isFetching && (
          <Text size="xs" c="dimmed">
            Немає перехресних посилань. Додайте модуль <code>*.crossreferences</code> у теку
            modules/ і натисніть «Пересканувати модулі» (Налаштування вигляду → Застосунок).
          </Text>
        )
      )}

      <Text fw={600} size="sm" mt="xs">
        Коментарі
      </Text>
      {notes.length > 0
        ? notes.map((n, i) => (
            <Box key={i}>
              <Badge size="xs" variant="light" color="gray" mb={2}>
                {n.source}
                {n.marker ? ` ${n.marker}` : ''}
              </Badge>
              <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
                {n.text}
              </Text>
            </Box>
          ))
        : !comQuery.isFetching && (
            <Text size="xs" c="dimmed">
              Немає коментарів для цього вірша.
            </Text>
          )}
    </Stack>
  );
}
