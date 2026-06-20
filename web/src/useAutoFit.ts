import { useLayoutEffect, useRef, type DependencyList } from 'react';

/**
 * Fit multi-line content to its container by binary-searching the largest font
 * size that does not overflow (both width and height). Re-fits on container
 * resize and whenever `deps` change. Suited to wrapped verse paragraphs, where
 * single-line fitters (e.g. fitty) do not apply.
 */
export function useAutoFit(deps: DependencyList, min = 14, max = 240) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const fit = () => {
      let lo = min;
      let hi = max;
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
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { containerRef, contentRef };
}
