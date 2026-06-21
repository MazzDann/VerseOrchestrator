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
  Tabs,
  FileButton,
  Burger,
  useMantineColorScheme,
  useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
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
  IconBookmark,
  IconHistory,
  IconTrash,
  IconDownload,
  IconUpload,
} from '@tabler/icons-react';

import { api, type Book, type Verse } from '../api';
import { useStore } from '../store';
import { useSettings, refKey, type RefItem } from '../settingsStore';
import { publishSlide, type Slide, type SlideLine, type SlideStyle } from '../presenterBus';
import { openPresenterWindow } from '../openPresenter';
import { SearchPanel, type SearchScope } from '../components/SearchPanel';
import { StudyPanels, type AsideMode } from '../components/StudyPanels';
import { RefList } from '../components/RefList';
import { VirtualList } from '../components/VirtualList';

const EMPTY_ARRAY: never[] = [];
type Jumpable = { translationId: number; bookNumber: number; chapter: number; verse: number };

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

  const appearance = useSettings((s) => s.appearance);
  const history = useSettings((s) => s.history);
  const bookmarks = useSettings((s) => s.bookmarks);
  const pushHistory = useSettings((s) => s.pushHistory);
  const removeHistory = useSettings((s) => s.removeHistory);
  const clearHistory = useSettings((s) => s.clearHistory);
  const toggleBookmark = useSettings((s) => s.toggleBookmark);
  const importBookmarks = useSettings((s) => s.importBookmarks);
  const panelPlacement = useSettings((s) => s.panelPlacement);

  const primaryId = selectedIds[0] ?? null;
  const [bookFilter, setBookFilter] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('current');
  const [searchOpen, setSearchOpen] = useState(false);
  const [asideMode, setAsideMode] = useState<AsideMode>('preview');
  const [sidebarTab, setSidebarTab] = useState<string | null>('history');
  const [navOpened, { toggle: toggleNav }] = useDisclosure(false);
  const [asideOpened, { toggle: toggleAside }] = useDisclosure(false);
  const [pinnedPreview, { toggle: togglePin }] = useDisclosure(false);
  // When navigating via search/history/concordance, scroll this verse into view.
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);

  const jumpTo = (r: Jumpable) => {
    if (selectedIds.length === 0) setTranslations([r.translationId]);
    selectBook(r.bookNumber);
    selectChapter(r.chapter);
    setSelectedVerses([r.verse]);
    setScrollTarget(r.verse);
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
  const chapters = chaptersQuery.data ?? EMPTY_ARRAY;

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
  const primaryVerses = useMemo(
    () => (primaryId != null ? (versesByTranslation.get(primaryId) ?? []) : []),
    [primaryId, versesByTranslation],
  );

  const currentBook = books.find((b) => b.bookNumber === bookNumber) ?? null;
  const reference = useMemo(
    () => formatReference(currentBook, chapter, selectedVerses),
    [currentBook, chapter, selectedVerses],
  );
  const referenceShort = useMemo(
    () => formatReference(currentBook, chapter, selectedVerses, true),
    [currentBook, chapter, selectedVerses],
  );
  const primaryHasStrong = translations.find((t) => t.id === primaryId)?.hasStrong ?? false;
  const selectedPrimaryVerses = useMemo(
    () => primaryVerses.filter((v) => selectedVerses.includes(v.verse)),
    [primaryVerses, selectedVerses],
  );

  // Hide the Strong tab (and leave it) when the primary translation has no Strong numbers.
  useEffect(() => {
    if (asideMode === 'strong' && !primaryHasStrong) setAsideMode('preview');
  }, [asideMode, primaryHasStrong]);

  const slideLines = useMemo<SlideLine[]>(() => {
    if (selectedVerses.length === 0) return [];
    return selectedIds
      .map((id) => {
        const t = translations.find((x) => x.id === id);
        const verses = versesByTranslation.get(id) ?? [];
        const text = verses
          .filter((v) => selectedVerses.includes(v.verse))
          .map((v) => `${appearance.showVerseNumbers ? `${v.verse} ` : ''}${(v.text ?? '').trim()}`)
          .filter((s) => s.trim())
          .join('  ');
        if (!text.trim()) return null;
        return { translationAbbr: t?.abbr ?? '', text, rtl: !!t?.rtl } as SlideLine;
      })
      .filter((x): x is SlideLine => x !== null);
  }, [selectedIds, selectedVerses, versesByTranslation, translations, appearance.showVerseNumbers]);

  const slideStyle: SlideStyle = useMemo(
    () => ({
      font: appearance.scriptureFont,
      color: appearance.textColor,
      align: appearance.textAlign,
      bgColor: appearance.bgColor,
      bgImage: appearance.bgImage,
      showVerseNumbers: appearance.showVerseNumbers,
      padTop: appearance.padTop,
      padRight: appearance.padRight,
      padBottom: appearance.padBottom,
      padLeft: appearance.padLeft,
      padUnit: appearance.padUnit,
    }),
    [appearance],
  );

  // WYSIWYG of the current selection — what would be projected.
  const previewSlide: Slide = {
    lines: slideLines,
    reference,
    blank: false,
    visible: slideLines.length > 0,
    style: slideStyle,
  };

  const send = (overrides?: Partial<Slide>) => {
    const slide: Slide = {
      lines: slideLines,
      reference,
      blank: false,
      visible: slideLines.length > 0,
      style: slideStyle,
      ...overrides,
    };
    publishSlide(slide);
    setLive(slide.visible && !slide.blank);
  };

  // Project the Strong-bearing (primary) translation only, with a "word — gloss"
  // subline. Used contextually from the Strong tab; normal navigation reverts it.
  const projectStrong = (subline: string) => {
    const t = translations.find((x) => x.id === primaryId);
    const text = selectedPrimaryVerses
      .map((v) => `${appearance.showVerseNumbers ? `${v.verse} ` : ''}${(v.text ?? '').trim()}`)
      .filter((s) => s.trim())
      .join('  ');
    if (!text.trim()) return;
    publishSlide({
      lines: [{ translationAbbr: t?.abbr ?? '', text, rtl: !!t?.rtl }],
      reference,
      blank: false,
      visible: true,
      style: slideStyle,
      subline,
    });
    setLive(true);
    notifications.show({ message: `На екрані зі Стронгом: ${reference}`, color: 'green', autoClose: 1500 });
  };

  // Republish while live when the selection, reference, or appearance changes.
  useEffect(() => {
    if (live && slideLines.length > 0) send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideLines, reference, slideStyle]);

  // After a search/history/concordance jump, scroll the target verse to centre.
  // Deferred a tick so the list (and the closing search panel) settle their layout.
  // Clear scrollTarget only inside the timeout — clearing it synchronously would
  // re-run this effect and its cleanup would cancel the pending scroll.
  useEffect(() => {
    if (scrollTarget == null || !primaryVerses.some((v) => v.verse === scrollTarget)) return;
    const verse = scrollTarget;
    const id = window.setTimeout(() => {
      // Instant, not smooth: Mantine/Radix ScrollArea's viewport ignores
      // smooth scrollIntoView (it never scrolls), instant centres reliably.
      document
        .querySelector(`.vo-verse-item[data-verse="${verse}"]`)
        ?.scrollIntoView({ block: 'center' });
      setScrollTarget(null);
    }, 60);
    return () => window.clearTimeout(id);
  }, [scrollTarget, primaryVerses]);

  // Record what was opened into history.
  useEffect(() => {
    if (
      reference &&
      primaryId != null &&
      bookNumber != null &&
      chapter != null &&
      selectedVerses.length
    ) {
      pushHistory({
        ref: reference,
        refShort: referenceShort,
        translationId: primaryId,
        bookNumber,
        chapter,
        verse: selectedVerses[0],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

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
    publishSlide({ lines: slideLines, reference, blank: true, visible: true, style: slideStyle });
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

  const exportBookmarks = () => {
    const blob = new Blob([JSON.stringify(bookmarks, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verseorchestrator-saved.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBookmarksFile = async (file: File | null) => {
    if (!file) return;
    try {
      const items = JSON.parse(await file.text());
      if (Array.isArray(items)) {
        importBookmarks(items);
        notifications.show({ message: `Імпортовано записів: ${items.length}`, color: 'green' });
      }
    } catch {
      notifications.show({ message: 'Не вдалося прочитати файл', color: 'red' });
    }
  };

  const currentRef: RefItem | null =
    reference && primaryId != null && bookNumber != null && chapter != null && selectedVerses.length
      ? {
          ref: reference,
          refShort: referenceShort,
          translationId: primaryId,
          bookNumber,
          chapter,
          verse: selectedVerses[0],
        }
      : null;
  const isSaved = currentRef ? bookmarks.some((b) => refKey(b) === refKey(currentRef)) : false;

  const renderStudyPanels = (compact: boolean) => (
    <StudyPanels
      mode={asideMode}
      setMode={setAsideMode}
      primaryHasStrong={primaryHasStrong}
      reference={reference}
      live={live}
      isSaved={isSaved}
      currentRef={currentRef}
      onToggleBookmark={toggleBookmark}
      slideLines={slideLines}
      scriptureFont={appearance.scriptureFont}
      previewSlide={previewSlide}
      selectedPrimaryVerses={selectedPrimaryVerses}
      onPickRef={jumpTo}
      onProjectStrong={projectStrong}
      onSend={sendAndNotify}
      onBlank={blankScreen}
      pinned={pinnedPreview}
      onTogglePin={togglePin}
      compact={compact}
    />
  );

  return (
    <>
      <AppShell
        header={{ height: 56 }}
        navbar={{ width: 300, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
        aside={
          panelPlacement === 'aside'
            ? { width: 380, breakpoint: 'md', collapsed: { mobile: !asideOpened } }
            : undefined
        }
        padding={0}
      >
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Burger
                opened={navOpened}
                onClick={toggleNav}
                hiddenFrom="sm"
                size="sm"
                aria-label="Навігація"
              />
              <Title order={5} visibleFrom="xs">
                VerseOrchestrator
              </Title>
              <MultiSelect
                w={280}
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
              {panelPlacement === 'aside' && (
                <Burger
                  opened={asideOpened}
                  onClick={toggleAside}
                  hiddenFrom="md"
                  size="sm"
                  aria-label="Панель показу"
                />
              )}
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
            <Tabs value={sidebarTab} onChange={setSidebarTab} variant="default">
              <Tabs.List grow>
                <Tabs.Tab value="history" leftSection={<IconHistory size={14} />}>
                  Історія
                </Tabs.Tab>
                <Tabs.Tab value="saved" leftSection={<IconBookmark size={14} />}>
                  Збережене
                </Tabs.Tab>
              </Tabs.List>
              <Group justify="flex-end" gap={4} px="xs" py={4} h={30} wrap="nowrap">
                {sidebarTab === 'history' && history.length > 0 && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    leftSection={<IconTrash size={12} />}
                    onClick={clearHistory}
                  >
                    Очистити
                  </Button>
                )}
                {sidebarTab === 'saved' && (
                  <>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      leftSection={<IconDownload size={12} />}
                      disabled={bookmarks.length === 0}
                      onClick={exportBookmarks}
                    >
                      Експорт
                    </Button>
                    <FileButton accept="application/json" onChange={importBookmarksFile}>
                      {(props) => (
                        <Button
                          {...props}
                          size="compact-xs"
                          variant="subtle"
                          color="gray"
                          leftSection={<IconUpload size={12} />}
                        >
                          Імпорт
                        </Button>
                      )}
                    </FileButton>
                  </>
                )}
              </Group>
              <Box style={{ height: 170 }}>
                <ScrollArea h={170}>
                  <Tabs.Panel value="history">
                    <RefList
                      items={history}
                      onPick={jumpTo}
                      onRemove={removeHistory}
                      empty="Поки порожньо"
                    />
                  </Tabs.Panel>
                  <Tabs.Panel value="saved">
                    <RefList
                      items={bookmarks}
                      onPick={jumpTo}
                      onRemove={(it) => toggleBookmark(it)}
                      empty="Нічого не збережено"
                    />
                  </Tabs.Panel>
                </ScrollArea>
              </Box>
            </Tabs>
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
            <Group justify="space-between" px="md" pt="xs" pb={4} wrap="nowrap">
              <Text fw={600} size="sm" truncate>
                {currentBook
                  ? `${currentBook.longName} ${chapter ?? ''}`
                  : 'Оберіть книгу та розділ'}
              </Text>
              {selectedVerses.length > 0 && <Badge variant="light">{reference}</Badge>}
            </Group>
            {chapters.length > 0 && (
              <ScrollArea.Autosize mah={88} px="md" pb="xs">
                <Group gap={6}>
                  {chapters.map((c) => (
                    <button
                      key={c}
                      className="vo-chip"
                      data-selected={c === chapter ? 'true' : undefined}
                      onClick={() => selectChapter(c)}
                    >
                      {c}
                    </button>
                  ))}
                </Group>
              </ScrollArea.Autosize>
            )}
            <Divider />
            <ScrollArea style={{ flex: 1 }} px="md" py="xs">
              <Stack gap={2}>
                {primaryVerses.map((v) => (
                  <div
                    key={v.verse}
                    className="vo-verse-item"
                    role="button"
                    tabIndex={0}
                    data-verse={v.verse}
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
                      <Text span fw={700} c="brand" mr={8}>
                        {v.verse}
                      </Text>
                      {v.text}
                    </Text>
                  </div>
                ))}
                {primaryVerses.length === 0 && (
                  <Text c="dimmed" size="sm" p="sm">
                    {chapter == null ? 'Оберіть розділ.' : 'Немає віршів.'}
                  </Text>
                )}
              </Stack>
            </ScrollArea>
            {panelPlacement === 'bottom' && (
              <>
                <Divider />
                <Box style={{ height: 340, minHeight: 0 }}>{renderStudyPanels(true)}</Box>
              </>
            )}
          </Box>
        </AppShell.Main>

        {panelPlacement === 'aside' && <AppShell.Aside>{renderStudyPanels(false)}</AppShell.Aside>}
      </AppShell>
    </>
  );
}

function formatReference(
  book: Book | null,
  chapter: number | null,
  verses: number[],
  short = false,
): string {
  if (!book || chapter == null || verses.length === 0) return '';
  const min = verses[0];
  const max = verses[verses.length - 1];
  const range = min === max ? `${min}` : `${min}-${max}`;
  const name = short ? book.shortName || book.longName : book.longName || book.shortName;
  return `${name} ${chapter}:${range}`;
}
