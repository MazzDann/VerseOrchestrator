import { useEffect, useMemo, useState } from 'react';
import {
  AppShell,
  Group,
  Button,
  MultiSelect,
  ScrollArea,
  Stack,
  Text,
  Badge,
  ActionIcon,
  Tooltip,
  Title,
  Box,
  TextInput,
  Divider,
  useMantineColorScheme,
  useComputedColorScheme,
} from '@mantine/core';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useHotkeys } from 'react-hotkeys-hook';
import { notifications } from '@mantine/notifications';
import {
  IconScreenShare,
  IconDeviceTv,
  IconSquareOff,
  IconSun,
  IconMoonStars,
  IconSearch,
} from '@tabler/icons-react';

import { api, type Book, type Verse, type SearchResult } from '../api';
import { useStore } from '../store';
import { publishSlide, type Slide, type SlideLine } from '../presenterBus';
import { openPresenterWindow } from '../openPresenter';
import { SearchPanel, type SearchScope } from '../components/SearchPanel';
import { VirtualList } from '../components/VirtualList';

const EMPTY_ARRAY: never[] = [];

export function Control() {
  const { toggleColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme('dark');

  const selectedIds = useStore((s) => s.selectedTranslationIds);
  const bookNumber = useStore((s) => s.bookNumber);
  const chapter = useStore((s) => s.chapter);
  const selectedVerses = useStore((s) => s.selectedVerses);
  const live = useStore((s) => s.live);
  const setTranslations = useStore((s) => s.setTranslations);
  const selectBook = useStore((s) => s.selectBook);
  const selectChapter = useStore((s) => s.selectChapter);
  const setSelectedVerses = useStore((s) => s.setSelectedVerses);
  const toggleVerse = useStore((s) => s.toggleVerse);
  const setLive = useStore((s) => s.setLive);

  const primaryId = selectedIds[0] ?? null;
  const [bookFilter, setBookFilter] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('current');
  const [searchOpen, setSearchOpen] = useState(false);

  const jumpTo = (r: SearchResult) => {
    // If nothing is selected yet, show the result's own translation; otherwise
    // keep the current selection and just navigate (book numbers are shared).
    if (selectedIds.length === 0) setTranslations([r.translationId]);
    selectBook(r.bookNumber);
    selectChapter(r.chapter);
    setSelectedVerses([r.verse]);
  };

  const openSearch = (scope: SearchScope) => {
    setSearchScope(scope);
    setSearchOpen(true);
  };

  const translationsQuery = useQuery({ queryKey: ['translations'], queryFn: api.translations });
  const translations = translationsQuery.data ?? EMPTY_ARRAY;

  const booksQuery = useQuery({
    queryKey: ['books', primaryId],
    queryFn: () => api.books(primaryId!),
    enabled: primaryId != null,
  });
  const books = booksQuery.data ?? EMPTY_ARRAY;
  const filteredBooks = useMemo(() => {
    const q = bookFilter.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) => b.longName.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q),
    );
  }, [books, bookFilter]);

  const chaptersQuery = useQuery({
    queryKey: ['chapters', primaryId, bookNumber],
    queryFn: () => api.chapters(primaryId!, bookNumber!),
    enabled: primaryId != null && bookNumber != null,
  });
  const chapters = chaptersQuery.data ?? [];

  const verseQueries = useQueries({
    queries: selectedIds.map((id) => ({
      queryKey: ['verses', id, bookNumber, chapter],
      queryFn: () => api.verses(id, bookNumber!, chapter!),
      enabled: bookNumber != null && chapter != null,
    })),
  });
  const versesByTranslation = useMemo(() => {
    const map = new Map<number, Verse[]>();
    selectedIds.forEach((id, i) => map.set(id, verseQueries[i]?.data ?? []));
    return map;
  }, [selectedIds, verseQueries]);
  const primaryVerses = primaryId != null ? (versesByTranslation.get(primaryId) ?? []) : [];

  const currentBook = books.find((b) => b.bookNumber === bookNumber) ?? null;
  const reference = useMemo(
    () => formatReference(currentBook, chapter, selectedVerses),
    [currentBook, chapter, selectedVerses],
  );

  const slideLines = useMemo<SlideLine[]>(() => {
    if (selectedVerses.length === 0) return [];
    return selectedIds
      .map((id) => {
        const t = translations.find((x) => x.id === id);
        const verses = versesByTranslation.get(id) ?? [];
        const text = verses
          .filter((v) => selectedVerses.includes(v.verse))
          .map((v) => (v.text ?? '').trim())
          .filter(Boolean)
          .join('  ');
        if (!text) return null;
        return { translationAbbr: t?.abbr ?? '', text, rtl: !!t?.rtl } as SlideLine;
      })
      .filter((x): x is SlideLine => x !== null);
  }, [selectedIds, selectedVerses, versesByTranslation, translations]);

  const send = (overrides?: Partial<Slide>) => {
    const slide: Slide = {
      lines: slideLines,
      reference,
      blank: false,
      visible: slideLines.length > 0,
      ...overrides,
    };
    publishSlide(slide);
    setLive(slide.visible && !slide.blank);
  };

  useEffect(() => {
    if (live && slideLines.length > 0) send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideLines, reference]);

  const stepVerse = (delta: number) => {
    if (primaryVerses.length === 0) return;
    const all = primaryVerses.map((v) => v.verse);
    const current = selectedVerses.length ? selectedVerses[selectedVerses.length - 1] : all[0] - 1;
    const idx = all.indexOf(current);
    const next = all[Math.min(all.length - 1, Math.max(0, idx + delta))];
    if (next != null) setSelectedVerses([next]);
  };

  useHotkeys('right,down', () => stepVerse(1), [primaryVerses, selectedVerses]);
  useHotkeys('left,up', () => stepVerse(-1), [primaryVerses, selectedVerses]);
  useHotkeys('b', () => (live ? send({ blank: true }) : undefined), [live, slideLines, reference]);
  useHotkeys(
    'escape',
    () => publishSlide({ lines: [], reference: '', blank: false, visible: false }),
    [],
  );
  useHotkeys('f3', () => openSearch('current'), { preventDefault: true, enableOnFormTags: true });
  useHotkeys('ctrl+f', () => openSearch('current'), {
    preventDefault: true,
    enableOnFormTags: true,
  });
  useHotkeys('f4', () => openSearch('all'), { preventDefault: true, enableOnFormTags: true });

  const sendAndNotify = () => {
    send();
    if (slideLines.length > 0) {
      notifications.show({ message: `На екрані: ${reference}`, color: 'green', autoClose: 1500 });
    }
  };

  const blankScreen = () => {
    publishSlide({ lines: slideLines, reference, blank: true, visible: true });
    setLive(false);
    notifications.show({ message: 'Екран затемнено', color: 'gray', autoClose: 1500 });
  };

  const openPresenter = async () => {
    const win = await openPresenterWindow();
    notifications.show(
      win
        ? { message: 'Вікно показу відкрито', color: 'blue', autoClose: 1500 }
        : { message: 'Не вдалося відкрити вікно (перевірте блокувальник)', color: 'red' },
    );
  };

  return (
    <>
      <AppShell
        header={{ height: 56 }}
        navbar={{ width: 300, breakpoint: 'sm' }}
        aside={{ width: 380, breakpoint: 'md' }}
        padding={0}
      >
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Title order={5}>VerseOrchestrator</Title>
              <MultiSelect
                w={300}
                size="sm"
                placeholder="Переклади"
                data={translations.map((t) => ({
                  value: String(t.id),
                  label: `${t.abbr}${t.language ? ` · ${t.language}` : ''}`,
                }))}
                value={selectedIds.map(String)}
                onChange={(vals) => setTranslations(vals.map(Number))}
                searchable
                clearable
                maxValues={5}
              />
              <Tooltip label="Пошук — F3 поточний, F4 усі, Ctrl+F">
                <ActionIcon variant="default" size="lg" onClick={() => openSearch('current')}>
                  <IconSearch size={18} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Button
                variant="light"
                size="sm"
                leftSection={<IconScreenShare size={18} />}
                onClick={() => void openPresenter()}
              >
                Показ
              </Button>
              <Button
                color="green"
                size="sm"
                leftSection={<IconDeviceTv size={18} />}
                disabled={slideLines.length === 0}
                onClick={sendAndNotify}
              >
                На екран
              </Button>
              <Button
                variant="default"
                size="sm"
                leftSection={<IconSquareOff size={18} />}
                onClick={blankScreen}
              >
                Затемнити
              </Button>
              <Tooltip label="Тема">
                <ActionIcon variant="default" size="lg" onClick={() => toggleColorScheme()}>
                  {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoonStars size={18} />}
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar>
          <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box p="xs" pb={4}>
              <TextInput
                size="xs"
                placeholder="Фільтр книг…"
                value={bookFilter}
                onChange={(e) => setBookFilter(e.currentTarget.value)}
                leftSection={<IconSearch size={14} />}
              />
            </Box>
            <Box style={{ flex: 1, minHeight: 0, padding: '0 8px' }}>
              <VirtualList
                items={filteredBooks}
                getKey={(b) => b.bookNumber}
                isSelected={(b) => b.bookNumber === bookNumber}
                onSelect={(b) => selectBook(b.bookNumber)}
                renderRow={(b) => b.longName || b.shortName}
                estimateSize={30}
                empty={primaryId == null ? 'Оберіть переклад' : 'Немає книг'}
              />
            </Box>
            <Divider />
            <Text size="xs" c="dimmed" px="sm" py={6}>
              Розділи {currentBook ? `· ${currentBook.longName || currentBook.shortName}` : ''}
            </Text>
            <Box style={{ height: 200, padding: '0 8px 8px' }}>
              <VirtualList
                items={chapters}
                getKey={(c) => c}
                isSelected={(c) => c === chapter}
                onSelect={(c) => selectChapter(c)}
                renderRow={(c) => `Розділ ${c}`}
                estimateSize={28}
                empty={bookNumber == null ? 'Оберіть книгу' : ''}
              />
            </Box>
          </Box>
        </AppShell.Navbar>

        <AppShell.Main>
          <Box style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
            <SearchPanel
              open={searchOpen}
              onClose={() => setSearchOpen(false)}
              primaryId={primaryId}
              scope={searchScope}
              onScopeChange={setSearchScope}
              onPick={jumpTo}
            />
            <Group justify="space-between" px="md" py="xs">
              <Text fw={600} size="sm">
                {currentBook
                  ? `${currentBook.longName} ${chapter ?? ''}`
                  : 'Оберіть книгу та розділ'}
              </Text>
              {selectedVerses.length > 0 && <Badge variant="light">{reference}</Badge>}
            </Group>
            <Divider />
            <ScrollArea style={{ flex: 1 }} px="md" py="xs">
              <Stack gap={2}>
                {primaryVerses.map((v) => (
                  <div
                    key={v.verse}
                    className="vo-verse-item"
                    role="button"
                    tabIndex={0}
                    data-selected={selectedVerses.includes(v.verse) ? 'true' : undefined}
                    onClick={(e) =>
                      e.ctrlKey || e.metaKey || e.shiftKey
                        ? toggleVerse(v.verse)
                        : setSelectedVerses([v.verse])
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (e.ctrlKey || e.metaKey || e.shiftKey) toggleVerse(v.verse);
                        else setSelectedVerses([v.verse]);
                      }
                    }}
                  >
                    <Text size="md">
                      <Text span fw={700} c="blue" mr={8}>
                        {v.verse}
                      </Text>
                      {v.text}
                    </Text>
                  </div>
                ))}
                {primaryVerses.length === 0 && (
                  <Text c="dimmed" size="sm" p="sm">
                    {chapter == null ? 'Оберіть розділ зліва.' : 'Немає віршів.'}
                  </Text>
                )}
              </Stack>
            </ScrollArea>
          </Box>
        </AppShell.Main>

        <AppShell.Aside>
          <Box style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
            <Group justify="space-between" px="md" py="xs">
              <Text fw={600} size="sm">
                Прев'ю екрана
              </Text>
              {live && <Badge color="green">Наживо</Badge>}
            </Group>
            <Divider />
            <ScrollArea style={{ flex: 1 }} p="md">
              <Text size="xs" c="dimmed" mb="sm">
                {reference || 'Оберіть вірші у списку'}
              </Text>
              <Stack gap="md">
                {slideLines.map((line, i) => (
                  <div key={i} dir={line.rtl ? 'rtl' : 'ltr'}>
                    <Badge size="xs" variant="light" mb={4}>
                      {line.translationAbbr}
                    </Badge>
                    <Text size="sm">{line.text}</Text>
                  </div>
                ))}
              </Stack>
            </ScrollArea>
            <Divider />
            <Group p="sm" grow>
              <Button color="green" disabled={slideLines.length === 0} onClick={sendAndNotify}>
                На екран
              </Button>
              <Button variant="default" onClick={blankScreen}>
                Затемнити
              </Button>
            </Group>
          </Box>
        </AppShell.Aside>
      </AppShell>
    </>
  );
}

function formatReference(book: Book | null, chapter: number | null, verses: number[]): string {
  if (!book || chapter == null || verses.length === 0) return '';
  const min = verses[0];
  const max = verses[verses.length - 1];
  const range = min === max ? `${min}` : `${min}-${max}`;
  return `${book.longName || book.shortName} ${chapter}:${range}`;
}
