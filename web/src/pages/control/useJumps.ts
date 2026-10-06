import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { type QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type Book } from '../../api';
import { useStore } from '../../store';
import { useSettings } from '../../settingsStore';
import { type SearchScope } from '../../components/SearchPanel';
import { parseQuickRef, placeKey, quickKeydown } from '../../lib/quickRef';
import { chapterName } from '../../lib/chapterCross';
import { isFormField } from '../../lib/keyScroll';
import { tr } from '../../i18n';

type Jumpable = { translationId: number; bookNumber: number; chapter: number; verse: number };

/**
 * Finding the place (vo-search): a jump to a verse (search, history, concordance, «Перейти»),
 * the go-to bar, numbers typed with no field focused («3:16», the pill) and the search panel with
 * its scope. Effects E3–E5: the typed numbers' keys, a click letting go of them, their timeout.
 * `quickRef` / `quickJumpRef` are assigned during render, as they were in Control.
 */
export function useJumps({
  selectedIds,
  setTranslations,
  selectBook,
  selectChapter,
  setSelectedVerses,
  setScrollTarget,
  primaryId,
  bookNumber,
  chapter,
  currentBook,
  chapters,
  queryClient,
  setPageIndex,
  setRevealCount,
  paletteOpen,
  moreShown,
  toolOpen,
  setSearchOpen,
}: {
  selectedIds: number[];
  setTranslations: (ids: number[]) => void;
  selectBook: (bookNumber: number) => void;
  selectChapter: (chapter: number) => void;
  setSelectedVerses: (verses: number[]) => void;
  setScrollTarget: (verse: number | null) => void;
  primaryId: number | null;
  bookNumber: number | null;
  chapter: number | null;
  currentBook: Book | null;
  chapters: number[];
  queryClient: QueryClient;
  setPageIndex: Dispatch<SetStateAction<number>>;
  setRevealCount: Dispatch<SetStateAction<number>>;
  paletteOpen: boolean;
  moreShown: boolean;
  toolOpen: boolean;
  setSearchOpen: (v: boolean | ((open: boolean) => boolean)) => void;
}) {
  // one search (1.8.12-beta.4): the header's field and the results panel share the query; the
  // scope starts as the settings say (F3 / Ctrl+F — the main translation, F4 — all)
  const defaultScope = useSettings((s) => s.search.scope);
  const [searchScope, setSearchScope] = useState<SearchScope>(defaultScope);
  const [goToValue, setGoToValueState] = useState('');
  /** the header's search field (null or hidden when the header folded it away) */
  const searchFieldRef = useRef<HTMLInputElement | null>(null);
  /** the results panel's keys (↑ ↓ Enter Esc) — the field hands them over first */
  const searchKeysRef = useRef<((e: React.KeyboardEvent) => boolean) | null>(null);
  const fieldShown = () => !!searchFieldRef.current && searchFieldRef.current.offsetParent !== null;
  /**
   * The query typed: words or a reference open the results under the header; numbers alone
   * («3:16») in an open book are a place there (Enter goes, as before) — results already open
   * close, so Enter can't pick a text hit for them (review); an empty field closes them.
   */
  const setGoToValue = (value: string) => {
    setGoToValueState(value);
    const q = value.trim();
    if (q === '') {
      if (fieldShown()) setSearchOpen(false);
    } else if (parseQuickRef(q) && bookNumber != null) setSearchOpen(false);
    else if (q.length >= 2) setSearchOpen(true);
  };
  /**
   * Done with a query (a pick, a jump, Esc in the field): it goes, the results close and the scope
   * goes back to the settings' one — not on every emptying (F4, Backspace, a new word: still all).
   */
  const clearSearch = () => {
    setGoToValueState('');
    setSearchOpen(false);
    setSearchScope(useSettings.getState().search.scope);
  };

  // `focus`: hand the keyboard to the verse landed on (search, «Перейти»), so ↩ puts it on
  // screen and the arrows walk on. Mac re-check (0.6.13): after a search pick the panel
  // closed and left the focus on <body> — ↩ did nothing, only ⌘↩ (a page-wide hotkey)
  // projected. Other jumps (history, concordance, sequence, remotes) keep the focus.
  const focusJump = useRef(false);
  const jumpTo = (r: Jumpable, opts?: { focus?: boolean }) => {
    if (selectedIds.length === 0) setTranslations([r.translationId]);
    // a hit from another translation (the fallback, «Усі») in a book the main one hasn't (an NT
    // only): that translation joins, or the verses pane stays empty (review)
    else if (!selectedIds.includes(r.translationId)) {
      const books = queryClient.getQueryData<Book[]>(['books', primaryId]);
      if (books && !books.some((b) => b.bookNumber === r.bookNumber))
        setTranslations([...selectedIds, r.translationId]);
    }
    selectBook(r.bookNumber);
    selectChapter(r.chapter);
    setSelectedVerses([r.verse]);
    setScrollTarget(r.verse);
    focusJump.current = !!opts?.focus;
  };

  // Quick jump bar: resolve a reference/text query and jump to the first hit.
  const goTo = async (q: string) => {
    const query = q.trim();
    if (!query || primaryId == null) return;
    // numbers only («3:16», «16»): a place in the open book (1.4.0)
    if (parseQuickRef(query) && bookNumber != null) {
      if (await quickJump(query)) clearSearch();
      return;
    }
    try {
      // the main translation first; with nothing there, the others (the author's call, 1.8.12-beta.4)
      let res = await api.search(query, [primaryId]);
      if (res.results.length === 0) res = await api.search(query, []);
      if (res.results.length > 0) {
        jumpTo(res.results[0], { focus: true });
        clearSearch();
      } else {
        notifications.show({
          message: tr(
            '«{query}» не знайдено. Спробуйте посилання, як-от «Ів 3:16», або слово з тексту',
            {
              query,
            },
          ),
          color: 'gray',
          autoClose: 2500,
        });
      }
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося перейти: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    }
  };

  /**
   * «На екран» pressed while typing numbers (Mac check of 1.4.0): the place gone to — shown
   * once it is the selection and its verses are in (useShowJumpWhenReady, E21).
   */
  const showJump = useRef<{ key: string; timer: number } | null>(null);

  /**
   * «3:16» typed straight into the control window, or into «Перейти до посилання» (1.4.0):
   * a place in the open book — the verse (or verses) selected, its row focused, so Enter
   * puts it on screen; on screen at once while the screen follows the selection, or with
   * `show` (⌘↩ / Ctrl+Enter / «На екран» in the typed-number box).
   */
  const quickJump = async (q: string, opts?: { show?: boolean }): Promise<boolean> => {
    const r = parseQuickRef(q);
    const say = (message: string) => {
      notifications.show({ message, color: 'gray', autoClose: 2500 });
      return false;
    };
    if (!r) {
      return say(
        tr('«{query}» — не місце в книзі. Введіть вірш або розділ:вірш, як-от 3:16', { query: q }),
      );
    }
    if (primaryId == null || bookNumber == null) return say(tr('Спершу виберіть книгу'));
    const ch = r.chapter ?? chapter;
    if (ch == null) return say(tr('Спершу виберіть розділ'));
    const book = currentBook;
    if (!chapters.includes(ch)) {
      return say(tr('{book}: розділу {n} немає', { book: book?.longName ?? '', n: ch }));
    }
    const tid = primaryId;
    const bn = bookNumber;
    const verses = await queryClient
      .fetchQuery({ queryKey: ['verses', tid, bn, ch], queryFn: () => api.verses(tid, bn, ch) })
      .catch(() => []);
    const have = verses.map((v) => v.verse);
    const from = r.verse ?? Math.min(...have);
    if (!have.includes(from)) {
      return say(tr('{place}: вірша {n} немає', { place: chapterName(book, ch), n: from }));
    }
    const to = Math.min(r.verseEnd ?? from, Math.max(...have));
    const picked = have.filter((v) => v >= from && v <= to).sort((a, b) => a - b);
    if (opts?.show) {
      if (showJump.current) window.clearTimeout(showJump.current.timer);
      const wait = { key: placeKey(bn, ch, picked), timer: 0 };
      // never late: a slide that isn't ready in 3 s is not shown at some later moment — said
      // so while the place is still the selection (one left meanwhile goes quietly)
      wait.timer = window.setTimeout(() => {
        if (showJump.current !== wait) return;
        showJump.current = null;
        const now = useStore.getState();
        if (placeKey(now.bookNumber, now.chapter, now.selectedVerses) === wait.key) {
          say(tr('Текст ще не завантажився — натисніть «На екран» ще раз'));
        }
      }, 3000);
      showJump.current = wait;
    }
    if (ch !== chapter) selectChapter(ch);
    setSelectedVerses(picked);
    // from its first page and reveal step in the same render as the selection — live-follow
    // must not push it at the old page or step first (review of the Mac fix)
    setPageIndex(0);
    setRevealCount(1);
    setScrollTarget(from);
    focusJump.current = true;
    return true;
  };

  // Numbers typed where no field has the focus start a quick jump (1.4.0): the pill at the
  // bottom shows them, Enter goes, Esc (or any other key) lets go. While typing, «.» and the
  // space are separators, not «Чорний екран» or a verse's selection; Esc only cancels.
  // Mac check of 1.4.0 (lib/quickRef.ts quickKeydown): a lone Shift (before «:») keeps the box;
  // the «.» / «,» keys separate on any layout (Ukrainian: «ю» / «б»); ⌘↩ / Ctrl+Enter or «На
  // екран» goes there and shows it — they projected the old selection; a click lets go.
  const [quick, setQuick] = useState<string | null>(null);
  const quickRef = useRef<string | null>(null);
  quickRef.current = quick;
  const quickJumpRef = useRef(quickJump);
  quickJumpRef.current = quickJump;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const box = quickRef.current;
      const r = quickKeydown(box, e, {
        canStart: bookNumber != null,
        blocked: isFormField(e.target) || paletteOpen || moreShown || toolOpen,
        project: useSettings.getState().keymap.project,
      });
      if (r.box !== box) setQuick(r.box);
      if (r.go) void quickJumpRef.current(r.go.text, { show: r.go.show });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [bookNumber, paletteOpen, moreShown, toolOpen]);
  // a click lets go of the typed numbers: ⌘ / Shift + click in the verse list, then Enter,
  // belongs to the verses clicked, not to a place typed a moment ago (review of the Mac fix)
  useEffect(() => {
    const onPointer = () => {
      if (quickRef.current !== null) setQuick(null);
    };
    window.addEventListener('pointerdown', onPointer, true);
    return () => window.removeEventListener('pointerdown', onPointer, true);
  }, []);
  // forgotten halfway: gone after a few seconds without a key
  useEffect(() => {
    if (quick === null) return;
    const t = window.setTimeout(() => setQuick(null), 6000);
    return () => window.clearTimeout(t);
  }, [quick]);

  /**
   * F3 / Ctrl+F (the main translation), F4 (all), `/` (as the settings say): the cursor in the
   * header's field, its text selected; with the header folded, the panel with a field of its own.
   */
  const openSearch = (scope?: SearchScope) => {
    setSearchScope(scope ?? useSettings.getState().search.scope);
    const field = searchFieldRef.current;
    if (field && fieldShown()) {
      field.focus();
      field.select();
      if (goToValue.trim().length >= 2) setSearchOpen(true);
    } else setSearchOpen(true);
  };

  return {
    searchScope,
    setSearchScope,
    goToValue,
    setGoToValue,
    clearSearch,
    searchFieldRef,
    searchKeysRef,
    focusJump,
    jumpTo,
    goTo,
    showJump,
    quick,
    openSearch,
  };
}
