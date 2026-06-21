import { useState } from 'react';
import { Stack, Text, Paper, Group, Badge, Loader } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { api, type Verse } from '../api';
import { parseStrongTokens } from '../lib/strong';

interface Props {
  verses: Verse[];
  hasStrong: boolean;
}

interface ActiveWord {
  text: string;
  strong: string | null;
}

const stripPunct = (w: string) => w.replace(/[.,;:!?»«"'()[\]<>]/g, '').trim();

/**
 * Interlinear study view: the selected verse(s) word by word. Click any word to
 * see its Strong's entry (if the word carries a `<S>` number) and any explanatory
 * dictionary entry for the word, shown below with the word highlighted.
 */
export function StrongView({ verses, hasStrong }: Props) {
  const [active, setActive] = useState<ActiveWord | null>(null);
  const book = verses[0]?.bookNumber;

  const strongQuery = useQuery({
    queryKey: ['strong', active?.strong, book],
    queryFn: () => api.strong(active!.strong!, book),
    enabled: active?.strong != null,
  });
  const wordQuery = useQuery({
    queryKey: ['dict', active?.text.toLowerCase()],
    queryFn: () => api.dict(active!.text),
    enabled: !!active?.text,
  });

  if (verses.length === 0) {
    return (
      <Text size="sm" c="dimmed" p="md">
        Оберіть вірш у списку.
      </Text>
    );
  }

  const strongDefs = strongQuery.data ?? [];
  const wordDefs = wordQuery.data ?? [];
  const loading = strongQuery.isFetching || wordQuery.isFetching;

  return (
    <Stack p="md" gap="sm">
      {!hasStrong && (
        <Text size="xs" c="dimmed">
          Без номерів Стронга — доступний лише словник по слову.
        </Text>
      )}
      {verses.map((v) => {
        const tokens = hasStrong
          ? parseStrongTokens(v.textRaw ?? '')
          : (v.text ?? '').split(/\s+/).map((w) => ({ text: w, strong: null }));
        return (
          <Text key={v.verse} size="md" style={{ lineHeight: 2 }}>
            <Text span fw={700} c="brand" mr={6}>
              {v.verse}
            </Text>
            {tokens.map((t, i) => (
              <span
                key={i}
                className="vo-strong"
                role="button"
                tabIndex={0}
                data-active={
                  active && active.text === stripPunct(t.text) && active.strong === t.strong
                    ? 'true'
                    : undefined
                }
                onClick={() => setActive({ text: stripPunct(t.text), strong: t.strong })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActive({ text: stripPunct(t.text), strong: t.strong });
                  }
                }}
              >
                {t.text}
                {t.strong && <sup>{t.strong}</sup>}{' '}
              </span>
            ))}
          </Text>
        );
      })}

      {active && (
        <Paper withBorder p="sm">
          <Group justify="space-between" mb={4}>
            <Text fw={600} size="sm">
              {active.text}
              {active.strong ? ` · Стронг ${active.strong}` : ''}
            </Text>
            {loading && <Loader size="xs" />}
          </Group>

          {strongDefs.map((d, i) => (
            <div key={`s${i}`} style={{ marginTop: 6 }}>
              <Badge size="xs" variant="light" color="brand" mb={2}>
                {d.dictionary}
              </Badge>
              <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
                {d.definition}
              </Text>
            </div>
          ))}
          {wordDefs.map((d, i) => (
            <div key={`w${i}`} style={{ marginTop: 6 }}>
              <Badge size="xs" variant="light" color="gray" mb={2}>
                {d.dictionary} · {d.topic}
              </Badge>
              <Text size="sm" style={{ whiteSpace: 'pre-line' }} lineClamp={12}>
                {d.definition}
              </Text>
            </div>
          ))}

          {!loading && strongDefs.length === 0 && wordDefs.length === 0 && (
            <Text size="sm" c="dimmed">
              {active.strong
                ? `Нічого для Стронг ${active.strong}. Додай Стронг-словник у modules/ і перезбудуй.`
                : 'У словниках нічого не знайдено для цього слова.'}
            </Text>
          )}
        </Paper>
      )}
    </Stack>
  );
}
