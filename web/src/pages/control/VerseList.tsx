import { Fragment, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ScrollArea, Stack, Text } from '@mantine/core';
import { parseRedLetter } from '@vo/shared';
import { useQuery } from '@tanstack/react-query';
import { api, type Book, type Verse } from '../../api';
import { setFor } from '../../lib/subheadingSets';
import { useSettings, type Appearance, type PanelPlacement } from '../../settingsStore';
import { type Keymap, matchesCombo } from '../../hotkeys';
import { ConcordancePanel } from '../../components/ConcordancePanel';
import { NoLibrary, type LibraryGap } from '../../components/NoLibrary';
import { type StrongPickRef } from '../../components/StrongView';
import { tr, useLang } from '../../i18n';

/**
 * The open chapter's verses (click, Space, Enter; Ctrl / ⌘ adds or takes out one verse, Shift a
 * range from the last one clicked, a drag across the rows the verses between) and the concordance
 * beside them; an empty chapter says what to do.
 */
export function VerseList({
  panelPlacement,
  verseViewport,
  primaryVerses,
  selectedVerses,
  toggleVerse,
  setSelectedVerses,
  pickRange = setSelectedVerses,
  keymap,
  projectVerseOnEnter,
  appearance,
  libraryGap,
  openAppSettings,
  versesLoading,
  currentBook,
  chapter,
  concordanceStrong,
  primaryId,
  jumpTo,
  setConcordanceStrong,
}: {
  panelPlacement: PanelPlacement;
  verseViewport: RefObject<HTMLDivElement>;
  primaryVerses: Verse[];
  selectedVerses: number[];
  toggleVerse: (verse: number) => void;
  setSelectedVerses: (verses: number[]) => void;
  /** Shift: the verses from the last one clicked to this one (1.13.0-beta.1, F1010-05b) */
  pickRange?: (verses: number[]) => void;
  keymap: Keymap;
  projectVerseOnEnter: (verseNum: number) => void;
  appearance: Appearance;
  libraryGap: LibraryGap | null;
  openAppSettings: () => void;
  versesLoading: boolean;
  currentBook: Book | null;
  chapter: number | null;
  concordanceStrong: string | null;
  primaryId: number | null;
  jumpTo: (r: StrongPickRef) => void;
  setConcordanceStrong: (strong: string | null) => void;
}) {
  useLang();
  // the chapter's section titles in the main translation (1.16.0-beta.2), by the verse they open
  const showHeadings = useSettings((x) => x.subheadings);
  const chosenSets = useSettings((x) => x.subheadingSets);
  const book = currentBook?.bookNumber ?? null;
  // or a set of them picked for the translation (1.16.0-beta.3)
  const { data: translations } = useQuery({
    queryKey: ['translations'],
    queryFn: api.translations,
    enabled: showHeadings,
  });
  // the app's 5 minutes, not forever: an early failure answers [] (review); a rebuild refetches
  const { data: sets } = useQuery({
    queryKey: ['subheading-sets'],
    queryFn: api.subheadingSets,
    enabled: showHeadings,
  });
  const primaryAbbr = translations?.find((t) => t.id === primaryId)?.abbr;
  const setAbbr = primaryAbbr != null && sets ? setFor(primaryAbbr, chosenSets, sets) : '';
  const setId = sets?.find((s) => s.abbr === setAbbr)?.id ?? null;
  const { data: subheadings } = useQuery({
    queryKey: ['subheadings', primaryId, setId, book, chapter],
    queryFn: () =>
      setId != null
        ? api.setSubheadings(setId, book!, chapter!)
        : api.subheadings(primaryId!, book!, chapter!),
    enabled:
      showHeadings &&
      primaryId != null &&
      book != null &&
      chapter != null &&
      translations !== undefined &&
      sets !== undefined,
    staleTime: Infinity,
  });
  const headings = useMemo(() => {
    const m = new Map<number, string[]>();
    if (showHeadings)
      for (const h of subheadings ?? []) m.set(h.verse, [...(m.get(h.verse) ?? []), h.title]);
    return m;
  }, [subheadings, showHeadings]);
  // where a Shift range starts: the verse clicked, Space'd or Ctrl-added last
  const anchor = useRef<number | null>(null);
  const one = (v: number) => {
    anchor.current = v;
    setSelectedVerses([v]);
  };
  const toggle = (v: number) => {
    if (!selectedVerses.includes(v)) anchor.current = v;
    toggleVerse(v);
  };
  const range = (v: number, add: boolean) => {
    // from the verse clicked last while it is still chosen, else from the chosen verse nearest
    // to this one (stepping and jumps move the selection, not the anchor — review)
    const nearest = [...selectedVerses].sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0];
    const from =
      anchor.current != null && selectedVerses.includes(anchor.current) ? anchor.current : nearest;
    const nums = primaryVerses.map((x) => x.verse);
    if (from == null || !nums.includes(from)) return one(v);
    const [a, b] = from < v ? [from, v] : [v, from];
    const run = nums.filter((n) => n >= a && n <= b);
    pickRange(add ? [...new Set([...selectedVerses, ...run])].sort((x, y) => x - y) : run);
  };
  /** Ctrl / ⌘ adds or takes out one verse, Shift a range (with Ctrl too: added to the pick). */
  const pick = (v: number, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    if (e.shiftKey) range(v, e.ctrlKey || e.metaKey);
    else if (e.ctrlKey || e.metaKey) toggle(v);
    else return false;
    return true;
  };
  // a drag across the rows picks the verses between (1.19.0-beta.2, F1017-10): they light up as the
  // mouse goes, the pick is made once, on release, the Shift range's way (a pick of several waits for
  // Enter where the setting says so); back on the row it started on, it is a click. Near the list's
  // top or bottom edge the list scrolls on by itself.
  const drag = useRef<{ from: number; to: number } | null>(null);
  const [dragged, setDragged] = useState<[number, number] | null>(null);
  const dragTo = (verse: number) => {
    const d = drag.current;
    if (!d || d.to === verse) return;
    d.to = verse;
    setDragged(d.from === verse ? null : [Math.min(d.from, verse), Math.max(d.from, verse)]);
  };
  const latest = useRef({ pickRange, primaryVerses, dragTo });
  latest.current = { pickRange, primaryVerses, dragTo };
  useEffect(() => {
    let edge = 0;
    let frame = 0;
    let at = { x: 0, y: 0 };
    const roll = () => {
      frame = 0;
      const view = verseViewport.current;
      if (!drag.current || !edge || !view) return;
      view.scrollBy({ top: edge });
      // the row now at the pointer's height (the pointer may be past the list's edge)
      const box = view.getBoundingClientRect();
      const y = Math.min(Math.max(at.y, box.top + 4), box.bottom - 4);
      const row = document.elementFromPoint(at.x, y)?.closest<HTMLElement>('[data-verse]');
      if (row) latest.current.dragTo(Number(row.dataset.verse));
      frame = requestAnimationFrame(roll);
    };
    const move = (e: PointerEvent) => {
      const box = drag.current && verseViewport.current?.getBoundingClientRect();
      if (!box) return;
      at = { x: Math.min(Math.max(e.clientX, box.left + 4), box.right - 4), y: e.clientY };
      edge = e.clientY < box.top + 28 ? -8 : e.clientY > box.bottom - 28 ? 8 : 0;
      if (edge && !frame) frame = requestAnimationFrame(roll);
    };
    const stop = (pick: boolean) => {
      const d = drag.current;
      drag.current = null;
      edge = 0;
      if (!d) return;
      setDragged(null);
      if (!pick || d.to === d.from) return;
      const [a, b] = d.from < d.to ? [d.from, d.to] : [d.to, d.from];
      anchor.current = d.from;
      const { pickRange: take, primaryVerses: rows } = latest.current;
      take(rows.map((x) => x.verse).filter((n) => n >= a && n <= b));
    };
    const up = () => stop(true);
    const cancel = () => stop(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      cancelAnimationFrame(frame);
    };
  }, [verseViewport]);
  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        minHeight: panelPlacement === 'bottom' ? BOTTOM_VERSES_MIN : 0,
      }}
    >
      <ScrollArea style={{ flex: 1 }} px="md" py="xs" viewportRef={verseViewport}>
        <Stack gap={2}>
          {primaryVerses.map((v) => (
            <Fragment key={`${v.bookNumber}-${v.chapter}-${v.verse}`}>
              {/* a section title before its verse (1.16.0-beta.2): not a row — the keys step verses */}
              {headings.get(v.verse)?.map((title, i) => (
                <Text
                  key={i}
                  className="vo-subheading"
                  size="sm"
                  fw={600}
                  c="dimmed"
                  aria-hidden={false}
                >
                  {title}
                </Text>
              ))}
              <div
                // keyed by the place, not the number alone: a focused row of the last chapter must not
                // stay focused as another verse of this one — Enter put «Ів 3:28» on screen after a jump
                // from «Рим 8:28» (users' report F1010-03, reproduced in 1.12.0). The verse's own book:
                // the books list may come after the verses (review)
                key={`${v.bookNumber}-${v.chapter}-${v.verse}`}
                className="vo-verse-item vo-verse-row"
                role="button"
                tabIndex={0}
                data-verse={v.verse}
                data-selected={selectedVerses.includes(v.verse) ? 'true' : undefined}
                data-dragged={
                  dragged && v.verse >= dragged[0] && v.verse <= dragged[1] ? 'true' : undefined
                }
                onPointerDown={(e) => {
                  // the mouse alone: a finger's drag scrolls, a modifier's click is its own
                  if (e.pointerType !== 'mouse' || e.button !== 0) return;
                  if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                  drag.current = { from: v.verse, to: v.verse };
                }}
                onPointerEnter={(e) => {
                  const d = drag.current;
                  if (!d) return;
                  // released outside the window: no drag any more
                  if (!(e.buttons & 1)) {
                    drag.current = null;
                    setDragged(null);
                    return;
                  }
                  dragTo(v.verse);
                }}
                onClick={(e) => {
                  if (!pick(v.verse, e)) one(v.verse);
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ') {
                    e.preventDefault();
                    if (!pick(v.verse, e)) one(v.verse);
                  } else if (e.key === 'Enter') {
                    // bound to «На екран» (⌘↩ on a Mac): that hotkey projects
                    if (matchesCombo(e.nativeEvent, keymap.project)) return;
                    e.preventDefault();
                    // a held Enter projects once, not on every repeat (held keys, as since 1.9.5)
                    if (e.repeat) return;
                    // Enter projects to the screen immediately (no need to enable
                    // live-follow or press F5); modifier+Enter extends the selection.
                    if (!pick(v.verse, e)) {
                      anchor.current = v.verse;
                      projectVerseOnEnter(v.verse);
                    }
                  }
                }}
              >
                <span className="vo-verse-num">{v.verse}</span>
                <span>
                  {appearance.redLetter
                    ? parseRedLetter(v.textRaw ?? v.text ?? '').map((s, j, arr) => (
                        <Text
                          span
                          key={j}
                          style={{
                            // a light tint toward the accent: the whole Gospel is often red-letter, so a
                            // strong tint turns the reading list into a wall of red (the slide keeps 50%)
                            color: s.jesus
                              ? `color-mix(in srgb, currentColor 70%, ${appearance.jesusColor})`
                              : undefined,
                          }}
                        >
                          {s.text}
                          {j < arr.length - 1 ? ' ' : ''}
                        </Text>
                      ))
                    : v.text}
                </span>
              </div>
            </Fragment>
          ))}
          {primaryVerses.length === 0 &&
            (libraryGap ? (
              <NoLibrary gap={libraryGap} onOpenSettings={openAppSettings} />
            ) : versesLoading ? null : (
              <Text c="dimmed" size="sm" p="sm">
                {currentBook == null
                  ? tr('Оберіть книгу ліворуч — відкриється її перший розділ.')
                  : chapter == null
                    ? tr('Оберіть розділ угорі.')
                    : tr('У цьому розділі немає віршів у головному перекладі.')}
              </Text>
            ))}
        </Stack>
      </ScrollArea>
      {concordanceStrong && (
        <ConcordancePanel
          strong={concordanceStrong}
          primaryId={primaryId}
          onPick={jumpTo}
          onClose={() => setConcordanceStrong(null)}
        />
      )}
    </div>
  );
}

/**
 * With the display panel below the centre (1.4.6) the verse list keeps 7.5rem, three or four
 * verses, while the panel gives way (BOTTOM_PANEL_MIN in Control.tsx).
 */
const BOTTOM_VERSES_MIN = '7.5rem';
