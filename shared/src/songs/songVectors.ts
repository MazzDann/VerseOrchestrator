import { slideWords } from './sections.js';

/**
 * Songs by meaning (1.25.0-beta.1, the author: «пишеш тему як от спасіння і воно тобі автопідбирає
 * пісні»): what of a song goes through the model. Every slide is a passage — the title slide as its
 * title (its number and authors say nothing of the theme), the others without a label line
 * («Приспів:») — and a repeated slide once: a chorus after every verse is one passage.
 */
export function songPassages(title: string, slides: string[]): { ords: number[]; texts: string[] } {
  const ords: number[] = [];
  const texts: string[] = [];
  const seen = new Set<string>();
  slides.forEach((raw, ord) => {
    const text = (ord === 0 ? title : slideWords(raw)).replace(/\s+/g, ' ').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    ords.push(ord);
    texts.push(text);
  });
  return { ords, texts };
}

/** FNV-1a (32-bit) of the passages: a song whose words changed is embedded again, the rest kept. */
export function songPassagesHash(p: { ords: number[]; texts: string[] }): string {
  let h = 0x811c9dc5;
  const s = p.ords.map((o, i) => `${o}\u0001${p.texts[i]}`).join('\u0002');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * A song's score from its passages' cosines (the best first): its best passage, and a little of the
 * next one — a song about the theme in two verses comes before one with a single line about it.
 */
export function songScore(cosines: number[]): number {
  const [a = 0, b = 0] = [...cosines].sort((x, y) => y - x);
  return a + 0.25 * Math.max(0, b - (a - 0.15));
}
