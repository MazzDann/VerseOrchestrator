import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActionIcon, Box, Button, Group, Loader, Text, TextInput, Tooltip } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  IconFileText,
  IconFilePlus,
  IconFolderOpen,
  IconPlaylistAdd,
  IconRefresh,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { normalizeForSearch } from '@vo/shared';
import { api, type DocUnit, type DocumentDetail } from '../api';
import type { SlideSource } from '../presenterBus';
import { PRIORITY, useCommandHandler, type Outcome } from '../lib/commands';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { tr, useLang } from '../i18n';
import { stepDirection } from '../hotkeys';
import { inOverlay, isResizeKey, isTextEntry } from '../lib/keyScroll';
import { noticeOnce } from '../lib/noticeOnce';
import { useSettings } from '../settingsStore';
import { importDocuments, refreshDocuments, useDocOpen } from '../lib/documents';

interface Props {
  open: boolean;
  /** the left column's slot: the search, the buttons and the list of documents */
  listSlot: HTMLElement | null;
  /** put a unit on screen */
  onProjectUnit: (text: string, reference: string, source: SlideSource) => void;
  docId: number | null;
  onDocIdChange: (id: number | null) => void;
  activeUnit: number | null;
  onActiveUnitChange: (unit: number | null) => void;
  onAddToPlaylist?: (doc: { docId: number; file: string; label: string }) => void;
  /** the palette or a menu owns the keys */
  keysPaused?: boolean;
  /** «Далі» after the last unit: an empty slide, the background stays (as after a song) */
  onDocEnd?: () => Outcome;
  /** past «Кінець» or before the first unit: the running order's next / previous item, or null */
  onPastEnd?: (dir: 1 | -1, docId: number, held?: boolean) => Outcome | null;
}

/** The folder part of a document's path («серія/»), shown dimmed beside its title. */
const folderOf = (file: string) => (file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '');

/**
 * «Документи» (1.17.0-beta.1): Word, Markdown and text files from the documents folder — a sermon,
 * a lecture, a report — shown one paragraph at a time, the way a song is shown a stanza at a time.
 * The list on the left (its search, «Додати…», the folder), the open document in the centre: its
 * headings stand over their paragraphs; a click or Enter puts one on screen, ←/→ and «Далі» walk them.
 */
export function DocumentsPanel({
  open,
  listSlot,
  onProjectUnit,
  docId,
  onDocIdChange,
  activeUnit,
  onActiveUnitChange,
  onAddToPlaylist,
  keysPaused,
  onDocEnd,
  onPastEnd,
}: Props) {
  useLang();
  const [query, setQuery] = useState('');
  const serverAvailable = useServer((s) => s.available);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  /** the last deleted document, with «Скасувати», until the panel closes */
  const [deleted, setDeleted] = useState<{ title: string; trashed: string } | null>(null);

  const listQuery = useQuery({ queryKey: ['documents'], queryFn: api.documents, enabled: open });
  const docQuery = useQuery({
    queryKey: ['document', docId],
    queryFn: () => api.document(docId!),
    enabled: open && docId != null,
  });
  // a document an import or a drop asks to open
  const askedOpen = useDocOpen((s) => s.id);
  useEffect(() => {
    if (askedOpen == null) return;
    onDocIdChange(askedOpen);
    useDocOpen.getState().open(null);
  }, [askedOpen, onDocIdChange]);
  useEffect(() => {
    if (!open) setDeleted(null);
  }, [open]);

  const docs = useMemo(() => {
    const all = listQuery.data ?? [];
    const q = normalizeForSearch(query.trim());
    return q ? all.filter((d) => normalizeForSearch(d.file).includes(q)) : all;
  }, [listQuery.data, query]);

  const doc: DocumentDetail | undefined = docQuery.data;
  // the file read again with fewer units (the folder is watched): a mark past its end goes, or
  // «Далі» would take it for «Кінець» and leave the document
  const count = doc?.body.length;
  const seenCount = useRef<{ id: number; count: number } | null>(null);
  useEffect(() => {
    if (!doc || count === undefined) return;
    const seen = seenCount.current;
    seenCount.current = { id: doc.id, count };
    if (seen?.id === doc.id && seen.count !== count && activeUnit != null && activeUnit >= count)
      onActiveUnitChange(null);
  }, [doc, count, activeUnit, onActiveUnitChange]);

  const showUnit = useCallback(
    (idx: number) => {
      const d = docQuery.data;
      const u = d?.body[idx];
      if (!d || !u) return;
      onActiveUnitChange(idx);
      onProjectUnit(u.text, d.title, { kind: 'doc', docId: d.id, unit: idx, total: d.body.length });
    },
    [docQuery.data, onActiveUnitChange, onProjectUnit],
  );

  const stepUnit = useCallback(
    /** `held`: a held key stops at the last unit; «Кінець» and the next item take a new press */
    (dir: number, held = false): Outcome => {
      const d = docQuery.data;
      if (!d || d.body.length === 0) return { ok: false, reason: tr('Документ ще завантажується') };
      const count = d.body.length;
      const cur = activeUnit ?? -1;
      const past = (to: 1 | -1) => (onPastEnd ? onPastEnd(to, d.id, held) : null);
      if (dir > 0 && activeUnit != null && cur >= count - 1) {
        if (cur >= count) return past(1) ?? { ok: false, reason: tr('Кінець документа') };
        if (!onDocEnd || held) return { ok: false, reason: tr('Це останній абзац') };
        const done = onDocEnd();
        if (done.ok) onActiveUnitChange(count);
        return done;
      }
      const idx = Math.max(0, Math.min(count - 1, cur + dir));
      if (activeUnit != null && idx === cur) {
        if (dir < 0) {
          const o = past(-1);
          if (o) return o;
        }
        return { ok: false, reason: dir > 0 ? tr('Це останній абзац') : tr('Це перший абзац') };
      }
      showUnit(idx);
      return { ok: true };
    },
    [docQuery.data, activeUnit, onActiveUnitChange, onDocEnd, onPastEnd, showUnit],
  );

  // While a document is open, the arrows / PageUp-PageDown and «Далі / Назад» walk its units
  // (capture phase: the verses behind don't step too) — as a song's stanzas
  useEffect(() => {
    if (!open || docId == null || keysPaused) return;
    const onKey = (e: KeyboardEvent) => {
      if (isResizeKey(e) || inOverlay(e.target) || isTextEntry(e.target)) return;
      if (!docQuery.data || docQuery.data.body.length === 0) return;
      const dir = stepDirection(e, useSettings.getState().keymap);
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation();
      const o = stepUnit(dir, e.repeat);
      if (!o.ok && o.reason) noticeOnce('doc-edge', o.reason, 2000);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, docId, keysPaused, stepUnit, docQuery.data]);

  // an output window's clicker keys and the remotes: an open document owns «Далі / Назад»
  useCommandHandler(
    (cmd, _source, args) =>
      cmd === 'next' ? stepUnit(1, args.held) : cmd === 'prev' ? stepUnit(-1, args.held) : null,
    PRIORITY.song,
    open && docId != null,
  );

  // the units' list: long documents are virtualized, rows measured (a paragraph is several lines)
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = doc ? doc.body.length + (onDocEnd ? 1 : 0) : 0;
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });
  // the unit on screen stays in sight while «Далі» walks the document
  useEffect(() => {
    if (activeUnit != null && activeUnit < rows)
      virtualizer.scrollToIndex(activeUnit, { align: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnit, rows]);

  if (!open) return null;
  const noServer = serverAvailable === false;

  const add = async (files: File[]) => {
    if (files.length === 0) return;
    setAdding(true);
    try {
      const last = await importDocuments(files, queryClient);
      if (last != null) onDocIdChange(last);
    } finally {
      setAdding(false);
    }
  };
  const rescan = async () => {
    setRescanning(true);
    try {
      const r = await api.rescanDocuments();
      await refreshDocuments(queryClient);
      notifications.show({
        message:
          r.failed.length > 0
            ? tr('Не вдалося прочитати: {names}', { names: r.failed.slice(0, 3).join(', ') })
            : tr('Документи перечитано з папки'),
        color: r.failed.length > 0 ? 'orange' : 'green',
        autoClose: 2500,
      });
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    } finally {
      setRescanning(false);
    }
  };
  const remove = async () => {
    if (!doc) return;
    try {
      const { trashed } = await api.deleteDocument(doc.id);
      setDeleted({ title: doc.title, trashed });
      onDocIdChange(null);
      await refreshDocuments(queryClient);
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    }
  };
  const undoDelete = async () => {
    if (!deleted) return;
    try {
      await api.restoreDocument(deleted.trashed);
      setDeleted(null);
      await refreshDocuments(queryClient);
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    }
  };

  const serverTip = (label: string) => (noServer ? tr(NEEDS_SERVER) : label);
  const list = (
    <Box p="xs" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <TextInput
        size="sm"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder={tr('Документ: назва')}
        leftSection={<IconSearch size={16} />}
        rightSection={listQuery.isFetching ? <Loader size="xs" /> : null}
      />
      <Group gap={4} mt="xs" wrap="nowrap">
        <Button
          size="xs"
          variant="light"
          leftSection={<IconFilePlus size={14} />}
          loading={adding}
          disabled={noServer}
          title={serverTip(tr('Додати файли .docx, .md або .txt'))}
          onClick={() => fileInput.current?.click()}
        >
          {tr('Додати…')}
        </Button>
        <Tooltip label={serverTip(tr('Відкрити папку документів'))} withArrow>
          <ActionIcon
            variant="subtle"
            disabled={noServer}
            aria-label={tr('Відкрити папку документів')}
            onClick={() =>
              void api
                .openDocumentsFolder()
                .catch((e: Error) => notifications.show({ message: tr(e.message), color: 'red' }))
            }
          >
            <IconFolderOpen size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={serverTip(tr('Перечитати папку документів'))} withArrow>
          <ActionIcon
            variant="subtle"
            disabled={noServer}
            loading={rescanning}
            aria-label={tr('Перечитати папку документів')}
            onClick={() => void rescan()}
          >
            <IconRefresh size={16} />
          </ActionIcon>
        </Tooltip>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept=".docx,.md,.markdown,.txt"
          onChange={(e) => {
            const files = [...(e.currentTarget.files ?? [])];
            e.currentTarget.value = '';
            void add(files);
          }}
        />
      </Group>
      {deleted && (
        <Group gap="xs" mt="xs" wrap="nowrap" justify="space-between">
          <Text size="xs" c="dimmed" truncate>
            {tr('Видалено: {name}', { name: deleted.title })}
          </Text>
          <Button size="compact-xs" variant="light" onClick={() => void undoDelete()}>
            {tr('Скасувати')}
          </Button>
        </Group>
      )}
      <Box mt="xs" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} className="vo-scroll-rows">
        {docs.map((d) => (
          <Box
            key={d.id}
            className="vo-list-item"
            role="button"
            tabIndex={0}
            data-selected={d.id === docId ? 'true' : undefined}
            onClick={() => onDocIdChange(d.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onDocIdChange(d.id);
              }
            }}
          >
            <Group gap={6} wrap="nowrap">
              <IconFileText size={14} stroke={1.5} style={{ flexShrink: 0 }} />
              <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                {d.title}
                {folderOf(d.file) && (
                  <Text span size="xs" c="dimmed">
                    {' · '}
                    {folderOf(d.file)}
                  </Text>
                )}
              </Text>
            </Group>
          </Box>
        ))}
        {query.trim() && docs.length === 0 && listQuery.isSuccess && (
          <Text size="sm" c="dimmed" p="sm">
            {tr('Нічого не знайдено за «{q}»', { q: query.trim() })}
          </Text>
        )}
        {!query.trim() && docs.length === 0 && listQuery.isSuccess && (
          <Text size="sm" c="dimmed" p="sm">
            {tr(
              'Документів ще немає. Натисніть «Додати…» або перетягніть файли .docx, .md чи .txt у вікно; можна й покласти їх у папку документів (кнопка з текою).',
            )}
          </Text>
        )}
      </Box>
    </Box>
  );

  const unitRow = (u: DocUnit, i: number) => (
    <div
      className="vo-verse-item vo-doc-row"
      role="button"
      tabIndex={0}
      data-kind={u.kind}
      data-selected={activeUnit === i ? 'true' : undefined}
      onClick={() => showUnit(i)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showUnit(i);
        }
      }}
    >
      {/* every unit numbered, headings too: «Сцена» says «абзац 3 з 8» by the same count */}
      <span className="vo-verse-num">{i + 1}</span>
      <Text
        size="sm"
        fw={u.kind === 'heading' ? 600 : undefined}
        fs={u.kind === 'quote' ? 'italic' : undefined}
        style={{
          whiteSpace: 'pre-line',
          paddingLeft: u.kind === 'item' ? `${0.75 + u.level * 0.75}em` : undefined,
        }}
        lineClamp={activeUnit === i ? undefined : 4}
      >
        {u.kind === 'item' ? `• ${u.text}` : u.text}
      </Text>
    </div>
  );
  // the «Кінець» row: the empty slide after the last unit, by click or Enter as well
  const endDoc = () => {
    if (!doc || !onDocEnd) return;
    const done = onDocEnd();
    if (done.ok) onActiveUnitChange(doc.body.length);
    else if (done.reason)
      notifications.show({ message: done.reason, color: 'gray', autoClose: 2000 });
  };
  const endRow = (
    <div
      className="vo-verse-item vo-doc-row"
      role="button"
      tabIndex={0}
      data-selected={doc && activeUnit === doc.body.length ? 'true' : undefined}
      onClick={endDoc}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          endDoc();
        }
      }}
    >
      <span className="vo-verse-num">{tr('Кінець')}</span>
      <Text size="sm" c="dimmed">
        {tr('Порожній слайд: текст сховано, фон лишається')}
      </Text>
    </div>
  );

  return (
    <>
      {listSlot && createPortal(list, listSlot)}
      <div className="vo-workspace">
        {doc ? (
          <>
            <Group justify="space-between" wrap="nowrap">
              <Text fw={600} size="sm" truncate>
                {doc.title}
              </Text>
              <Group gap={4} wrap="nowrap">
                {onAddToPlaylist && (
                  <Tooltip label={tr('Додати у показ')} withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="brand"
                      aria-label={tr('Додати у показ')}
                      onClick={() =>
                        onAddToPlaylist({ docId: doc.id, file: doc.file, label: doc.title })
                      }
                    >
                      <IconPlaylistAdd size={18} />
                    </ActionIcon>
                  </Tooltip>
                )}
                <Tooltip
                  label={serverTip(tr('Видалити документ (файл — у кошик папки)'))}
                  withArrow
                >
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    disabled={noServer}
                    aria-label={tr('Видалити документ')}
                    onClick={() => void remove()}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((row) => (
                  <div
                    key={row.key}
                    data-index={row.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${row.start}px)`,
                      paddingBottom: 4,
                    }}
                  >
                    {row.index < doc.body.length ? unitRow(doc.body[row.index], row.index) : endRow}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : docId != null && docQuery.isLoading ? (
          <Loader size="sm" />
        ) : (
          <Text size="sm" c="dimmed" p="sm">
            {tr('Виберіть документ ліворуч — його абзаци стануть тут, як строфи пісні.')}
          </Text>
        )}
      </div>
    </>
  );
}
