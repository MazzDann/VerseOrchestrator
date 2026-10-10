import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Presentation sequence ("playlist"): an ordered agenda of items the operator
 * walks during a live show — passages, songs, and free-text slides in one list,
 * saved across reloads. The "connective tissue" that ties the separate projection
 * surfaces (verses / Songs panel / Text panel) into a single running order.
 */

export interface SeqPassage {
  kind: 'passage';
  id: string;
  label: string; // reference, e.g. "Ів 3:16-18"
  translationIds: number[];
  bookNumber: number;
  chapter: number;
  verses: number[];
}

export interface SeqSong {
  kind: 'song';
  id: string;
  label: string; // "№12 Назва"
  songId: number;
  /** the song's bundle (0.10.0): tells apart songs with the same label in two bundles */
  bundle?: string;
  faithful: boolean; // project faithfully (pptx look) or as plain text
}

export interface SeqText {
  kind: 'text';
  id: string;
  label: string; // title or first words
  title: string;
  body: string;
}

/**
 * A picture (1.5.0): the server's files by address (server/src/images.ts) and how it fills the
 * slide. A deleted picture leaves its item a black slide; «Скасувати» brings the same id back.
 */
export interface SeqImage {
  kind: 'image';
  id: string;
  label: string; // the picture's name
  imageId: string;
  src: string;
  small: string;
  fit: 'contain' | 'cover';
}

/**
 * An album (1.8.12, server/src/albums.ts): a folder of photos by its id; activated, it opens in
 * «Зображення» at its first photo, and the clicker steps it. A removed album or a folder gone
 * leaves the item saying so.
 */
export interface SeqAlbum {
  kind: 'album';
  id: string;
  label: string; // the album's name
  albumId: string;
  fit: 'contain' | 'cover';
}

/**
 * A video (1.8.12-beta.3, server/src/videos.ts): a file of the list by its id; activated, it plays
 * from its start; at its end «Далі» goes on to the next item. A video taken off the list leaves
 * the item saying so.
 */
export interface SeqVideo {
  kind: 'video';
  id: string;
  label: string; // the video's name
  videoId: string;
  fit: 'contain' | 'cover';
}

/**
 * «Заставка» as an item (1.10.0-beta.2, the author's call: its own text and picture in each item):
 * the picture is one of «Зображення» by its address, never a data URL; none — the text alone.
 */
export interface SeqCover {
  kind: 'cover';
  id: string;
  label: string;
  text: string;
  image: { imageId: string; src: string } | null;
}

/**
 * «Відлік» as an item (1.10.0-beta.3, the author's call: its own length, words and action at zero):
 * on the cover on screen; `next` — at zero the running order goes on by itself.
 */
export interface SeqCountdown {
  kind: 'countdown';
  id: string;
  label: string;
  /** 1 s … 12 h */
  seconds: number;
  caption: string;
  atZero: 'next' | 'overtime' | 'stop' | 'hide';
}

/**
 * «Цикл оголошень» (1.10.0-beta.4, the author's call: a group going round every N s until «Далі»):
 * texts, pictures and covers gathered from the list, shown one after another by the control window
 * in charge.
 */
export type SeqLoopSlide = SeqText | SeqImage | SeqCover;
export interface SeqLoop {
  kind: 'loop';
  id: string;
  label: string;
  /** seconds a slide stays, 3 … 600 */
  every: number;
  items: SeqLoopSlide[];
}
/** What a loop may hold: one slide each. */
export const inLoop = (it: SeqItem): it is SeqLoopSlide =>
  it.kind === 'text' || it.kind === 'image' || it.kind === 'cover';
export const LOOP_MAX = 50;

/**
 * An item of a newer version (1.9.1): a kind this one doesn't know — kept exactly as it was saved,
 * so the newer version gets it back after a step down and up again; never put on screen, steps
 * pass over it. 1.9.0 drew such an item with no icon and the control window failed.
 */
export interface SeqForeign {
  kind: 'foreign';
  id: string;
  label: string;
  /** the item as it was stored */
  raw: Record<string, unknown>;
}

export type SeqItem =
  | SeqPassage
  | SeqSong
  | SeqText
  | SeqImage
  | SeqAlbum
  | SeqVideo
  | SeqCover
  | SeqCountdown
  | SeqLoop
  | SeqForeign;
/** An item to add — same shape minus the store-assigned id. */
export type NewSeqItem =
  | Omit<SeqPassage, 'id'>
  | Omit<SeqSong, 'id'>
  | Omit<SeqText, 'id'>
  | Omit<SeqImage, 'id'>
  | Omit<SeqAlbum, 'id'>
  | Omit<SeqVideo, 'id'>
  | Omit<SeqCover, 'id'>
  | Omit<SeqCountdown, 'id'>;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback for older engines; uniqueness is sufficient for a local list.
    return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

/**
 * The version each kind of item came in (1.9.1). Before 1.9.1 a control window fails on a kind it
 * doesn't know (an item with no icon) and doesn't open while the list holds one: «Оновлення» warns
 * before going there. A new kind goes here with its first version.
 */
export const KIND_SINCE: Record<Exclude<SeqItem['kind'], 'foreign'>, string> = {
  // the first running order
  passage: '0.0.0',
  song: '0.0.0',
  text: '0.0.0',
  image: '1.5.0',
  album: '1.8.12-beta.1',
  video: '1.8.12-beta.3',
  cover: '1.10.0-beta.2',
  countdown: '1.10.0-beta.3',
  loop: '1.10.0-beta.4',
};
/** From this version on, an item of a kind the version doesn't know is passed over. */
export const FIRST_FOREIGN_SAFE = '1.9.1';

const KINDS: ReadonlySet<string> = new Set(Object.keys(KIND_SINCE));

/** Can the item go on screen? An item of a newer version can't (1.9.1). */
export const playable = (it: SeqItem): boolean => it.kind !== 'foreign';

/**
 * A stored item as this version holds it (1.9.1): a kind it knows as it is, any other kind kept
 * whole as `foreign`; what isn't an item at all is dropped.
 */
export function fromStored(raw: unknown): SeqItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.kind === 'string' && KINDS.has(r.kind)) return knownItem(r);
  return {
    kind: 'foreign',
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    label: typeof r.label === 'string' ? r.label : '',
    raw: r,
  };
}

const str = (v: unknown, or = ''): string => (typeof v === 'string' ? v : or);
const AT_ZERO = ['next', 'overtime', 'stop', 'hide'];
/**
 * A known kind's fields made safe (1.10.0-beta.3 review): a hand-edited file or another build may
 * leave a «Відлік» without words or a length — its helpers read them on every render.
 */
function knownItem(r: Record<string, unknown>): SeqItem {
  if (r.kind === 'countdown') {
    const n = Number(r.seconds);
    return {
      ...r,
      label: str(r.label),
      caption: str(r.caption),
      seconds: Math.min(43200, Math.max(1, Math.round(Number.isFinite(n) ? n : 300))),
      atZero: AT_ZERO.includes(r.atZero as string) ? r.atZero : 'stop',
    } as unknown as SeqItem;
  }
  if (r.kind === 'loop') {
    const n = Number(r.every);
    const slides = (Array.isArray(r.items) ? r.items : [])
      .filter(
        (x): x is Record<string, unknown> =>
          !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string',
      )
      .filter((x) => x.kind === 'text' || x.kind === 'image' || x.kind === 'cover')
      .map(knownItem)
      .slice(0, LOOP_MAX);
    return {
      ...r,
      label: str(r.label),
      every: Math.min(600, Math.max(3, Math.round(Number.isFinite(n) ? n : 8))),
      items: slides,
    } as unknown as SeqItem;
  }
  if (r.kind === 'cover') {
    const img = r.image as { imageId?: unknown; src?: unknown } | null | undefined;
    return {
      ...r,
      label: str(r.label),
      text: str(r.text),
      image:
        img && typeof img.imageId === 'string' && typeof img.src === 'string'
          ? { imageId: img.imageId, src: img.src }
          : null,
    } as unknown as SeqItem;
  }
  return r as unknown as SeqItem;
}

/** The item as it is saved: an item of a newer version exactly as it came (under its id). */
export const toStored = (it: SeqItem): unknown =>
  it.kind === 'foreign' ? { ...it.raw, id: it.id } : it;

const listFromStored = (raw: unknown): SeqItem[] =>
  Array.isArray(raw) ? raw.map(fromStored).filter((it): it is SeqItem => it !== null) : [];

/**
 * Where a step through the running order lands (1.9.1: over items of a newer version): with no
 * current item, the first playable one forward or the last one back; null when nothing further.
 */
export function stepIndex(
  items: readonly SeqItem[],
  currentId: string | null,
  delta: 1 | -1,
): number | null {
  const at = items.findIndex((i) => i.id === currentId);
  for (
    let i = at < 0 ? (delta > 0 ? 0 : items.length - 1) : at + delta;
    i >= 0 && i < items.length;
    i += delta
  )
    if (playable(items[i])) return i;
  return null;
}

interface PlaylistState {
  items: SeqItem[];
  /** Id of the item currently projected from the sequence (highlight + step anchor). */
  currentId: string | null;
  /** Saved running orders ("programs") that can be reloaded week to week. */
  saved: SavedProgram[];
  add: (item: NewSeqItem) => void;
  removeItem: (id: string) => void;
  /** Change an item in place (1.10.0-beta.2: a «Заставка» item's text and picture). */
  updateItem: (
    id: string,
    patch:
      | Partial<Omit<SeqCover, 'id' | 'kind'>>
      | Partial<Omit<SeqCountdown, 'id' | 'kind'>>
      | Partial<Pick<SeqLoop, 'every' | 'label'>>,
  ) => void;
  /** Gather these texts, pictures and covers into one «Цикл» where the first of them stood. */
  gatherLoop: (ids: string[], label: string) => void;
  /** One slide out of a loop, right after it; an emptied loop goes. */
  takeOutOfLoop: (loopId: string, slideId: string) => void;
  /** The loop's slides back into the list where it stood. */
  scatterLoop: (loopId: string) => void;
  /** Move an item one slot up (-1) or down (+1). */
  move: (id: string, dir: -1 | 1) => void;
  /** Move the item at `from` to position `to` (drag-and-drop reorder). */
  reorder: (from: number, to: number) => void;
  clear: () => void;
  /**
   * What «Очистити показ» took away (0.9.0), so «Скасувати» can bring it back. Offered while
   * the list stays empty: adding an item or opening a program forgets it. Not saved.
   */
  cleared: { items: SeqItem[]; currentId: string | null } | null;
  /** Bring back the list the last «Очистити показ» emptied. */
  undoClear: () => void;
  setCurrent: (id: string | null) => void;
  /** Snapshot the current items under `name` (overwrites an existing program). */
  saveProgram: (name: string) => void;
  /** Replace the current items with a saved program's (fresh ids; currentId reset). */
  loadProgram: (name: string) => void;
  /**
   * The list a program replaced (0.9.3), so «Скасувати» can bring it back. Offered while the
   * program's list is untouched: adding, removing, moving, clearing or opening another
   * program forgets it. Not saved.
   */
  replaced: { program: string; items: SeqItem[]; currentId: string | null } | null;
  /** Bring back the list the last opened program replaced. */
  undoLoad: () => void;
  deleteProgram: (name: string) => void;
  /**
   * A song's id changed (0.10.0: bundles give stable ids): the running order's and the
   * saved programs' items for that song — same old id, same label — take the new one.
   */
  relinkSong: (oldId: number, label: string, newId: number, bundle?: string) => void;
  /**
   * A picture, an album or a video got a new name (1.14.0-beta.1): its items here and in the saved
   * programs that still carry the old name take the new one (an item named otherwise keeps it).
   */
  renameMedia: (kind: 'image' | 'album' | 'video', id: string, from: string, to: string) => void;
  /**
   * The program «Видалити програму» took away last and where it stood (0.9.1), so
   * «Скасувати» can put it back. Saving a program forgets it; not saved.
   */
  deleted: { program: SavedProgram; index: number } | null;
  /** Put the last deleted program back in its place. */
  undoDelete: () => void;
}

export interface SavedProgram {
  name: string;
  items: SeqItem[];
}

export const usePlaylist = create<PlaylistState>()(
  persist(
    (set) => ({
      items: [],
      currentId: null,
      saved: [],
      cleared: null,
      replaced: null,
      deleted: null,
      add: (item) =>
        set((s) => ({
          items: [...s.items, { ...item, id: newId() } as SeqItem],
          cleared: null,
          replaced: null,
        })),
      updateItem: (id, patch) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id && (it.kind === 'cover' || it.kind === 'countdown' || it.kind === 'loop')
              ? ({ ...it, ...patch, id: it.id, kind: it.kind } as SeqItem)
              : it,
          ),
          replaced: null,
        })),
      gatherLoop: (ids, label) =>
        set((s) => {
          const picked = s.items.filter(
            (it) => ids.includes(it.id) && inLoop(it),
          ) as SeqLoopSlide[];
          if (picked.length === 0) return s;
          const at = s.items.findIndex((it) => it.id === picked[0].id);
          const loop: SeqLoop = {
            kind: 'loop',
            id: newId(),
            label,
            every: 8,
            items: picked.slice(0, LOOP_MAX),
          };
          const rest = s.items.filter(
            (it) => !picked.slice(0, LOOP_MAX).includes(it as SeqLoopSlide),
          );
          const before = s.items.slice(0, at).filter((it) => rest.includes(it)).length;
          const items = [...rest];
          items.splice(before, 0, loop);
          // the item on screen went into the loop: the loop is the current item now (review)
          const gathered = picked.slice(0, LOOP_MAX).some((x) => x.id === s.currentId);
          return {
            items,
            currentId: gathered ? loop.id : s.currentId,
            replaced: null,
            cleared: null,
          };
        }),
      takeOutOfLoop: (loopId, slideId) =>
        set((s) => {
          const at = s.items.findIndex((it) => it.id === loopId);
          const loop = s.items[at];
          if (!loop || loop.kind !== 'loop') return s;
          const slide = loop.items.find((x) => x.id === slideId);
          if (!slide) return s;
          const left = loop.items.filter((x) => x.id !== slideId);
          const items = [...s.items];
          items.splice(at, 1, ...(left.length ? [{ ...loop, items: left }] : []), slide);
          // an emptied loop that was current: nothing is (review)
          return {
            items,
            currentId: !left.length && s.currentId === loopId ? null : s.currentId,
            replaced: null,
          };
        }),
      scatterLoop: (loopId) =>
        set((s) => {
          const at = s.items.findIndex((it) => it.id === loopId);
          const loop = s.items[at];
          if (!loop || loop.kind !== 'loop') return s;
          const items = [...s.items];
          items.splice(at, 1, ...loop.items);
          return {
            items,
            currentId: s.currentId === loopId ? null : s.currentId,
            replaced: null,
          };
        }),
      removeItem: (id) =>
        set((s) => ({
          items: s.items.filter((i) => i.id !== id),
          currentId: s.currentId === id ? null : s.currentId,
          replaced: null,
        })),
      move: (id, dir) =>
        set((s) => {
          const idx = s.items.findIndex((i) => i.id === id);
          const to = idx + dir;
          if (idx < 0 || to < 0 || to >= s.items.length) return s;
          const items = [...s.items];
          [items[idx], items[to]] = [items[to], items[idx]];
          return { items, replaced: null };
        }),
      reorder: (from, to) =>
        set((s) => {
          if (from === to || from < 0 || to < 0 || from >= s.items.length || to >= s.items.length)
            return s;
          const items = [...s.items];
          const [moved] = items.splice(from, 1);
          items.splice(to, 0, moved);
          return { items, replaced: null };
        }),
      clear: () =>
        set((s) =>
          s.items.length === 0
            ? s
            : {
                items: [],
                currentId: null,
                cleared: { items: s.items, currentId: s.currentId },
                replaced: null,
              },
        ),
      undoClear: () =>
        set((s) =>
          s.cleared && s.items.length === 0
            ? { items: s.cleared.items, currentId: s.cleared.currentId, cleared: null }
            : { cleared: null },
        ),
      setCurrent: (id) => set({ currentId: id }),
      saveProgram: (name) =>
        set((s) => {
          const n = name.trim();
          if (!n || s.items.length === 0) return s;
          const snapshot: SavedProgram = { name: n, items: JSON.parse(JSON.stringify(s.items)) };
          return {
            saved: [snapshot, ...s.saved.filter((p) => p.name !== n)].slice(0, 50),
            deleted: null,
          };
        }),
      loadProgram: (name) =>
        set((s) => {
          const prog = s.saved.find((p) => p.name === name);
          if (!prog) return s;
          const items = (JSON.parse(JSON.stringify(prog.items)) as SeqItem[]).map((it) => ({
            ...it,
            id: newId(),
          }));
          // an empty list loses nothing: no undo to offer
          const replaced = s.items.length
            ? { program: prog.name, items: s.items, currentId: s.currentId }
            : null;
          return { items, currentId: null, cleared: null, replaced };
        }),
      undoLoad: () =>
        set((s) =>
          s.replaced
            ? { items: s.replaced.items, currentId: s.replaced.currentId, replaced: null }
            : s,
        ),
      deleteProgram: (name) =>
        set((s) => {
          const index = s.saved.findIndex((p) => p.name === name);
          if (index < 0) return s;
          return {
            saved: s.saved.filter((_, i) => i !== index),
            deleted: { program: s.saved[index], index },
          };
        }),
      relinkSong: (oldId, label, newId, bundle) =>
        set((s) => {
          const fix = (list: SeqItem[]) =>
            list.map((it) =>
              it.kind === 'song' && it.songId === oldId && it.label === label
                ? { ...it, songId: newId, ...(bundle ? { bundle } : {}) }
                : it,
            );
          return {
            items: fix(s.items),
            saved: s.saved.map((p) => ({ ...p, items: fix(p.items) })),
          };
        }),
      renameMedia: (kind, id, from, to) =>
        set((s) => {
          const ofIt = (it: SeqItem) =>
            (it.kind === 'image' && kind === 'image' && it.imageId === id) ||
            (it.kind === 'album' && kind === 'album' && it.albumId === id) ||
            (it.kind === 'video' && kind === 'video' && it.videoId === id);
          const fix = (list: SeqItem[]) =>
            list.map((it) => (ofIt(it) && it.label === from ? { ...it, label: to } : it));
          return {
            items: fix(s.items),
            saved: s.saved.map((p) => ({ ...p, items: fix(p.items) })),
          };
        }),
      undoDelete: () =>
        set((s) => {
          if (!s.deleted) return s;
          const { program, index } = s.deleted;
          // a program of that name saved since would clash: it stays, the old one doesn't
          if (s.saved.some((p) => p.name === program.name)) return { deleted: null };
          const saved = [...s.saved];
          saved.splice(Math.min(index, saved.length), 0, program);
          return { saved, deleted: null };
        }),
    }),
    {
      name: 'vo:playlist',
      version: 1,
      // currentId marks what's projected this session — never restore it as
      // "active" after a reload, when nothing has been pushed to the screen yet.
      // Items of a newer version go back as they came (1.9.1).
      partialize: (s) => ({
        items: s.items.map(toStored),
        saved: s.saved.map((p) => ({ ...p, items: p.items.map(toStored) })),
      }),
      // a list a newer version saved under a later `version` comes through `merge` too: without
      // `migrate` zustand drops it, and the next change here would write over it (1.9.1 review)
      migrate: (persisted) => persisted as PlaylistState,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { items?: unknown; saved?: unknown };
        const saved = Array.isArray(p.saved)
          ? p.saved
              .filter(
                (x): x is { name: string; items: unknown } =>
                  !!x &&
                  typeof x === 'object' &&
                  typeof (x as { name?: unknown }).name === 'string',
              )
              // what a newer version keeps in a program stays (1.9.1 review)
              .map((x) => ({ ...x, items: listFromStored(x.items) }))
          : current.saved;
        const items = p.items === undefined ? current.items : listFromStored(p.items);
        return { ...current, items, saved };
      },
    },
  ),
);
