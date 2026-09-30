/** A text field, where the arrows move the caret. */
export function isFormField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''));
}

/**
 * The nearest box that scrolls around `el` (the focused list), else around the first element
 * matching `fallback` (the verses) — what Alt+↑/↓ scroll (1.1.0).
 */
export function scrollableAround(el: Element | null, fallback: string): HTMLElement | null {
  const up = (from: Element | null): HTMLElement | null => {
    for (let e = from as HTMLElement | null; e && e !== document.body; e = e.parentElement) {
      const oy = getComputedStyle(e).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight) return e;
    }
    return null;
  };
  return up(el) ?? up(document.querySelector(fallback));
}
