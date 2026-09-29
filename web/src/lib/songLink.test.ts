import { describe, expect, it } from 'vitest';
import type { SongDetail, SongInfo } from '../api';
import { findSong, labelQuery, songLabel } from './songLink';

const song = (id: number, number: number | null, title: string, bundle = 'ПС'): SongDetail => ({
  id,
  number,
  title,
  bundle,
  slides: [{ text: title, style: null }],
});

/** A library after 0.10.0: stable ids; the running order still has the old one. */
function library(songs: SongDetail[]) {
  const searched: string[] = [];
  return {
    searched,
    load: {
      song: async (id: number) => {
        const s = songs.find((x) => x.id === id);
        if (!s) throw new Error('Пісню не знайдено');
        return s;
      },
      search: async (q: string): Promise<SongInfo[]> => {
        searched.push(q);
        return songs
          .filter((s) => String(s.number ?? '').startsWith(q) || s.title.includes(q))
          .map(({ id, number, title, bundle }) => ({ id, number, title, bundle }));
      },
    },
  };
}

describe('a running-order song after the ids changed (0.10.0)', () => {
  it('labels', () => {
    expect(songLabel({ number: 12, title: 'Слава' })).toBe('№12 Слава');
    expect(songLabel({ number: null, title: 'Слава' })).toBe('Слава');
    expect(labelQuery('№12 Слава')).toBe('12');
    expect(labelQuery('Слава')).toBe('Слава');
  });

  it('the id still leads to the song: no search', async () => {
    const lib = library([song(5, 12, 'Слава')]);
    expect((await findSong(5, '№12 Слава', undefined, lib.load))?.id).toBe(5);
    expect(lib.searched).toEqual([]);
  });

  it('the old id is gone or is another song: found by the label', async () => {
    const lib = library([
      song(9001, 12, 'Слава'),
      song(2, 120, 'Хвала'),
      song(9002, 12, 'Інша', 'Нові'),
    ]);
    expect((await findSong(3, '№12 Слава', undefined, lib.load))?.id).toBe(9001);
    expect((await findSong(2, '№12 Слава', undefined, lib.load))?.id).toBe(9001);
    expect(lib.searched).toEqual(['12', '12']);
  });

  it('the same label in two bundles: the item’s own bundle', async () => {
    const lib = library([song(9001, 12, 'Слава'), song(9003, 12, 'Слава', 'Нові')]);
    expect((await findSong(3, '№12 Слава', 'Нові', lib.load))?.id).toBe(9003);
    expect((await findSong(3, '№12 Слава', undefined, lib.load))?.id).toBe(9001);
  });

  it('nothing matches the label: what the id gives, else nothing', async () => {
    const lib = library([song(2, 120, 'Хвала')]);
    expect((await findSong(2, '№12 Слава', undefined, lib.load))?.id).toBe(2);
    expect(await findSong(3, '№12 Слава', undefined, lib.load)).toBeNull();
  });
});
