/**
 * Open floating panels in z-order (last = frontmost). Clicking a panel moves it to the end,
 * so Escape dismisses the one the operator is actually working in (components/FloatingPanel).
 */
export const openStack: symbol[] = [];
export const stackListeners = new Set<() => void>();
export const notifyStack = () => stackListeners.forEach((l) => l());

/**
 * Is a floating panel open? Its Escape closes that panel — and must do only that: the
 * page-wide hotkeys (react-hotkeys-hook, on `document`) see the key BEFORE the panel's
 * window listener, so «Очистити» on Esc used to blank the screen too (Mac re-check,
 * 0.6.12). They ask this first.
 */
export function floatingPanelOpen(): boolean {
  return openStack.length > 0;
}
