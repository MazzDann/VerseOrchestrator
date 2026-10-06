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
  const [searchScope, setSearchScope] = useState<SearchScope>('current');
  const [goToValue, setGoToValue] = useState('');

  // `focus`: hand the keyboard to the verse landed on (search, «Перейти»), so ↩ puts it on
  // screen and the arrows walk on. Mac re-check (0.6.13): after a search pick the panel
  // closed and left the focus on <body> — ↩ did nothing, only ⌘↩ (a page-wide hotkey)
  // projected. Other jumps (history, concordance, sequence, remotes) keep the focus.
  const focusJump = useRef(false);
  const jumpTo = (r: Jumpable, opts?: { focus?: boolean }) => {
    if (selectedIds.length === 0) setTranslations([r.translationId]);
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
      if (await quickJump(query)) setGoToValue('');
      return;
    }
    try {
      const res = await api.search(query, [primaryId]);
      if (res.results.length > 0) {
        jumpTo(res.results[0], { focus: true });
        setGoToValue('');
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

  const openSearch = (scope: SearchScope) => {
    setSearchScope(scope);
    setSearchOpen(true);
  };

  return {
    searchScope,
    setSearchScope,
    goToValue,
    setGoToValue,
    focusJump,
    jumpTo,
    goTo,
    showJump,
    quick,
    openSearch,
  };
}
