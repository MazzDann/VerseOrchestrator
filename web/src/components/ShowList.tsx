import { useMemo, useRef, type MouseEvent, type ReactNode } from 'react';
import { Box, Button, FileButton, Group, ScrollArea, Tabs } from '@mantine/core';
import {
  IconAlignLeft,
  IconBookmark,
  IconDownload,
  IconList,
  IconUpload,
} from '@tabler/icons-react';
import { type RefItem } from '../settingsStore';
import { RefList } from './RefList';
import { tr, useLang } from '../i18n';

export type ShowTab = 'order' | 'saved' | 'text';

interface Props {
  tab: ShowTab;
  onTab: (tab: ShowTab) => void;
  /** «Показ»: the running order (PlaylistPanel) and how many items it has */
  order: ReactNode;
  orderCount: number;
  /** «Збережене»: the bookmarks — pick goes there, «+» adds to the running order */
  saved: {
    items: RefItem[];
    onPick: (item: RefItem) => void;
    onAdd: (item: RefItem) => void;
    onRemove: (item: RefItem) => void;
    onExport: () => void;
    onImport: (file: File | null) => void;
  };
  /** «Текст»: the slide's lines per translation (what stood under the monitors before) */
  text: ReactNode;
}

/**
 * Under the monitors (1.8.12-beta.6, F1005-06 — the author's call: what comes next in sight, where
 * there was room): «Показ» — the running order, «Збережене» — the bookmarks (they left the left
 * column), «Текст» — the slide's text. In the right column below the monitors, below the centre
 * beside them.
 */
/** A mouse click (detail > 0; a key's click has 0) leaves the focus nowhere. */
const letGo = (e: MouseEvent<HTMLButtonElement>) => {
  if (e.detail > 0) e.currentTarget.blur();
};

export function ShowList({ tab, onTab, order, orderCount, saved, text }: Props) {
  useLang();
  // the bookmarks' handlers stay the same functions, so the memo'd list skips a verse step
  const latest = useRef(saved);
  latest.current = saved;
  const handlers = useMemo(
    () => ({
      onPick: (it: RefItem) => latest.current.onPick(it),
      onAdd: (it: RefItem) => latest.current.onAdd(it),
      onRemove: (it: RefItem) => latest.current.onRemove(it),
    }),
    [],
  );
  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Tabs value={tab} onChange={(v) => v && onTab(v as ShowTab)} variant="default">
        {/* a tab clicked with the mouse lets the focus go: Mantine's Tabs take ← → for themselves
            and stop them, and the arrows step the show (review, 1.8.12-beta.6) */}
        <Tabs.List grow>
          <Tabs.Tab value="order" leftSection={<IconList size={14} />} onClick={letGo}>
            {tr('Показ · {n}', { n: orderCount })}
          </Tabs.Tab>
          <Tabs.Tab value="saved" leftSection={<IconBookmark size={14} />} onClick={letGo}>
            {tr('Збережене')}
          </Tabs.Tab>
          <Tabs.Tab value="text" leftSection={<IconAlignLeft size={14} />} onClick={letGo}>
            {tr('Текст')}
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* kept mounted: a half-typed program name and the open «Програми» survive a tab switch */}
        <Box
          style={{
            flex: 1,
            minHeight: 0,
            display: tab === 'order' ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
          {order}
        </Box>
        {tab === 'saved' && (
          <>
            <Group justify="flex-end" gap={4} px="xs" py={4} wrap="nowrap">
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<IconDownload size={12} />}
                disabled={saved.items.length === 0}
                onClick={saved.onExport}
              >
                {tr('Експорт')}
              </Button>
              <FileButton accept="application/json" onChange={saved.onImport}>
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
            </Group>
            <ScrollArea style={{ flex: 1 }} scrollbars="y" className="vo-scroll-rows">
              <RefList
                items={saved.items}
                {...handlers}
                empty={tr('Збережіть вірш кнопкою-закладкою над прев’ю')}
              />
            </ScrollArea>
          </>
        )}
        {tab === 'text' && (
          <ScrollArea style={{ flex: 1 }} scrollbars="y" px="md" pt="sm">
            {text}
          </ScrollArea>
        )}
      </Box>
    </Box>
  );
}
