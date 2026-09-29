import { type ReactNode, useState } from 'react';
import { Stack, Text, Paper, Group, Badge, Loader, Button } from '@mantine/core';
import { IconDeviceTv, IconListSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api, type Verse } from '../api';
import { useSettings } from '../settingsStore';
import { parseStrongTokens } from '../lib/strong';
import { tr, useLang } from '../i18n';

export interface StrongPickRef {
  translationId: number;
  bookNumber: number;
  chapter: number;
  verse: number;
}

interface Props {
  verses: Verse[];
  hasStrong: boolean;
  /** Project the current verse with this Strong "word — gloss" subline + highlighted word. */
  onProjectStrong?: (subline: string, strong: string) => void;
  /** Open the concordance ("where else used") for this Strong number beside the verses. */
  onShowConcordance?: (strong: string) => void;
}

interface ActiveWord {
  text: string;
  strong: string | null;
}

const stripPunct = (w: string) => w.replace(/[.,;:!?»«"'()[\]<>]/g, '').trim();

// Cross-reference Strong tokens inside a definition, e.g. "see H7225" / "G2316".
const CROSSREF_RE = /\b([GH])(\d{1,5})\b/g;

/** Render a definition, turning embedded G####/H#### references into clickable links. */
function DefinitionText({
  text,
  lineClamp,
  onStrong,
}: {
  text: string;
  lineClamp?: number;
  onStrong: (label: string) => void;
}) {
  const parts: ReactNode[] = [];
  const re = new RegExp(CROSSREF_RE);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const label = m[0];
    parts.push(
      <span
        key={m.index}
        className="vo-strong-ref"
        role="button"
        tabIndex={0}
        onClick={() => onStrong(label)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onStrong(label);
          }
        }}
      >
        {label}
      </span>,
    );
    last = m.index + label.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <Text size="sm" style={{ whiteSpace: 'pre-line' }} lineClamp={lineClamp}>
      {parts}
    </Text>
  );
}

/**
 * Interlinear study view: the selected verse(s) word by word. Click any word to
 * see its Strong's entry (if the word carries a `<S>` number) and any explanatory
 * dictionary entry for the word, shown below with the word highlighted. A Strong
 * entry can open the concordance ("where else is this word used") beside the verse
 * list, and G####/H#### cross-references in definitions are clickable.
 */
export function StrongView({ verses, hasStrong, onProjectStrong, onShowConcordance }: Props) {
  useLang();
  const [active, setActive] = useState<ActiveWord | null>(null);
  const book = verses[0]?.bookNumber;
  const strongSubline = useSettings((s) => s.appearance.strongSubline);

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

  // Follow a G####/H#### cross-reference: make it the active Strong number,
  // keeping the original label (e.g. "G303") as the displayed word.
  const followCrossRef = (label: string) => {
    const digits = label.match(/\d+/)?.[0] ?? label;
    setActive({ text: label, strong: digits });
  };

  if (verses.length === 0) {
    return (
      <Text size="sm" c="dimmed" p="md">
        {tr('Оберіть вірш у списку.')}
      </Text>
    );
  }

  const strongDefs = strongQuery.data ?? [];
  const wordDefs = wordQuery.data ?? [];
  const loading = strongQuery.isFetching || wordQuery.isFetching;

  // Projection subline from the active Strong gloss: just the lemma line, or the
  // full definition, per the appearance setting (joined onto one line).
  const glossLines = (strongDefs[0]?.definition ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const gloss = strongSubline === 'full' ? glossLines.join(' — ') : (glossLines[0] ?? '');
  const projectSubline =
    active?.strong != null
      ? `${active.text} · ${tr('Стронг {n}', { n: active.strong })}${gloss ? ` — ${gloss}` : ''}`
      : null;

  return (
    <Stack p="md" gap="sm">
      {!hasStrong && (
        <Text size="xs" c="dimmed">
          {tr('Без номерів Стронга — доступний лише словник по слову.')}
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
              {active.strong ? ` · ${tr('Стронг {n}', { n: active.strong })}` : ''}
            </Text>
            {loading && <Loader size="xs" />}
          </Group>

          {active.strong && onProjectStrong && projectSubline && (
            <Button
              size="xs"
              variant="light"
              color="live"
              fullWidth
              mb={6}
              leftSection={<IconDeviceTv size={14} />}
              onClick={() => onProjectStrong(projectSubline, active.strong!)}
            >
              {tr('На екран зі Стронгом')}
            </Button>
          )}

          {strongDefs.map((d, i) => (
            <div key={`s${i}`} style={{ marginTop: 6 }}>
              <Badge size="xs" variant="light" color="brand" mb={2}>
                {d.dictionary}
              </Badge>
              <DefinitionText text={d.definition} onStrong={followCrossRef} />
            </div>
          ))}
          {wordDefs.map((d, i) => (
            <div key={`w${i}`} style={{ marginTop: 6 }}>
              <Badge size="xs" variant="light" color="gray" mb={2}>
                {d.dictionary} · {d.topic}
              </Badge>
              <DefinitionText text={d.definition} lineClamp={12} onStrong={followCrossRef} />
            </div>
          ))}

          {!loading && strongDefs.length === 0 && wordDefs.length === 0 && (
            <Text size="sm" c="dimmed">
              {active.strong
                ? tr(
                    'Немає статті для {n}. Додайте словник Стронга в папку modules/ і натисніть «Пересканувати модулі» (Налаштування вигляду → Застосунок).',
                    { n: active.strong },
                  )
                : tr('У словниках нічого не знайдено для цього слова.')}
            </Text>
          )}

          {active.strong && onShowConcordance && (
            <Button
              variant="light"
              size="xs"
              color="brand"
              fullWidth
              mt={10}
              leftSection={<IconListSearch size={14} />}
              onClick={() => onShowConcordance(active.strong!)}
            >
              {tr('Де ще вживається · Стронг {n}', { n: active.strong })}
            </Button>
          )}
        </Paper>
      )}
    </Stack>
  );
}
