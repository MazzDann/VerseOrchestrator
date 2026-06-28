import { useCallback, useEffect, useRef, type DependencyList } from 'react';

/**
 * Fit multi-line content to its container by binary-searching the largest font
 * size that does not overflow (both width and height). Re-fits on container
 * resize, on `deps` change (font/alignment), and — crucially — whenever the
 * content OR container element (re)mounts, so animated slide swaps refit correctly.
 *
 * Both refs are CALLBACK refs: when the framer-motion `AnimatePresence` swaps a
 * slide, the whole box+content subtree remounts as new DOM nodes. The container
 * callback re-points the ResizeObserver at the new box, and every (re)mount
 * schedules a fit on the next animation frame (so layout has settled and both
 * refs are attached — a plain ref-object container would still be null when the
 * child content ref fires, leaving the new content at its inherited font size).
 */
export function useAutoFit(deps: DependencyList, min = 6, max = 240, maxCqh?: number) {
  const containerEl = useRef<HTMLDivElement | null>(null);
  const contentEl = useRef<HTMLElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef(0);
  const timerRef = useRef(0);

  const fit = useCallback(() => {
    const container = containerEl.current;
    const content = contentEl.current;
    if (!container || !content) return;
    let lo = min;
    // Cap the upper bound at `maxCqh`% of the SLIDE height when given (faithful pptx
    // songs: never exceed the original font size — shrink to fit like PowerPoint).
    // cqh is relative to the slide (the container-type:size root), not the (smaller)
    // quote box, so measure against the box's positioned ancestor when present.
    let hi = max;
    if (maxCqh != null && maxCqh > 0) {
      const slideH = (container.offsetParent as HTMLElement | null)?.clientHeight ?? container.clientHeight;
      hi = Math.min(max, Math.max(min, Math.floor((maxCqh / 100) * slideH)));
    }
    let best = min;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      content.style.fontSize = `${mid}px`;
      const fits =
        content.scrollHeight <= container.clientHeight &&
        content.scrollWidth <= container.clientWidth;
      if (fits) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    content.style.fontSize = `${best}px`;
  }, [min, max, maxCqh]);

  // Fit next frame (refs attached) AND again shortly after, because on initial mount
  // the box can be measured before its final size settles (percentage heights under
  // `container-type: size`, framer-motion enter) — the first pass would otherwise
  // lock in a too-large size and never refit.
  const scheduleFit = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(timerRef.current);
    rafRef.current = requestAnimationFrame(fit);
    timerRef.current = window.setTimeout(fit, 120);
  }, [fit]);

  // Container callback ref: re-point the ResizeObserver at the current box and refit.
  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      containerEl.current = el;
      roRef.current?.disconnect();
      if (el) {
        const ro = new ResizeObserver(() => fit());
        ro.observe(el);
        roRef.current = ro;
        scheduleFit();
      }
    },
    [fit, scheduleFit],
  );

  // Content callback ref: refit whenever the (re-mounted) content attaches.
  const contentRef = useCallback(
    (el: HTMLElement | null) => {
      contentEl.current = el;
      if (el) scheduleFit();
    },
    [scheduleFit],
  );

  // Re-fit on dependency changes (slide key / font / alignment).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => scheduleFit(), deps);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timerRef.current);
    },
    [],
  );

  return { containerRef, contentRef };
}
