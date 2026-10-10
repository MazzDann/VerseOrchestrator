import { type Slide } from '../presenterBus';
import { type BroadcastLook } from '../settingsStore';

/** The address OBS / vMix's browser source opens: the look in its query (OBS has no settings). */
export function broadcastUrl(origin: string, look: BroadcastLook): string {
  const q = new URLSearchParams({ look: look.look, bg: look.bg, band: look.band ? '1' : '0' });
  return `${origin}/key?${q}`;
}

/** Words to show: a verse, a song, own text — on screen, not hidden, not black. */
export function wordsOf(slide: Slide): boolean {
  return (
    slide.visible &&
    !slide.blank &&
    !slide.forceBlack &&
    slide.lines.length > 0 &&
    !slide.picture &&
    !slide.video &&
    !slide.cover &&
    !slide.qr
  );
}
