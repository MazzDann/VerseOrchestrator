import type { RemoteCommand } from '../api';
import type { Slide, SlideCountdown } from '../presenterBus';

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

/**
 * May this desk press it? The hub's own checks (server/src/live.ts onCommand), so a button the
 * operator didn't allow is greyed instead of refused after a round trip: a button needs its own
 * permission; verses need «Вибір віршів», a stanza «Пісні», an item or the queue «Послідовність».
 */
export function mayPress(
  allowed: readonly RemoteCommand[],
  cmd: RemoteCommand,
  carries?: 'verses' | 'song' | 'item',
): boolean {
  if (cmd !== 'pick' && cmd !== 'queue' && !allowed.includes(cmd)) return false;
  if (carries === 'verses' && !allowed.includes('pick')) return false;
  if (carries === 'song' && !allowed.includes('songs')) return false;
  if ((carries === 'item' || cmd === 'queue') && !allowed.includes('playlist')) return false;
  return true;
}

/**
 * «Далі» / «Назад» over verses the desk put on screen: the next block of as many verses after
 * the last one shown (before the first going back), in the chapter's own numbering. Null at the
 * chapter's edge, or when the verses shown aren't in it.
 */
export function stepVerses(
  chapterVerses: readonly number[],
  shown: readonly number[],
  delta: 1 | -1,
): number[] | null {
  if (shown.length === 0) return null;
  const edge = delta > 0 ? shown[shown.length - 1] : shown[0];
  const at = chapterVerses.indexOf(edge);
  if (at < 0) return null;
  const block =
    delta > 0
      ? chapterVerses.slice(at + 1, at + 1 + shown.length)
      : chapterVerses.slice(Math.max(0, at - shown.length), at);
  return block.length > 0 ? block : null;
}

/** The viewers' countdown on a slide: in a corner (1.8.7), or on «Заставка». */
export function liveCountdown(s: Slide | null): SlideCountdown | null {
  if (!s) return null;
  return s.cornerCountdown ?? (s.cover && s.countdown ? s.countdown : null);
}
