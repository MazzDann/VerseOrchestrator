/**
 * A name the operator gives a picture, an album or a video (1.14.0-beta.1, «Перейменувати» — the
 * author's Q16: the app's name only, the files on disk stay as they are): one line, no control
 * characters, NFC, at most 120 characters; nothing left = no name (refused).
 */
export function givenName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC')
    .slice(0, 120)
    .trim();
  return name || null;
}
