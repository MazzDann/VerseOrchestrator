import { useEffect, useState, type RefObject } from 'react';
import { Kbd, Paper, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api, type SearchResult, type Translation } from '../../api';
import { useSearchRows } from '../../lib/useSearchRows';
import { tr, useLang } from '../../i18n';

/**
 * The desk's one search field (1.9.0-beta.1) — the control window's and the remote's way: a
 * reference («Ів 3:16») or words from the text; the desk's translations first, all of them when
 * nothing is there; one row per verse. A row (or Enter for the first) opens its chapter there.
 */
export function DeskSearch({
  translationIds,
  translations,
  inputRef,
  onOpen,
}: {
  translationIds: number[];
  translations: Translation[];
  inputRef: RefObject<HTMLInputElement>;
  onOpen: (r: SearchResult) => void;
}) {
  useLang();
  const [text, setText] = useState('');
  const [words, setWords] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setWords(text.trim()), 250);
    return () => window.clearTimeout(t);
  }, [text]);
  // only once the debounce caught up: Enter before it would open the previous query's first row
  const query = words === text.trim() && words.length >= 2 ? words : '';
  const found = useQuery({
    queryKey: ['desk-search', query, translationIds.join(',')],
    queryFn: async () => {
      const first = await api.search(query, translationIds);
      if (first.results.length > 0 || translationIds.length === 0)
        return { ...first, fallback: false };
      const all = await api.search(query, []);
      return { ...all, fallback: all.results.length > 0 };
    },
    enabled: query.length > 0,
  });
  const rows = useSearchRows(found.data?.results, translationIds[0] ?? null, true).slice(0, 40);
  const abbrOf = (id: number) => translations.find((t) => t.id === id)?.abbr ?? '';
  const pick = (r: SearchResult) => {
    onOpen(r);
    setText('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: '12rem', maxWidth: '36rem' }}>
      <TextInput
        ref={inputRef}
        size="sm"
        aria-label={tr('Пошук: посилання чи слова')}
        placeholder={tr('Книга, посилання чи слова…')}
        leftSection={<IconSearch size={16} />}
        rightSection={text ? null : <Kbd size="xs">/</Kbd>}
        value={text}
        onFocus={() => setOpen(true)}
        // the list stays while the focus moves into it (↓ from the field)
        onBlur={(e) => {
          if (!(e.relatedTarget as HTMLElement | null)?.closest('.vo-desk-found')) setOpen(false);
        }}
        onChange={(e) => {
          setText(e.currentTarget.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && query && rows[0]) {
            e.preventDefault();
            pick(rows[0].r);
          } else if (e.key === 'Escape') {
            setText('');
            e.currentTarget.blur();
          } else if (e.key === 'ArrowDown' && rows.length > 0) {
            e.preventDefault();
            document.querySelector<HTMLElement>('.vo-desk-found [role=option]')?.focus();
          }
        }}
      />
      {open && query && (
        <Paper
          className="vo-desk-found"
          withBorder
          shadow="md"
          role="listbox"
          aria-label={tr('Знайдене')}
          onBlur={(e) => {
            const to = e.relatedTarget as HTMLElement | null;
            if (to !== inputRef.current && !e.currentTarget.contains(to)) setOpen(false);
          }}
        >
          {found.data?.fallback && (
            <Text size="xs" c="dimmed" px="sm" pt="xs">
              {tr('У ваших перекладах нічого — знайдено в інших')}
            </Text>
          )}
          {rows.length === 0 ? (
            <Text size="sm" c="dimmed" p="sm">
              {found.isFetching ? tr('Шукаю…') : tr('Нічого не знайдено за «{query}»', { query })}
            </Text>
          ) : (
            rows.map(({ key, r, also }) => (
              <div
                key={key}
                className="vo-list-item"
                role="option"
                aria-selected={false}
                tabIndex={0}
                // keep the field's focus until the click lands (its blur closes the list)
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pick(r);
                  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    const el = e.currentTarget;
                    const to = (
                      e.key === 'ArrowDown' ? el.nextElementSibling : el.previousElementSibling
                    ) as HTMLElement | null;
                    if (to?.getAttribute('role') === 'option') to.focus();
                    else if (e.key === 'ArrowUp') inputRef.current?.focus();
                  } else if (e.key === 'Escape') {
                    e.stopPropagation();
                    inputRef.current?.focus();
                  }
                }}
              >
                <Text size="sm" fw={500} span>
                  {`${r.shortName || r.longName} ${r.chapter}:${r.verse}`}
                </Text>{' '}
                <Text size="xs" c="dimmed" span>
                  {[r.translationId, ...also].map(abbrOf).filter(Boolean).join(', ')}
                </Text>
                <Text size="sm" c="dimmed" lineClamp={2}>
                  {r.text}
                </Text>
              </div>
            ))
          )}
        </Paper>
      )}
    </div>
  );
}
