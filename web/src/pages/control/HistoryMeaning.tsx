import { Box, Loader, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconMusic } from '@tabler/icons-react';
import { api } from '../../api';
import { Closeness } from '../../components/SearchPanel';
import { currentLocale, tr, trn, useLang } from '../../i18n';
import { NEEDS_SERVER, useServer } from '../../serverStore';
import { type RefItem } from '../../settingsStore';

/**
 * «~ тема» in «Історія» (1.25.0-beta.3, the author: «по всіх показах»): what was ever shown on the
 * theme — passages and songs from the server's show history — the nearest first, with how often
 * and when last. A passage opens where it is, a song in «Презентації».
 */
export function HistoryMeaning({
  query,
  translationIds,
  onPlace,
  onSong,
}: {
  query: string;
  translationIds: number[];
  onPlace: (item: RefItem) => void;
  onSong: (songId: number) => void;
}) {
  useLang();
  const server = useServer((s) => s.available);
  const found = useQuery({
    queryKey: ['stats-meaning', query, translationIds.join(',')],
    queryFn: () => api.shownByMeaning(query, translationIds),
    enabled: server !== false,
    staleTime: 30_000,
  });
  const note = (text: string) => (
    <Text size="xs" c="dimmed" p="xs">
      {text}
    </Text>
  );
  if (server === false) return note(tr(NEEDS_SERVER));
  if (found.isPending)
    return (
      <Box p="xs">
        <Loader size="xs" />
      </Box>
    );
  if (found.isError) return note(tr((found.error as Error).message));
  const { results, missing } = found.data;
  if (!results.length)
    return note(
      missing === 'model'
        ? tr(
            'Пошук за змістом ще не налаштовано: виберіть і завантажте модель у «Налаштування вигляду → Пошук → Пошук за змістом».',
          )
        : missing === 'vectors'
          ? tr(
              'Показаного ще немає з векторами: вони з’являться, щойно модель обчислить переклад чи презентації.',
            )
          : tr('Серед показаного нічого близького до цієї теми'),
    );
  const date = (ms: number) =>
    new Date(ms).toLocaleDateString(currentLocale(), {
      day: 'numeric',
      month: 'short',
      year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
  return (
    <Stack gap={0} data-history-meaning>
      {results.map((r) => (
        <Box
          key={`${r.kind}:${r.songId ?? `${r.book}:${r.chapter}:${r.from}-${r.to}`}`}
          className="vo-list-item"
          role="button"
          tabIndex={0}
          onClick={() => pick(r)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              pick(r);
            }
          }}
        >
          {r.kind === 'song' && <IconMusic size={12} style={{ marginRight: 4 }} />}
          {r.label} <Closeness level={r.closeness as 1 | 2 | 3} />
          <Text size="xs" c="dimmed">
            {trn(r.shows, 'показано {n} раз|показано {n} рази|показано {n} разів')}
            {' · '}
            {date(r.last)}
          </Text>
        </Box>
      ))}
    </Stack>
  );

  function pick(r: (typeof results)[number]) {
    if (r.kind === 'song' && r.songId) return onSong(r.songId);
    if (!r.book || !r.chapter) return;
    const from = r.from ?? 1;
    const to = r.to ?? from;
    onPlace({
      ref: r.label,
      // the translation shown leads; with none chosen, the one the passage was found in
      translationId: translationIds[0] ?? r.translationId ?? 0,
      bookNumber: r.book,
      chapter: r.chapter,
      verse: from,
      ...(to > from ? { verses: Array.from({ length: to - from + 1 }, (_, i) => from + i) } : {}),
    });
  }
}
