/**
 * «Мигає при прокручуванні» (user, 1.5.5): scrolling a long psalm with the mouse wheel moved
 * row after row under the still pointer, and each one lit up with the hover background for
 * a moment (30 of 30 wheel steps in a measured run) — the search list moved its highlight
 * and re-rendered on every row too. While anything scrolls, `<html data-scrolling>` is set
 * (and cleared 150 ms after the last scroll event), so CSS drops hover backgrounds and code
 * can ignore pointer-enter noise. One capture listener for the whole page, no React state.
 */

const QUIET_MS = 150;
let timer: number | undefined;
let installed = false;

export function installScrollingFlag(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const root = document.documentElement;
  document.addEventListener(
    'scroll',
    () => {
      if (!root.hasAttribute('data-scrolling')) root.setAttribute('data-scrolling', '');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => root.removeAttribute('data-scrolling'), QUIET_MS);
    },
    { capture: true, passive: true },
  );
}

/** Is something scrolling right now? (pointer events meanwhile come from content moving) */
export const isScrolling = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.hasAttribute('data-scrolling');
