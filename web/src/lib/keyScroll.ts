/** A text field, where the arrows move the caret. */
export function isFormField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''));
}

/**
 * A field the caret types in (1.8.12-beta.7): a text input or area — not a radio («Точний показ /
 * Простий текст»), a checkbox, or a Select's read-only input, whose arrows the song may take.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const input = el as HTMLInputElement;
  return !input.readOnly && /^(text|search|number|email|url|tel|password)$/.test(input.type);
}

/**
 * Inside an open menu, list or pop-up (1.10.5, the Mac's round): its arrows are its own — the «+»
 * menu's items, a Select's options, an item editor — not the open song's stanzas.
 */
export function inOverlay(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.closest) return false;
  // an open Select says so by `data-expanded` (Mantine's Combobox has no aria-expanded there)
  const open =
    el.getAttribute('aria-expanded') === 'true' || el.getAttribute('data-expanded') != null;
  return (
    (open && el.hasAttribute('aria-haspopup')) ||
    !!el.closest('[role="menu"], [role="listbox"], .mantine-Popover-dropdown')
  );
}

/** A resize control's step for one arrow key press, in px. */
export const RESIZE_KEY_STEP = 16;

/**
 * What an arrow key does on a focused resize control (ResizeHandle, a floating panel's grip)
 * that resizes along `axes` ('x', 'y' or 'xy', its `data-resize-keys`): a step along the screen
 * (→ / ↓ positive), or null when the key is not the control's — another key, the other axis, or
 * a chord (Ctrl / ⌘ / ⌥ + arrow: the preview's step, Alt+↑/↓ scrolling), which stays the app's.
 * The keys it does take are the control's alone: before 1.4.6 ↑/↓ on a focused handle also went
 * on to «Далі» / «Назад» and, «Наживо», changed the screen (review of the Mac fix).
 */
export function resizeKeyStep(
  axes: string | null | undefined,
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
): { dx: number; dy: number } | null {
  if (!axes || e.ctrlKey || e.metaKey || e.altKey) return null;
  const s = RESIZE_KEY_STEP;
  if (axes.includes('x') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))
    return { dx: e.key === 'ArrowRight' ? s : -s, dy: 0 };
  if (axes.includes('y') && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))
    return { dx: 0, dy: e.key === 'ArrowDown' ? s : -s };
  return null;
}

/**
 * The key goes to the focused resize control (resizeKeyStep), not to the show: listeners that
 * run before it — capture phase, as the open song's stanza keys — leave it alone.
 */
export function isResizeKey(e: KeyboardEvent): boolean {
  const el = e.target as Element | null;
  return resizeKeyStep(el?.getAttribute?.('data-resize-keys'), e) !== null;
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
