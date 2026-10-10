import { useRef, type RefObject } from 'react';
import { ScrollArea, Stack, Text } from '@mantine/core';
import { parseRedLetter } from '@vo/shared';
import { type Book, type Verse } from '../../api';
import { type Appearance, type PanelPlacement } from '../../settingsStore';
import { type Keymap, matchesCombo } from '../../hotkeys';
import { ConcordancePanel } from '../../components/ConcordancePanel';
import { NoLibrary, type LibraryGap } from '../../components/NoLibrary';
import { type StrongPickRef } from '../../components/StrongView';
import { tr, useLang } from '../../i18n';

/**
 * The open chapter's verses (click, Space, Enter; Ctrl / ⌘ adds or takes out one verse, Shift a
 * range from the last one clicked) and the concordance beside them; an empty chapter says what
 * to do.
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
