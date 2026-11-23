import { describe, expect, it } from 'vitest';
import { normalizeForSearch } from '../normalize.js';
import { topicQueryOf, topicWordsIn } from './topicQuery.js';

describe('a query that names a ready topic (1.25.0-beta.7)', () => {
  it('is known in both languages, whatever its case; any other is none', () => {
    const uk = topicQueryOf('різдво');
    expect(uk?.about).toContain('Вифлеємі');
    expect(topicQueryOf(' Christmas ')?.about).toBe(uk?.about);
    expect(topicQueryOf('Прихід')?.about).toContain('прийде на хмарах');
    expect(topicQueryOf('любов до ближнього')).toBeNull();
    expect(topicQueryOf('')).toBeNull();
  });

  it('its own words are found in a song’s text, two are enough', () => {
    const q = topicQueryOf('Різдво')!;
    const n = (s: string) => topicWordsIn(normalizeForSearch(s), q);
    expect(n('Тиха ніч у Вифлеємі, немовля у яслах')).toBe(2);
    expect(n('В Вифлееме родился Спаситель')).toBe(1);
    expect(n('Хвала Богові за все')).toBe(0);
    // words a hymnal is full of («Христос», «Ісус») tell no topic apart
    expect(n('Ісус Христос мій Спаситель')).toBe(0);
    expect(n('Славте, народи, співайте, рожденные свыше')).toBe(0);
  });
});
