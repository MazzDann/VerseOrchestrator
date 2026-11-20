import { describe, expect, it } from 'vitest';
import { addPlace, MAX_PLACES, splitPlaces } from './places';

describe('several places on one slide (1.23.0-beta.7, F1114-07)', () => {
  it('two or more references split by «;»', () => {
    expect(splitPlaces('Ів 3:16; Рим 5:8')).toEqual(['Ів 3:16', 'Рим 5:8']);
    expect(splitPlaces('Ів 3:16;Рим 5:8; 1 Ів 4:9-10')).toEqual([
      'Ів 3:16',
      'Рим 5:8',
      '1 Ів 4:9-10',
    ]);
    expect(splitPlaces('Ів 3:16;')).toBeNull(); // one place
    expect(splitPlaces('Ів 3:16')).toBeNull();
    expect(splitPlaces('любов; віра')).toBeNull(); // words
    expect(splitPlaces('Ів 3:16; любов')).toBeNull();
  });
  it('a place gathered twice is kept once; the oldest give way past the limit', () => {
    const p = (v: number) => ({ bookNumber: 500, chapter: 3, verses: [v] });
    expect(addPlace([p(16)], p(16))).toEqual([p(16)]);
    let list: ReturnType<typeof addPlace> = [];
    for (let v = 1; v <= MAX_PLACES + 2; v++) list = addPlace(list, p(v));
    expect(list).toHaveLength(MAX_PLACES);
    expect(list[0]).toEqual(p(3));
  });
});
