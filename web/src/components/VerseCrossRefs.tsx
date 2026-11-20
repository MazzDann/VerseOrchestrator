import { memo, useState } from 'react';
import { Badge, Group, Popover } from '@mantine/core';
import type { CrossRefsShown } from '../settingsStore';
import type { ChapterXref } from '../lib/crossRefs';
import { tr, useLang } from '../i18n';

/** How many references stand written at a verse's end before «+N» (the main ones). */
const MAIN = 3;

const label = (x: ChapterXref, bookName: (n: number) => string) =>
  `${bookName(x.bookNumber)} ${x.chapter}:${x.verseStart}${x.verseEnd > x.verseStart ? `-${x.verseEnd}` : ''}`;

/**
 * A click inside a verse's row must neither pick the verse nor start a drag — the popover's too:
 * React carries its events through the portal to the row (it picked the verse again after a jump)
 */
const keepFromRow = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};

/**
 * A verse's cross-references at its end (1.23.0-beta.6, F1114-15; the author: a marker by default,
 * the main ones written or only at the selected verse in the settings). Each opens its place.
 */
export const VerseCrossRefs = memo(function VerseCrossRefs({
  refs,
  shown,
  selected,
  bookName,
  onOpen,
}: {
  refs: ChapterXref[] | undefined;
  shown: CrossRefsShown;
  selected: boolean;
  bookName: (n: number) => string;
  onOpen: (x: ChapterXref) => void;
}) {
  useLang();
  const [open, setOpen] = useState(false);
  if (!refs?.length || shown === 'off' || (shown === 'selected' && !selected)) return null;
  const written = shown === 'marker' ? [] : refs.slice(0, MAIN);
  const rest = refs.length - written.length;
  const all = (
    <Popover
      opened={open}
      onChange={setOpen}
      position="bottom-end"
      withArrow
      shadow="md"
      withinPortal
    >
      <Popover.Target>
        <button
          type="button"
          className="vo-xref-mark"
          aria-label={tr('Перехресні посилання: {n}', { n: refs.length })}
          title={tr('Перехресні посилання: {n}', { n: refs.length })}
          {...keepFromRow}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          {written.length ? `+${rest}` : `↗${refs.length}`}
        </button>
      </Popover.Target>
      <Popover.Dropdown maw={360} {...keepFromRow}>
        <Group gap={6}>
          {refs.map((x, i) => (
            <Badge
              key={i}
              variant="light"
              color="brand"
              style={{ cursor: 'pointer', textTransform: 'none' }}
              onClick={() => {
                setOpen(false);
                onOpen(x);
              }}
            >
              {label(x, bookName)}
            </Badge>
          ))}
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
  return (
    <span className="vo-xrefs">
      {written.map((x, i) => (
        <button
          key={i}
          type="button"
          className="vo-xref"
          title={tr('Відкрити {place}', { place: label(x, bookName) })}
          {...keepFromRow}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(x);
          }}
        >
          {label(x, bookName)}
        </button>
      ))}
      {(written.length === 0 || rest > 0) && all}
    </span>
  );
});
