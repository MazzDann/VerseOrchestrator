import { useCallback, useEffect, useRef, type DependencyList } from 'react';

/**
 * Fit multi-line content to its container by binary-searching the largest font
 * size that does not overflow (both width and height). Re-fits on container
 * resize, on `deps` change (font/alignment), and — crucially — whenever the
 * content element itself (re)mounts, so animated slide swaps refit correctly.
 *
 * `contentRef` is a callback ref: attach it to the element that re-mounts per
 * slide. The low `min` lets long passages shrink enough to stay on screen.
 */
export function useAutoFit(deps: DependencyList, min = 6, max = 240, maxCqh?: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement | null>(null);

  const fit = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    let lo = min;
    // Cap the upper bound at `maxCqh`% of the container height when given (faithful
    // pptx songs: never exceed the original font size — shrink to fit like PowerPoint).
    let hi = max;
    if (maxCqh != null && maxCqh > 0) {
      hi = Math.min(max, Math.max(min, Math.floor((maxCqh / 100) * container.clientHeight)));
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

  // Fit whenever the (re-mounted) content element attaches.
  const setContentRef = useCallback(
    (el: HTMLElement | null) => {
      contentRef.current = el;
      if (el) fit();
    },
    [fit],
  );

  // Re-fit on dependency changes (font/alignment).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => fit(), deps);

  // Re-fit when the container resizes (window/screen changes).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(container);
    return () => ro.disconnect();
  }, [fit]);

  return { containerRef, contentRef: setContentRef };
}
