/**
 * Versification alignment (1.8.12-beta.5, the author's call: «search without repeats … in the
 * Psalms there are two numberings … fix it by algorithms, without touching the verses»).
 *
 * Translations number the same text differently: the Psalms come in three numberings — the
 * English (KJV), the Hebrew one that counts a psalm's superscription as verse 1 (Ps 22 has 32
 * verses, not 31), and the Greek/Synodal one that joins Ps 9+10 and 114+115 and splits 116 and 147
 * (its Ps 22 is the English Ps 23); Malachi has 3 or 4 chapters, Joel 3 or 4, Esther and Daniel
 * carry Greek additions. Nothing in a MyBible module says which numbering it uses.
 *
 * The numbering can be recovered from the shape of the text alone: each book's sequence of
 * chapter lengths (verse counts) in one translation is aligned to another's by dynamic
 * programming, as a sequence alignment — a chapter matches a chapter, two match one (a merge),
 * one matches two (a split), or a chapter matches nothing (an addition) — at the least total
 * difference in verse counts. Inside matched chapters the verses are paired in order; the verses
 * one side has more of are put at the start in the Psalms (a superscription counted as a verse)
 * and at the end elsewhere. The result maps a place of one translation to the other's numbering;
 * the stored verses are never changed.
 */

/** A book in one translation: its chapters in order, each with its verse count. */
export type Profile = readonly (readonly [chapter: number, verses: number])[];

/** One step of an alignment: the chapters of A and of B that hold the same text (one side may be empty). */
export interface AlignStep {
  a: number[];
  b: number[];
}

/** What a merge or a split costs beyond its verse-count difference: a 1:1 match wins a tie. */
const MERGE = 2;
/**
 * What a chapter with no counterpart costs beyond its verses — less than a merge, so an addition
 * (Daniel's Susanna, a Ps 151) stays apart instead of being glued to a neighbour by a split.
 */
const GAP = 1;
/** The Psalms (MyBible book number): their extra verses are superscriptions, at the start. */
export const PSALMS = 230;
/** How many chapter steps a run may take to balance a verse moved across chapter edges. */
const RUN_STEPS = 3;
/**
 * A chapter longer or shorter by more than this (outside the Psalms) holds an insertion somewhere
 * inside (Daniel 3's Greek additions, 3:24–90): where, the lengths can't tell — its verses keep
 * their numbers, as before the alignment (review).
 */
const MAX_TAIL = 3;

/** Align two books' chapter profiles (A — the reference, B — the other translation). */
export function alignChapters(a: Profile, b: Profile): AlignStep[] {
  const n = a.length;
  const m = b.length;
  const INF = Number.POSITIVE_INFINITY;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(INF));
  const move: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(-1));
  cost[0][0] = 0;
  const va = (i: number) => a[i][1];
  const vb = (j: number) => b[j][1];
  // moves: 0 = 1:1, 1 = 2:1 (B merged two of A's), 2 = 1:2 (B split one of A's), 3 = A alone, 4 = B alone
  const tryMove = (i: number, j: number, k: number, c: number) => {
    if (c < cost[i][j]) {
      cost[i][j] = c;
      move[i][j] = k;
    }
  };
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      if (i === 0 && j === 0) continue;
      if (i >= 1 && j >= 1) tryMove(i, j, 0, cost[i - 1][j - 1] + Math.abs(va(i - 1) - vb(j - 1)));
      if (i >= 2 && j >= 1)
        tryMove(i, j, 1, cost[i - 2][j - 1] + Math.abs(va(i - 2) + va(i - 1) - vb(j - 1)) + MERGE);
      if (i >= 1 && j >= 2)
        tryMove(i, j, 2, cost[i - 1][j - 2] + Math.abs(va(i - 1) - vb(j - 2) - vb(j - 1)) + MERGE);
      if (i >= 1) tryMove(i, j, 3, cost[i - 1][j] + va(i - 1) + GAP);
      if (j >= 1) tryMove(i, j, 4, cost[i][j - 1] + vb(j - 1) + GAP);
    }
  const steps: AlignStep[] = [];
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const k = move[i][j];
    const take = ([di, dj]: [number, number]) => {
      steps.push({
        a: a.slice(i - di, i).map(([c]) => c),
        b: b.slice(j - dj, j).map(([c]) => c),
      });
      i -= di;
      j -= dj;
    };
    take(
      (
        [
          [1, 1],
          [2, 1],
          [1, 2],
          [1, 0],
          [0, 1],
        ] as [number, number][]
      )[k],
    );
  }
  return steps.reverse();
}

/** Does this alignment change any place (anything but the same chapters with the same verses)? */
export function isIdentity(a: Profile, b: Profile, steps: AlignStep[]): boolean {
  const count = (p: Profile) => new Map(p.map(([c, v]) => [c, v]));
  const ca = count(a);
  const cb = count(b);
  return steps.every(
    (s) =>
      s.a.length === 1 &&
      s.b.length === 1 &&
      s.a[0] === s.b[0] &&
      ca.get(s.a[0]) === cb.get(s.b[0]),
  );
}

/**
 * A place of B in A's numbering: `[chapter, verse]`, or null where B has text A hasn't (an
 * addition). `book` decides where a chapter's extra verses sit (the Psalms: at the start).
 */
export function versificationMap(
  a: Profile,
  b: Profile,
  book: number,
): (chapter: number, verse: number) => [number, number] | null {
  const steps = alignChapters(a, b);
  if (isIdentity(a, b, steps)) return (c, v) => [c, v];
  const countA = new Map(a.map(([c, v]) => [c, v]));
  const countB = new Map(b.map(([c, v]) => [c, v]));
  const total = (chs: number[], count: Map<number, number>) =>
    chs.reduce((t, c) => t + (count.get(c) ?? 0), 0);
  // Runs: a verse moved across a chapter's edge (Gen 31:55 = Hebrew 32:1) leaves two neighbouring
  // chapters a verse off each way, the two together even — read as one text, in order. A run is
  // closed where the counts balance again, within RUN_STEPS uneven chapters in a row; a difference
  // that never balances (a
  // psalm's superscription) is the step's own: at its start in the Psalms, at its end elsewhere.
  const runs: { a: number[]; b: number[]; even: boolean }[] = [];
  for (let i = 0; i < steps.length; ) {
    if (steps[i].a.length === 0 || steps[i].b.length === 0) {
      runs.push({ ...steps[i], even: false });
      i++;
      continue;
    }
    let k = i;
    let diff = 0;
    let closed = -1;
    for (; k < steps.length && k < i + RUN_STEPS; k++) {
      if (steps[k].a.length === 0 || steps[k].b.length === 0) break;
      const own = total(steps[k].b, countB) - total(steps[k].a, countA);
      // a verse moved across an edge touches the two chapters at that edge only: an even chapter
      // between two uneven ones is not part of it (Romans' doxology at 14:24 or at 16:25 — review
      // of the run rule against same-language texts)
      if (k > i && own === 0) break;
      diff += own;
      if (diff === 0) {
        closed = k;
        break;
      }
    }
    const last = closed >= 0 ? closed : i;
    const run = steps.slice(i, last + 1);
    runs.push({ a: run.flatMap((s) => s.a), b: run.flatMap((s) => s.b), even: closed >= 0 });
    i = last + 1;
  }
  const runOf = new Map<number, (typeof runs)[number]>();
  for (const r of runs) for (const c of r.b) runOf.set(c, r);
  const atStart = book === PSALMS;
  return (chapter, verse) => {
    const r = runOf.get(chapter);
    if (!r || r.a.length === 0) return null;
    // the place in the run's text, counted over its chapters in order
    let pos = verse;
    for (const c of r.b) {
      if (c === chapter) break;
      pos += countB.get(c) ?? 0;
    }
    const nA = total(r.a, countA);
    const nB = total(r.b, countB);
    let posA = pos;
    if (!r.even && atStart) {
      // a psalm's superscription counted as a verse: the extra verses at its start (verse 1 takes them)
      posA = Math.max(1, Math.min(nA, pos - (nB - nA)));
    } else if (!r.even) {
      // elsewhere a few extra verses sit at the end and have no counterpart (Rev 12:18); a big
      // difference is an insertion inside the chapter: the verses keep their numbers
      if (Math.abs(nB - nA) > MAX_TAIL) return [chapter, verse];
      if (pos > nA) return null;
    }
    for (const c of r.a) {
      const len = countA.get(c) ?? 0;
      if (posA <= len) return [c, posA];
      posA -= len;
    }
    const last = r.a[r.a.length - 1];
    return [last, countA.get(last) ?? 1];
  };
}

/** Profiles from rows of (translation, book, chapter, max verse), by `${translation}-${book}`. */
export function profilesOf(
  rows: readonly { translationId: number; bookNumber: number; chapter: number; verses: number }[],
): Map<string, Profile> {
  const out = new Map<string, [number, number][]>();
  for (const r of rows) {
    const key = `${r.translationId}-${r.bookNumber}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push([r.chapter, r.verses]);
  }
  for (const p of out.values()) p.sort((x, y) => x[0] - y[0]);
  return out;
}
