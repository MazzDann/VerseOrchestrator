import { type RefObject } from 'react';
import {
  Box,
  Button,
  Divider,
  FileButton,
  Group,
  ScrollArea,
  Tabs,
  TextInput,
} from '@mantine/core';
import {
  IconBookmark,
  IconDownload,
  IconHistory,
  IconSearch,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { type Book, type Translation } from '../../api';
import { type PanelLayout, type RefItem } from '../../settingsStore';
import { TranslationPicker } from '../../components/TranslationPicker';
import { VirtualList } from '../../components/VirtualList';
import { RefList } from '../../components/RefList';
import { ResizeHandle } from '../../components/ResizeHandle';
import { type LibraryGap } from '../../components/NoLibrary';
import { tr, useLang } from '../../i18n';
import type { usePanelResize } from './usePanelResize';

type PanelResize = ReturnType<typeof usePanelResize>;

/**
 * The navigation column: the translations, the book filter and the books, «Історія» and
 * «Збережене» (with the bookmarks' export and import).
 */
export function ControlNavbar({
  panelResize,
  translations,
  selectedIds,
  setTranslations,
  makePrimary,
  bookFilter,
  setBookFilter,
  filteredBooks,
  bookNumber,
  pickBook,
  libraryGap,
  primaryId,
  sidebarTab,
  setSidebarTab,
  recentResize,
  history,
  clearHistory,
  bookmarks,
  exportBookmarks,
  importBookmarksFile,
  recentBoxRef,
  layout,
  jumpTo,
  removeHistory,
  toggleBookmark,
}: {
  panelResize: PanelResize['panelResize'];
  translations: Translation[];
  selectedIds: number[];
  setTranslations: (ids: number[]) => void;
  makePrimary: (id: number) => void;
  bookFilter: string;
  setBookFilter: (filter: string) => void;
  filteredBooks: Book[];
  bookNumber: number | null;
  pickBook: (bn: number) => void;
  libraryGap: LibraryGap | null;
  primaryId: number | null;
  sidebarTab: string | null;
  setSidebarTab: (tab: string | null) => void;
  recentResize: PanelResize['recentResize'];
  history: RefItem[];
  clearHistory: () => void;
  bookmarks: RefItem[];
  exportBookmarks: () => void;
  importBookmarksFile: (file: File | null) => Promise<void>;
  recentBoxRef: RefObject<HTMLDivElement>;
  layout: PanelLayout;
  jumpTo: (item: RefItem) => void;
  removeHistory: (item: RefItem) => void;
  toggleBookmark: (item: RefItem) => void;
}) {
  useLang();
  return (
    <>
      <Box visibleFrom="sm">
        <ResizeHandle
          axis="x"
          edge="right"
          label={tr('Ширина бічної панелі')}
          {...panelResize('navbar')}
        />
      </Box>
      {/* a short window (Safari's 800×600 in the Mac test) squeezed the books to nothing and
          their hint ran over the history tabs: the books keep a few rows, the rest scrolls */}
      <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
        <TranslationPicker
          translations={translations}
          selectedIds={selectedIds}
          onChange={setTranslations}
          onMakePrimary={makePrimary}
        />
        <Divider />
        <Box p="xs" pb={4}>
          <TextInput
            size="xs"
            placeholder={tr('Фільтр книг…')}
            value={bookFilter}
            onChange={(e) => setBookFilter(e.currentTarget.value)}
            leftSection={<IconSearch size={14} />}
          />
        </Box>
        <Box style={{ flex: 1, minHeight: BOOKS_MIN_HEIGHT, padding: '0 8px' }}>
          <VirtualList
            items={filteredBooks}
            getKey={(b) => b.bookNumber}
            isSelected={(b) => b.bookNumber === bookNumber}
            onSelect={(b) => pickBook(b.bookNumber)}
            renderRow={(b) => b.longName || b.shortName}
            estimateSize={30}
            empty={
              libraryGap
                ? tr('Перекладів ще немає')
                : primaryId == null
                  ? tr('Позначте переклад угорі, щоб побачити його книги')
                  : bookFilter.trim()
                    ? tr('Немає книг, що збігаються з «{filter}»', {
                        filter: bookFilter.trim(),
                      })
                    : tr('У цьому перекладі немає книг')
            }
          />
        </Box>
        <Divider />
        <Tabs
          value={sidebarTab}
          onChange={setSidebarTab}
          variant="default"
          style={{ position: 'relative' }}
        >
          <ResizeHandle axis="y" edge="top" label={tr('Висота історії')} {...recentResize} />
          <Tabs.List grow>
            <Tabs.Tab value="history" leftSection={<IconHistory size={14} />}>
              {tr('Історія')}
            </Tabs.Tab>
            <Tabs.Tab value="saved" leftSection={<IconBookmark size={14} />}>
              {tr('Збережене')}
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
                {tr('Очистити')}
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
                  {tr('Експорт')}
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
                      {tr('Імпорт')}
                    </Button>
                  )}
                </FileButton>
              </>
            )}
          </Group>
          <Box ref={recentBoxRef} style={{ height: layout.recentHeight }}>
            <ScrollArea h="100%" scrollbars="y" className="vo-scroll-rows">
              <Tabs.Panel value="history">
                <RefList
                  items={history}
                  onPick={jumpTo}
                  onRemove={removeHistory}
                  empty={tr('Тут з’являтимуться місця, які ви відкривали')}
                />
              </Tabs.Panel>
              <Tabs.Panel value="saved">
                <RefList
                  items={bookmarks}
                  onPick={jumpTo}
                  onRemove={(it) => toggleBookmark(it)}
                  empty={tr('Збережіть вірш кнопкою-закладкою над прев’ю')}
                />
              </Tabs.Panel>
            </ScrollArea>
          </Box>
        </Tabs>
      </Box>
    </>
  );
}

/** The book list keeps about four rows however short the window (0.6.26). */
const BOOKS_MIN_HEIGHT = 120;
