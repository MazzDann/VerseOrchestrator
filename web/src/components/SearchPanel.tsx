import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
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
import { searchEnter } from '../lib/quickRef';
import { isScrolling } from '../lib/scrolling';
import { useSearchRows } from '../lib/useSearchRows';
import { useSettings } from '../settingsStore';
import { tr, useLang } from '../i18n';

export type SearchScope = 'current' | 'all';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Search folds accents (й→и, ї→і, ё→е), so a bare-letter query can match an accented
// verse word. Mirror that when highlighting: a base letter also matches its variant.
const FOLD_VARIANTS: Record<string, string> = { и: 'й', і: 'ї', е: 'ё' }; // i18n-ignore: letters
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
  /** `show`: picked with ⌘↩ / Ctrl+Enter — and put on screen (Mac check of 1.9.0) */
  onPick: (result: SearchResult, opts?: { show: boolean }) => void;
  /** the query — the header's field and this panel share it (1.8.12-beta.4) */
  query: string;
  setQuery: (q: string) => void;
  /** the header's field is hidden (a narrow window): the panel shows a field of its own */
  ownField: boolean;
  /** the header's field hands its ↑ ↓ Enter Esc here first */
  keysRef: MutableRefObject<((e: React.KeyboardEvent) => boolean) | null>;
  /** the translations' short names, for the rows that stand for several */
  translations: readonly { id: number; abbr: string }[];
  /** one row per place found in several translations (Налаштування вигляду → Пошук) */
  dedupe: boolean;
  /** Enter with nothing to pick (typing still, numbers in the open book): go as the header does */
  onEnter: (q: string, opts: { show: boolean }) => void;
  /** a pick or a jump: the query goes, the scope is the settings' again */
  onDone: () => void;
}

/**
 * The results of the one search (1.8.12-beta.4, the author's calls; F3 / Ctrl+F = the main
 * translation, F4 = all): under the header's field while typing — references («бут 2 3», «Ів
 * 3:16-18») and words alike, the server decides which. The main translation first; with nothing
 * there, the others («У поточному нічого — знайдено в інших»). A verse found in several
 * translations is one row. Rendered inline (no Modal/portal) for reliability.
 */
export function SearchPanel({
  open,
  onClose,
  primaryId,
  scope,
  onScopeChange,
  onPick,
  query,
  setQuery,
  ownField,
  keysRef,
  translations,
  dedupe,
  onEnter,
  onDone,
}: Props) {
  useLang();
  const [debounced] = useDebouncedValue(query, 200);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = scope === 'current' && primaryId != null;
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['search', debounced, scope, primaryId],
    queryFn: async () => {
      const first = await api.search(debounced, current ? [primaryId] : []);
      // nothing in the main translation: the others (the author's call)
      if (current && first.results.length === 0) {
        const all = await api.search(debounced, []);
        return { ...all, fallback: all.results.length > 0 };
      }
      return { ...first, fallback: false };
    },
    enabled: open && debounced.trim().length >= 2,
  });
  const abbr = useMemo(() => new Map(translations.map((t) => [t.id, t.abbr])), [translations]);
  // several translations found: their chapter lengths align the numberings (1.8.12-beta.5), so
  // Ps 22 of one and Ps 23 of another — the same psalm — are one row; until they come, places
  // as given
  const grouped = useSearchRows(data?.results, primaryId, dedupe);
  // the translations' names worked out once per result list: fresh arrays each render made every
  // memoized row render again on each highlight move (review; the 0.6.5 rule)
  const rows = useMemo(
    () =>
      grouped.slice(0, 80).map((row) => {
        const names = row.also.map((id) => abbr.get(id) ?? '').filter(Boolean);
        return {
          ...row,
          alsoText:
            names.length > 4
              ? `${names.slice(0, 4).join(', ')} +${names.length - 4}`
              : names.join(', '),
          ownText:
            row.also.length > 0 || row.r.translationId !== primaryId
              ? (abbr.get(row.r.translationId) ?? '')
              : '',
        };
      }),
    [grouped, primaryId, abbr],
  );
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
    if (open && ownField) {
      setHighlight(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, ownField]);

  useEffect(() => setHighlight(0), [debounced, scope]);

  // a stable handler for the memoized rows (the props change every render)
  const pickRef = useRef<(r: SearchResult) => void>(() => undefined);
  const onRowPick = useCallback((r: SearchResult) => pickRef.current(r), []);

  const pick = (r: SearchResult, opts?: { show: boolean }) => {
    onPick(r, opts);
    onDone();
  };
  pickRef.current = pick;

  /** ↑ ↓ through the rows, Enter picks, Esc closes — from this panel's field or the header's */
  const onKey = (e: React.KeyboardEvent): boolean => {
    if (!open) return false;
    if (e.key === 'ArrowDown' && rows.length > 0) {
      e.preventDefault();
      setHighlight((h) => Math.min(rows.length - 1, h + 1));
      return true;
    }
    if (e.key === 'ArrowUp' && rows.length > 0) {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
      return true;
    }
    // the results of what is typed now (not of a query the debounce hasn't caught up with);
    // ⌘↩ / Ctrl+Enter: the hit on screen too (Mac check of 1.9.0)
    const enter = searchEnter(e, useSettings.getState().keymap.project);
    if (enter && rows[highlight] && debounced === query) {
      e.preventDefault();
      pick(rows[highlight].r, enter);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return true;
    }
    return false;
  };
  keysRef.current = open ? onKey : null;
  useEffect(
    () => () => {
      keysRef.current = null;
    },
    [keysRef],
  );

  if (!open) return null;

  return (
    <Paper withBorder shadow="sm" p="sm" m="sm">
      <Group gap="xs" wrap="nowrap">
        {ownField ? (
          <TextInput
            ref={inputRef}
            flex={1}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              // the field owns Enter, as the header's does (Mac check of 1.9.0)
              const enter = searchEnter(e, useSettings.getState().keymap.project);
              if (enter) e.stopPropagation();
              if (!onKey(e) && enter) {
                e.preventDefault();
                onEnter(query, enter);
              }
            }}
            placeholder={tr('Пошук: «любов», «Ів 3:16», «"світло життя"», «-темрява», «G2424»')}
            leftSection={<IconSearch size={18} />}
            rightSection={isFetching ? <Loader size="xs" /> : null}
            aria-label={tr('Пошук або посилання')}
          />
        ) : (
          <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <IconSearch size={16} />
            <Text size="sm" fw={500} truncate>
              {debounced.trim().length >= 2
                ? tr('Знайдено для «{query}»', { query: debounced.trim() })
                : tr('Пошук')}
            </Text>
            {isFetching && <Loader size="xs" />}
          </Group>
        )}
        <SegmentedControl
          size="xs"
          value={scope}
          onChange={(v) => onScopeChange(v as SearchScope)}
          data={[
            { label: tr('Поточний (F3)'), value: 'current' },
            { label: tr('Усі (F4)'), value: 'all' },
          ]}
        />
        <ActionIcon
          variant="subtle"
          color="gray"
          onClick={onClose}
          aria-label={tr('Закрити пошук')}
        >
          <IconX size={18} />
        </ActionIcon>
      </Group>
      {data?.fallback && (
        <Text size="xs" c="dimmed" mt={6}>
          {tr('У поточному перекладі нічого — знайдено в інших.')}
        </Text>
      )}
      {suggestions.length > 0 && (
        <Group gap={6} mt="xs" wrap="wrap">
          <Text size="xs" c="dimmed">
            {tr('Можливо:')}
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
      {(debounced.trim().length >= 2 || rows.length > 0) && (
        <ScrollArea.Autosize mah="min(320px, 30vh)" mt="xs">
          <Stack gap={0}>
            {rows.map((row, i) => (
              <ResultRow
                key={row.key}
                r={row.r}
                also={row.alsoText}
                own={row.ownText}
                index={i}
                active={i === highlight}
                terms={terms}
                onPick={onRowPick}
                onPoint={setHighlight}
              />
            ))}
            {debounced.trim().length >= 2 && rows.length === 0 && !isFetching && error && (
              // a failed search says so — «Нічого не знайдено» sent users to other words (F1010-02)
              <Group gap="xs" p="sm" wrap="nowrap">
                <Text size="sm" c="red" style={{ flex: 1, minWidth: 0 }}>
                  {tr('Пошук не вдався: {error}', { error: error.message })}
                </Text>
                <Button size="compact-xs" variant="light" onClick={() => void refetch()}>
                  {tr('Спробувати ще раз')}
                </Button>
              </Group>
            )}
            {debounced.trim().length >= 2 && rows.length === 0 && !isFetching && !error && (
              <Text size="sm" c="dimmed" p="sm">
                {tr('Нічого не знайдено')}
              </Text>
            )}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Paper>
  );
}

/**
 * One result. Memoized: moving the highlight re-renders the two rows that change, not all
 * of them (with their term highlighting). The highlight follows the pointer only when it
 * really MOVES — rows scrolling under a still pointer used to take it one after another
 * (20 flashes and 44 renders of the list in 20 wheel steps, 0.6.5).
 */
const ResultRow = memo(function ResultRow({
  r,
  also,
  own,
  index,
  active,
  terms,
  onPick,
  onPoint,
}: {
  r: SearchResult;
  /** the other translations that have this verse (one row for all), named */
  also: string;
  /** this row's own translation, named when it isn't the main one alone */
  own: string;
  index: number;
  active: boolean;
  terms: string[];
  onPick: (r: SearchResult) => void;
  onPoint: (index: number) => void;
}) {
  return (
    <Box
      onClick={() => onPick(r)}
      onMouseMove={() => {
        if (!active && !isScrolling()) onPoint(index);
      }}
      style={{
        cursor: 'pointer',
        borderRadius: 6,
        padding: '6px 8px',
        background: active ? 'var(--mantine-color-brand-light)' : undefined,
      }}
    >
      <Text size="xs" c="dimmed">
        {r.longName || r.shortName} {r.chapter}:{r.verse}
        {own && ` · ${own}`}
        {also && ` · ${tr('також: {list}', { list: also })}`}
      </Text>
      <Text size="sm" lineClamp={1}>
        {highlightTerms(r.text, terms)}
      </Text>
    </Box>
  );
});
