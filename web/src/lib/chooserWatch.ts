/**
 * A file chooser in the control window and the full-screen output windows (2026-10-10, two screens
 * on the test Windows, Edge 154): Chromium takes every full-screen window this page opened out of
 * full screen while a file chooser is open — «Додати зображення», a song import, a backup to
 * restore — so the projector showed a framed browser window. Same with «Окремий процес» and with
 * showOpenFilePicker. The page can't prevent it; it can put them back: the windows that were full
 * screen when a chooser opened and aren't when it closed are reported (`dropped`) — the control
 * window lends its next click to them and says so (lib/fullscreenNotices.ts).
 */
export interface WatchedOutput {
  id: string;
  fullscreen: boolean;
}

export interface ChooserWatch {
  /** a file chooser is opening in this window: remember which outputs are full screen */
  opening(): void;
  /** it closed (this window has the focus again, the input changed, or it was cancelled) */
  closed(): void;
}

export function createChooserWatch<O extends WatchedOutput>(deps: {
  outputs: () => O[];
  dropped: (o: O) => void;
  /** after the chooser closed: the outputs' own reports of leaving full screen have arrived */
  later?: (fn: () => void, ms: number) => void;
  settleMs?: number;
}): ChooserWatch {
  const later = deps.later ?? ((fn, ms) => void setTimeout(fn, ms));
  const settleMs = deps.settleMs ?? 400;
  let before: Set<string> | null = null;
  return {
    opening() {
      before = new Set(
        deps
          .outputs()
          .filter((o) => o.fullscreen)
          .map((o) => o.id),
      );
    },
    closed() {
      const was = before;
      before = null; // the focus, the change and the cancel of one chooser: one check
      if (!was?.size) return;
      later(() => {
        for (const o of deps.outputs()) if (was.has(o.id) && !o.fullscreen) deps.dropped(o);
      }, settleMs);
    },
  };
}
