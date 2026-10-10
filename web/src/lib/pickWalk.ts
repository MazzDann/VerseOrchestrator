/**
 * A pick collected before Enter (1.13.0-beta.1, users' report F1010-04/05; the user: «все разом,
 * потім по одному»): «Далі» shows it all together, then its verses one by one (16, 17, 18, 20 —
 * 19 was not picked), then goes on after the last (21). `key` ties it to the translation, book
 * and chapter it was collected in.
 */
export interface PickWalk {
  key: string;
  verses: number[];
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Where «Далі» (`delta` > 0) or «Назад» goes inside the walk: the new selection, or `null` when
 * the selection has left the walk or steps out of its end — then it steps as usual.
 */
export function walkStep(walk: PickWalk, selected: number[], delta: number): number[] | null {
  const all = same(selected, walk.verses);
  const i = selected.length === 1 ? walk.verses.indexOf(selected[0]) : -1;
  if (!all && i < 0) return null;
  if (delta > 0) {
    if (all) return [walk.verses[0]];
    return i < walk.verses.length - 1 ? [walk.verses[i + 1]] : null;
  }
  if (all) return null;
  // back from the first verse: the whole pick again
  return i > 0 ? [walk.verses[i - 1]] : walk.verses;
}
