import { useLayoutEffect, useRef } from 'react';
import type { SlideSource, SlideTransition } from '../presenterBus';
import { addedVerses, grownCut } from './slideFade';

/**
 * The words on a phone (/follow) and on «Сцена» follow «Перехід між слайдами» (1.13.0-beta.1):
 * `block` changes with every new slide — keyed by it, the words come in again («Наплив» rises);
 * a pick that grows keeps the block and `cuts[i]` says where line i's added words start, so only
 * they come in. Decided against the words drawn last, so re-renders keep their decision.
 */
export function useGrownWords(
  texts: string[],
  source: SlideSource | null | undefined,
  mode: SlideTransition | undefined,
): { block: number; cuts: (number | null)[] | null } {
  const last = useRef<{
    key: string | null;
    texts: string[];
    source: SlideSource | null | undefined;
    block: number;
    cuts: (number | null)[] | null;
  }>({ key: null, texts: [], source: null, block: 0, cuts: null });
  const key = texts.join('\n');
  const c = last.current;
  let block = c.block;
  let cuts: (number | null)[] | null = null;
  if (key === c.key) cuts = c.cuts;
  else if (c.key !== null && addedVerses(c.source, source)) {
    cuts = mode === 'none' ? null : texts.map((t, i) => grownCut(c.texts[i] ?? '', t));
  } else block = c.block + 1;
  useLayoutEffect(() => {
    last.current = { key, texts, source, block, cuts };
  });
  return { block, cuts };
}
