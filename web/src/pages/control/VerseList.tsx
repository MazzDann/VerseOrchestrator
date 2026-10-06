import { type RefObject } from 'react';
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
 * The open chapter's verses (click, Space, Enter, modifiers extend the selection) and the
 * concordance beside them; an empty chapter says what to do.
 */
export function VerseList({
  panelPlacement,
  verseViewport,
  primaryVerses,
  selectedVerses,
  toggleVerse,
  setSelectedVerses,
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
              key={v.verse}
              className="vo-verse-item vo-verse-row"
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
                const mod = e.ctrlKey || e.metaKey || e.shiftKey;
                if (e.key === ' ') {
                  e.preventDefault();
                  if (mod) toggleVerse(v.verse);
                  else setSelectedVerses([v.verse]);
                } else if (e.key === 'Enter') {
                  // bound to «На екран» (⌘↩ on a Mac): that hotkey projects
                  if (matchesCombo(e.nativeEvent, keymap.project)) return;
                  e.preventDefault();
                  // Enter projects to the screen immediately (no need to enable
                  // live-follow or press F5); modifier+Enter extends the selection.
                  if (mod) toggleVerse(v.verse);
                  else projectVerseOnEnter(v.verse);
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
