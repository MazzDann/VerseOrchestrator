/**
 * Slides that failed to draw (0.13.0). `SlideCanvas` keeps its window showing the last
 * slide that did draw and reports the error here; an output window passes it on to the
 * control windows (lib/outputs.ts), and the control window tells the operator
 * (components/SlideErrorNotices.tsx).
 */
type Listener = (message: string) => void;

const listeners = new Set<Listener>();

export function reportSlideError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  for (const l of listeners) l(message);
}

export function onSlideError(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
