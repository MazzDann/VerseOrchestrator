/**
 * Transport between the control window and the presenter window.
 *
 * Abstraction boundary: the rest of the app only calls publishSlide / readSlide
 * / subscribeSlide. Today this is backed by BroadcastChannel + localStorage
 * (same-origin, no server). To support a second device or a Tauri/Electron
 * wrapper later, swap the implementation here without touching the UI.
 */

export interface SlideLine {
  translationAbbr: string;
  text: string;
  rtl: boolean;
}

export interface Slide {
  lines: SlideLine[];
  reference: string;
  blank: boolean;
  visible: boolean;
}

export const EMPTY_SLIDE: Slide = { lines: [], reference: '', blank: false, visible: false };

const CHANNEL_NAME = 'verse-orchestrator';
const STORAGE_KEY = 'vo:slide';

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

export function publishSlide(slide: Slide): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slide));
  } catch {
    /* ignore quota/availability errors */
  }
  channel?.postMessage(slide);
}

export function readSlide(): Slide {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Slide;
  } catch {
    /* ignore parse errors */
  }
  return EMPTY_SLIDE;
}

export function subscribeSlide(cb: (slide: Slide) => void): () => void {
  if (!channel) return () => {};
  const handler = (e: MessageEvent) => cb(e.data as Slide);
  channel.addEventListener('message', handler);
  return () => channel.removeEventListener('message', handler);
}
