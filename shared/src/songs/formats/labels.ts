/** A line that names the section under it: «Приспів:», «[Chorus 2]», «Куплет 1», «Verse 3:». */
export interface SectionLabel {
  kind: 'chorus' | 'verse';
  /** a chorus's label as the list shows it, when it says more than the word itself */
  label?: string;
}

// i18n-ignore-next: words in song files
const CHORUS = /^(приспів|припев|chorus|refrain)(?![\p{L}])/iu; // i18n-ignore
const VERSE =
  /^(?:\d{1,2}\s*[-.]?\s*(?:й|ий|st|nd|rd|th)?\s*)?(куплет|строфа|verse|stanza|strophe|couplet|bridge|брідж|бридж|intro|вступ|outro|ending|кінцівка|tag|pre-?chorus|передприспів|предприпев)\s*\d{0,2}$/iu; // i18n-ignore

/** Longer than this is a line of the song that begins with such a word. */
const LABEL_MAX = 40;

export function sectionLabel(line: string): SectionLabel | null {
  // a label is short: a long line is never searched for one
  if (line.length > LABEL_MAX * 2) return null;
  const bare = line.trim().replace(/^\[\s*|\s*\]$/g, '');
  const s = bare.replace(/[:.\s]+$/, '');
  if (!s || s.length > LABEL_MAX) return null;
  if (VERSE.test(s)) return { kind: 'verse' };
  if (!CHORUS.test(s)) return null;
  const more = s.replace(CHORUS, '').trim();
  // the word alone, a number or a note in brackets after it — else the words of a song
  if (!/^(\d{1,2}|\(.*\)|[xх×]\s*\d|\d\s*[xх×])?$/iu.test(more)) return null; // i18n-ignore
  return more ? { kind: 'chorus', label: `${s}:` } : { kind: 'chorus' };
}
