/** Language codes as files give them (three letters, «uk-UA», a name) → the modules' short codes. */
const CODES: Record<string, string> = Object.fromEntries(
  (
    'ukr uk,rus ru,eng en,deu de,ger de,pol pl,heb he,iw he,hbo he,ell el,gre el,lat la,spa es,' +
    'fra fr,fre fr,ita it,por pt,ron ro,rum ro,bul bg,bel be,ces cs,cze cs,slk sk,slo sk,hun hu,' +
    'ara ar,srp sr,hrv hr,nld nl,dut nl,swe sv,fin fi,nor no,nob no,dan da,tur tr,kor ko,jpn ja,' +
    'zho zh,chi zh,fas fa,per fa,hye hy,arm hy,kat ka,geo ka,lit lt,lav lv,est et,' +
    'english en,ukrainian uk,russian ru,polish pl,german de,deutsch de,greek el,hebrew he'
  )
    .split(',')
    .map((pair) => pair.split(' ')),
);

/** '' when the file says no language a person could mean. */
export function normalizeLanguage(said: string): string {
  const c = said.trim().toLowerCase().split(/[-_]/)[0];
  if (!/^\p{L}{2,}$/u.test(c) || c === 'und') return '';
  return CODES[c] ?? (c.length <= 3 ? c : '');
}

const RTL = new Set(['he', 'ar', 'fa', 'ur', 'yi', 'syc', 'arc']);
export const isRtl = (language: string) => RTL.has(language);

const WORDS: [string, RegExp][] = [
  ['en', /\b(the|and|of|that|unto)\b/g],
  ['de', /\b(und|der|die|das|nicht)\b/g],
  ['pl', /(?<!\p{L})(się|jest|przez|który|nie)(?!\p{L})/gu],
  ['es', /\b(que|los|las|del|una)\b/g],
  ['fr', /\b(les|des|est|dans|vous)\b/g],
  ['ro', /(?<!\p{L})(și|lui|care|este|din)(?!\p{L})/gu],
];

/** The language a text reads like, for a file that says none: by its letters, else its words. */
export function guessLanguage(sample: string): string {
  const s = sample.toLowerCase();
  const count = (re: RegExp) => s.match(re)?.length ?? 0;
  const letters = count(/\p{L}/gu);
  if (letters === 0) return '';
  const most = (script: RegExp) => count(script) > letters / 2;
  if (most(/\p{Script=Cyrillic}/gu)) {
    if (count(/ў/g) > 0) return 'be';
    if (count(/[іїєґ]/g) > count(/[ыэъё]/g)) return 'uk';
    // Bulgarian has no ы / э, but its ъ is everywhere
    if (count(/[ыэ]/g) === 0) return count(/ъ/g) > 0 ? 'bg' : '';
    return 'ru';
  }
  if (most(/\p{Script=Greek}/gu)) return count(/[ἀ-῿]/g) > 0 ? 'grc' : 'el';
  if (most(/\p{Script=Hebrew}/gu)) return 'he';
  if (most(/\p{Script=Arabic}/gu)) return 'ar';
  if (!most(/\p{Script=Latin}/gu)) return '';
  let best = '';
  let top = count(/\p{L}+/gu) * 0.04;
  for (const [language, re] of WORDS) {
    const n = count(re);
    if (n > top) {
      top = n;
      best = language;
    }
  }
  return best;
}
