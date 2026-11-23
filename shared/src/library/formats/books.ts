/**
 * The books a text format can name: our number (the .SQLite3 modules' numbering), the three-letter
 * code (USFM, VPL), the OSIS id and the names a module without names of its own gets, in three
 * languages. The 66 in their order, then the deuterocanonical ones (the numbers modules use).
 */
const TABLE = `
10 GEN Gen|Бут|Буття|Быт|Бытие|Gen|Genesis
20 EXO Exod|Вих|Вихід|Исх|Исход|Exo|Exodus
30 LEV Lev|Лев|Левит|Лев|Левит|Lev|Leviticus
40 NUM Num|Чис|Числа|Чис|Числа|Num|Numbers
50 DEU Deut|Повт|Повторення Закону|Втор|Второзаконие|Deu|Deuteronomy
60 JOS Josh|Нав|Ісус Навин|Нав|Иисус Навин|Josh|Joshua
70 JDG Judg|Суд|Судді|Суд|Судьи|Judg|Judges
80 RUT Ruth|Рут|Рут|Руфь|Руфь|Ruth|Ruth
90 1SA 1Sam|1Сам|1 Самуїлова|1Цар|1-я Царств|1Sam|1 Samuel
100 2SA 2Sam|2Сам|2 Самуїлова|2Цар|2-я Царств|2Sam|2 Samuel
110 1KI 1Kgs|1Цар|1 Царів|3Цар|3-я Царств|1Kin|1 Kings
120 2KI 2Kgs|2Цар|2 Царів|4Цар|4-я Царств|2Kin|2 Kings
130 1CH 1Chr|1Хр|1 Хроніки|1Пар|1-я Паралипоменон|1Chr|1 Chronicles
140 2CH 2Chr|2Хр|2 Хроніки|2Пар|2-я Паралипоменон|2Chr|2 Chronicles
150 EZR Ezra|Езд|Ездра|Ездр|Ездра|Ezr|Ezra
160 NEH Neh|Неєм|Неемія|Неем|Неемия|Neh|Nehemiah
190 EST Esth|Ест|Естер|Есф|Есфирь|Esth|Esther
220 JOB Job|Йов|Йов|Иов|Иов|Job|Job
230 PSA Ps|Пс|Псалми|Пс|Псалтирь|Ps|Psalms
240 PRO Prov|Пр|Приповісті|Прит|Притчи|Prov|Proverbs
250 ECC Eccl|Еккл|Екклезіяст|Еккл|Екклесиаст|Eccl|Ecclesiastes
260 SNG Song|Пісн|Пісня над піснями|Песн|Песня Песней|Song|Song of Solomon
290 ISA Isa|Іс|Ісая|Ис|Исаия|Isa|Isaiah
300 JER Jer|Єр|Єремія|Иер|Иеремия|Jer|Jeremiah
310 LAM Lam|Плач|Плач Єремії|Плач|Плач Иеремии|Lam|Lamentations
330 EZK Ezek|Єз|Єзекіїль|Иез|Иезекииль|Ezek|Ezekiel
340 DAN Dan|Дан|Даниїл|Дан|Даниил|Dan|Daniel
350 HOS Hos|Ос|Осія|Ос|Осия|Hos|Hosea
360 JOL Joel|Йоіл|Йоїл|Иоил|Иоиль|Joel|Joel
370 AMO Amos|Ам|Амос|Ам|Амос|Am|Amos
380 OBA Obad|Овд|Овдій|Авд|Авдий|Oba|Obadiah
390 JON Jonah|Йон|Йона|Ион|Иона|Jona|Jonah
400 MIC Mic|Мих|Михей|Мих|Михей|Mic|Micah
410 NAM Nah|Наум|Наум|Наум|Наум|Nah|Nahum
420 HAB Hab|Ав|Авакум|Авв|Аввакум|Hab|Habakkuk
430 ZEP Zeph|Соф|Софонія|Соф|Софония|Zeph|Zephaniah
440 HAG Hag|Ог|Огій|Агг|Аггей|Hag|Haggai
450 ZEC Zech|Зах|Захарія|Зах|Захария|Zech|Zechariah
460 MAL Mal|Мал|Малахія|Мал|Малахия|Mal|Malachi
470 MAT Matt|Мт|Від Матвія|Мат|От Матфея|Mat|Matthew
480 MRK Mark|Мр|Від Марка|Мар|От Марка|Mar|Mark
490 LUK Luke|Лк|Від Луки|Лук|От Луки|Luk|Luke
500 JHN John|Ів|Від Івана|Ин|От Иоанна|John|John
510 ACT Acts|Дії|Дії|Деян|Деяния|Acts|Acts
520 ROM Rom|Рим|До римлян|Рим|К Римлянам|Rom|Romans
530 1CO 1Cor|1Кор|1 до коринтян|1Кор|1-е Коринфянам|1Cor|1 Corinthians
540 2CO 2Cor|2Кор|2 до коринтян|2Кор|2-е Коринфянам|2Cor|2 Corinthians
550 GAL Gal|Гал|До галатів|Гал|К Галатам|Gal|Galatians
560 EPH Eph|Еф|До ефесян|Еф|К Ефесянам|Eph|Ephesians
570 PHP Phil|Фил|До филип’ян|Флп|К Филиппийцам|Phil|Philippians
580 COL Col|Кол|До колосян|Кол|К Колоссянам|Col|Colossians
590 1TH 1Thess|1Сол|1 до солунян|1Фес|1-е Фессалоникийцам|1Ths|1 Thessalonians
600 2TH 2Thess|2Сол|2 до солунян|2Фес|2-е Фессалоникийцам|2Ths|2 Thessalonians
610 1TI 1Tim|1Тим|1 до Тимофія|1Тим|1-е Тимофею|1Tim|1 Timothy
620 2TI 2Tim|2Тим|2 до Тимофія|2Тим|2-е Тимофею|2Tim|2 Timothy
630 TIT Titus|Тит|До Тита|Тит|К Титу|Tit|Titus
640 PHM Phlm|Флм|До Филимона|Флм|К Филимону|Phlm|Philemon
650 HEB Heb|Євр|До євреїв|Евр|К Евреям|Heb|Hebrews
660 JAS Jas|Як|Якова|Иак|Иакова|Jam|James
670 1PE 1Pet|1Пет|1 Петра|1Пет|1-е Петра|1Pet|1 Peter
680 2PE 2Pet|2Пет|2 Петра|2Пет|2-е Петра|2Pet|2 Peter
690 1JN 1John|1Ів|1 Івана|1Ин|1-е Иоанна|1Jn|1 John
700 2JN 2John|2Ів|2 Івана|2Ин|2-е Иоанна|2Jn|2 John
710 3JN 3John|3Ів|3 Івана|3Ин|3-е Иоанна|3Jn|3 John
720 JUD Jude|Юд|Юди|Иуд|Иуды|Jud|Jude
730 REV Rev|Об|Об’явлення|Откр|Откровение|Rev|Revelation
165 1ES 1Esd|2Езд|2 Ездри|2Езд|2-я Ездры|1Esd|1 Esdras
170 TOB Tob|Тов|Товит|Тов|Товит|Tob|Tobit
180 JDT Jdt|Юдит|Юдит|Иудф|Иудифь|Jdt|Judith
192 ESG EsthGr|ЕстГр|Естер (грецька)|ЕсфГр|Есфирь (греческая)|EsthGr|Esther (Greek)
232 PS2 AddPs|Пс151|Псалом 151|Пс151|Псалом 151|Ps151|Psalm 151
235 PSS PssSol|ПсСол|Псалми Соломона|ПсСол|Псалмы Соломона|PsSol|Psalms of Solomon
245 ODA Odes|Оди|Оди|Оды|Оды|Odes|Odes
270 WIS Wis|Мудр|Мудрість Соломона|Прем|Премудрость Соломона|Wis|Wisdom
280 SIR Sir|Сир|Сирах|Сир|Сирах|Sir|Sirach
305 PRAZ PrAzar|МолАз|Молитва Азарії|МолАз|Молитва Азарии|PrAzar|Prayer of Azariah
315 LJE EpJer|ЛЄр|Лист Єремії|ПослИер|Послание Иеремии|EpJer|Letter of Jeremiah
320 BAR Bar|Вар|Варух|Вар|Варух|Bar|Baruch
323 S3Y SgThree|Пісн3|Пісня трьох отроків|Песн3|Песнь трёх отроков|S3y|Song of the Three Young Men
325 SUS Sus|Сус|Сусанна|Сус|Сусанна|Sus|Susanna
341 DAG DanGr|ДанГр|Даниїл (грецький)|ДанГр|Даниил (греческий)|DanGr|Daniel (Greek)
345 BEL Bel|Вил|Вил і змій|Вил|Вил и дракон|Bel|Bel and the Dragon
462 1MA 1Macc|1Мак|1 Макавеїв|1Мак|1-я Маккавейская|1Macc|1 Maccabees
464 2MA 2Macc|2Мак|2 Макавеїв|2Мак|2-я Маккавейская|2Macc|2 Maccabees
466 3MA 3Macc|3Мак|3 Макавеїв|3Мак|3-я Маккавейская|3Macc|3 Maccabees
467 4MA 4Macc|4Мак|4 Макавеїв|4Мак|4-я Маккавейская|4Macc|4 Maccabees
468 2ES 2Esd|3Езд|3 Ездри|3Езд|3-я Ездры|2Esd|2 Esdras
780 LAO EpLao|Лаод|До лаодикійців|Лаод|К Лаодикийцам|Laod|Laodiceans
790 MAN PrMan|МолМан|Молитва Манасії|МолМан|Молитва Манассии|PrMan|Prayer of Manasseh
`;

export interface BookName {
  short: string;
  long: string;
}

export interface BookEntry {
  number: number;
  code: string;
  osis: string;
  uk: BookName;
  ru: BookName;
  en: BookName;
}

/** How many of the table's books are the canon of 66 (they come first, in their order). */
const CANON = 66;

export const BOOKS: readonly BookEntry[] = TABLE.trim()
  .split('\n')
  .map((line) => {
    const [ids, ...names] = line.split('|');
    const [number, code, osis] = ids.split(' ');
    const name = (i: number): BookName => ({ short: names[i * 2], long: names[i * 2 + 1] });
    return { number: Number(number), code, osis, uk: name(0), ru: name(1), en: name(2) };
  });

const byNumber = new Map(BOOKS.map((b, at) => [b.number, { ...b, at }]));

/** Codes other writers of the same formats use for a book. */
const CODE_ALIASES: Record<string, string> = {
  SOL: 'SNG',
  SOS: 'SNG',
  EZE: 'EZK',
  JOE: 'JOL',
  NAH: 'NAM',
  MAR: 'MRK',
  JOH: 'JHN',
  PHI: 'PHP',
  JAM: 'JAS',
  '1JO': '1JN',
  '2JO': '2JN',
  '3JO': '3JN',
  ADE: 'ESG',
};
const OSIS_ALIASES: Record<string, string> = {
  addesth: 'esthgr',
  ps151: 'addps',
  s3y: 'sgthree',
  adddan: 'dangr',
};

const byCode = new Map(BOOKS.map((b) => [b.code, b.number]));
const byOsis = new Map(BOOKS.map((b) => [b.osis.toLowerCase(), b.number]));

/** A three-letter code (USFM, VPL) → our book number; null when the library has no such book. */
export function bookOfCode(code: string): number | null {
  const c = code.toUpperCase();
  return byCode.get(CODE_ALIASES[c] ?? c) ?? null;
}

/** An OSIS book id → our book number. */
export function bookOfOsis(id: string): number | null {
  const c = id.toLowerCase();
  return byOsis.get(OSIS_ALIASES[c] ?? c) ?? null;
}

/** Zefania's numbers past 66. */
const ZEFANIA_MORE: Record<number, number> = {
  67: 180,
  68: 270,
  69: 170,
  70: 280,
  71: 320,
  72: 462,
  73: 464,
  76: 790,
  77: 466,
  78: 467,
  79: 315,
  80: 165,
  81: 468,
  82: 245,
  83: 235,
};

/** A Zefania book number (1…66 in order, then the deuterocanonical ones) → ours. */
export function bookOfZefania(n: number): number | null {
  if (!Number.isInteger(n)) return null;
  if (n >= 1 && n <= CANON) return BOOKS[n - 1].number;
  return ZEFANIA_MORE[n] ?? null;
}

/** The names a book gets when its file gives none: the language's own, else English. */
export function defaultBookName(number: number, language: string): BookName {
  const b = byNumber.get(number);
  if (!b) return { short: String(number), long: String(number) };
  return language === 'uk' ? b.uk : language === 'ru' ? b.ru : b.en;
}

/** The colour of a book's section, as the .SQLite3 modules give it. */
export function bookColor(n: number): string {
  const b = byNumber.get(n);
  if (!b || b.at >= CANON) return '#c0c0c0';
  if (n <= 50) return '#ccccff';
  if (n <= 190) return '#ffcc99';
  if (n <= 260) return '#66ff99';
  if (n <= 340) return '#ff9fb4';
  if (n <= 460) return '#ffff99';
  if (n <= 500) return '#ff6600';
  if (n === 510) return '#00ffff';
  if (n <= 650) return '#ffff00';
  if (n <= 720) return '#00ff00';
  return '#ff7c80';
}
