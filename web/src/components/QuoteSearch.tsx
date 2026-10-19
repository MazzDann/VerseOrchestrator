import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Group,
  ScrollArea,
  SegmentedControl,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import { api } from '../api';
import { tr, useLang } from '../i18n';

type Lang = 'uk' | 'en';
type Quote = { text: string; author: string; page: string; credit: string };

/**
 * «Цитати з Вікіцитат» in «Текст на екран» (1.19.0-beta.10, the author: quotes from the internet):
 * Ukrainian or English Wikiquote — a click puts the quote into the text, its author and the site into
 * the title (the slide's reference line), as the site's licence asks.
 */
export function QuoteSearch({
  onPick,
  onClose,
}: {
  onPick: (quote: Quote) => void;
  onClose: () => void;
}) {
  useLang();
  const [q, setQ] = useState('');
  const [lang, setLang] = useState<Lang>('uk');
  const [found, setFound] = useState<Quote[] | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  /** the newest search: an older answer (another language) is dropped */
  const asked = useRef(0);

  const search = async (from: Lang = lang) => {
    const query = q.trim();
    if (!query) return;
    const mine = ++asked.current;
    setBusy(true);
    try {
      const got = await api.searchQuotes(query, from);
      if (mine === asked.current) setFound(got.quotes);
    } catch (e) {
      if (mine === asked.current)
        notifications.show({ message: tr((e as Error).message), color: 'red' });
    } finally {
      if (mine === asked.current) setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <Group gap={6} wrap="nowrap">
        <TextInput
          ref={field}
          size="xs"
          style={{ flex: 1 }}
          leftSection={<IconSearch size={13} />}
          placeholder={tr('Слово чи автор, як-от «надія» чи «Франко»')}
          aria-label={tr('Пошук цитат')}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onClose();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              void search();
            }
          }}
        />
        <SegmentedControl
          size="xs"
          value={lang}
          onChange={(v) => {
            setLang(v as Lang);
            if (q.trim()) void search(v as Lang);
          }}
          data={[
            { value: 'uk', label: tr('Українська') },
            { value: 'en', label: 'English' },
          ]}
          aria-label={tr('Мова цитат')}
        />
        <Button size="xs" loading={busy} disabled={!q.trim()} onClick={() => void search()}>
          {tr('Шукати')}
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mt={4}>
        {tr('Цитати з Вікіцитат; клацніть, щоб узяти. Автор і джерело стануть підписом слайда.')}
      </Text>
      {found &&
        (found.length === 0 ? (
          <Text size="sm" c="dimmed" mt={6}>
            {tr('Нічого не знайдено')}
          </Text>
        ) : (
          <ScrollArea.Autosize mah="min(320px, 40vh)" mt={6}>
            {found.map((x, i) => (
              <UnstyledButton
                key={i}
                className="vo-list-item"
                data-quote
                onClick={() => onPick(x)}
                style={{ display: 'block', width: '100%', padding: '6px 8px', borderRadius: 6 }}
              >
                <Text size="sm" lineClamp={4} style={{ whiteSpace: 'pre-line' }}>
                  {x.text}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  — {x.credit}
                </Text>
              </UnstyledButton>
            ))}
          </ScrollArea.Autosize>
        ))}
    </div>
  );
}
