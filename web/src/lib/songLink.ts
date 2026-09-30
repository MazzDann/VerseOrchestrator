import type { SongDetail, SongInfo } from '../api';

/** The label a running-order song carries: «№12 Назва» (the Songs panel's «Додати у показ»). */
export const songLabel = (s: { number: number | null; title: string }): string =>
  `${s.number != null ? `№${s.number} ` : ''}${s.title}`.trim();

/** «№12 Назва» → what to search the songs for: the number if there is one, else the title. */
export function labelQuery(label: string): string {
  const m = label.match(/^№(\d+)\s/);
  return m ? m[1] : label;
}

/**
 * A running-order song by its id — or, when that id leads to another song or none, by its
 * label. Libraries before 0.10.0 numbered songs by file order, so an id could shift when a
 * file was added; song bundles give stable ids, and the first run after them relinks here.
 * Labels compare in one Unicode form: a song a Mac read before 1.3.1 carried «й» / «ї» as a
 * letter + a combining mark, and its id changed when its key became composed.
 */
export async function findSong(
  songId: number,
  label: string,
  bundle: string | undefined,
  load: {
    song: (id: number) => Promise<SongDetail>;
    search: (q: string) => Promise<SongInfo[]>;
  },
): Promise<SongDetail | null> {
  const want = label.normalize('NFC');
  const sameLabel = (s: SongInfo) => songLabel(s).normalize('NFC') === want;
  const same = (s: SongInfo) =>
    sameLabel(s) && (!bundle || s.bundle.normalize('NFC') === bundle.normalize('NFC'));
  const byId = await load.song(songId).catch(() => null);
  if (byId && same(byId)) return byId;
  const found = (await load.search(labelQuery(want)).catch(() => [])).filter(sameLabel);
  // the item's own bundle first (items made before 0.10.0 don't know theirs)
  const match = found.find(same) ?? found[0];
  if (match) return load.song(match.id).catch(() => byId);
  return byId;
}
