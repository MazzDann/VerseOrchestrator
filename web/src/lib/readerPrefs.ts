/**
 * How a viewer likes to read on their own phone (/follow, 0.6.17) — kept in that phone's
 * browser only (localStorage), never sent anywhere. The user's examples: an older reader
 * who needs the text bigger and bolder; a reader with dyslexia.
 */
export interface ReaderPrefs {
  /** step on the size scale (READER_SIZES) */
  size: number;
  bold: boolean;
  /**
   * «Легше читати»: Andika (SIL's literacy font, served with the app — styles.css), wider
   * letter / word / line spacing, left-aligned — the usual dyslexia-friendly advice.
   */
  easy: boolean;
}

/** Multipliers of the page's base size (clamp(20px, 6.2vw, 40px)); step 1 = as before. */
export const READER_SIZES = [0.85, 1, 1.2, 1.45, 1.75] as const;

export const DEFAULT_READER: ReaderPrefs = { size: 1, bold: false, easy: false };

const KEY = 'vo:followReader';

export function sanitizeReader(raw: unknown): ReaderPrefs {
  const r = (raw ?? {}) as Partial<Record<keyof ReaderPrefs, unknown>>;
  const size = Number(r.size);
  return {
    size:
      Number.isInteger(size) && size >= 0 && size < READER_SIZES.length
        ? size
        : DEFAULT_READER.size,
    bold: r.bold === true,
    easy: r.easy === true,
  };
}

export function loadReader(): ReaderPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitizeReader(JSON.parse(raw)) : DEFAULT_READER;
  } catch {
    return DEFAULT_READER; // private mode / blocked storage: defaults, the page still works
  }
}

export function saveReader(p: ReaderPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* not saved — it still applies until the page is closed */
  }
}

/** The text style for a reader's choices (slide text; `font` = the slide's own font). */
export function readerTextStyle(p: ReaderPrefs, font: string) {
  const k = READER_SIZES[p.size] ?? 1;
  return {
    fontFamily: p.easy ? 'Andika, Verdana, "Segoe UI", Roboto, system-ui, sans-serif' : font,
    fontSize: `calc(clamp(20px, 6.2vw, 40px) * ${k})`,
    fontWeight: p.bold ? 700 : undefined,
    lineHeight: p.easy ? 1.8 : 1.45,
    letterSpacing: p.easy ? '0.05em' : undefined,
    wordSpacing: p.easy ? '0.18em' : undefined,
    textAlign: p.easy ? ('left' as const) : undefined,
  };
}
