/**
 * A control window on another computer (`/desk`, 1.9.0-beta.1, F1005-10): the pieces that need
 * no React — the link's token, what the pairing allows.
 */

/**
 * The token in a desk link someone pasted: the whole address, its `#…` part or the code alone
 * (base64url, 24 characters from the server). Null when there is none to be found.
 */
export function deskTokenOf(input: string): string | null {
  const t = input.trim();
  const raw = t.includes('#') ? t.slice(t.indexOf('#') + 1) : t;
  let token: string;
  try {
    token = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return /^[\w-]{10,128}$/.test(token) ? token : null;
}
