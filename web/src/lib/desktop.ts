/**
 * The desktop shell (branch feat/desktop, desktop/src/preload.cts): its windows carry
 * `window.voDesktop`. There the shell places the output windows and puts them fullscreen itself,
 * keeps one control window and no browser tabs — what only a browser needs is left out.
 */
export const inDesktop = (): boolean =>
  typeof window !== 'undefined' && !!(window as unknown as { voDesktop?: unknown }).voDesktop;

/**
 * «Відкривати вікно показу автоматично» as it stands (1.21.1, F1107): the operator's choice, or —
 * not chosen — on in the desktop app (it opens the window full-screen on the 2nd screen by itself)
 * and off in a browser (a pop-up there waits for a click and the window-management permission).
 */
export const outputAtStartOn = (choice: boolean | null): boolean => choice ?? inDesktop();

/** Does the running shell put a reloaded full-screen output window back full screen (1.25.3)? */
export const reloadKeepsFullscreen = (): boolean =>
  typeof window !== 'undefined' &&
  (window as unknown as { voDesktop?: { reloadKeepsFullscreen?: boolean } }).voDesktop
    ?.reloadKeepsFullscreen === true;

/**
 * Is there a second screen to open the presentation window on? On one screen it would cover the
 * control window (1.25.2, the author: «мало ж тільки на двох»). A browser that doesn't say
 * (Firefox, Safari) is taken to have one: there the operator switched it on.
 */
export const hasSecondScreen = (): boolean =>
  typeof screen === 'undefined' ||
  (screen as unknown as { isExtended?: boolean }).isExtended !== false;

/**
 * «Налаштування — окремим вікном» as it stands (1.24.1, the author): the operator's choice, or — not
 * chosen — a window of their own in the desktop app and the panel in the control window in a browser.
 */
export const settingsWindowOn = (choice: boolean | null): boolean => choice ?? inDesktop();

/**
 * «Поступитися екраном» for a video (1.21.0-beta.7, F1024-08): ask the desktop shell to drop this
 * output window's always-on-top (on = true) so the operator's own player can come forward on the
 * 2nd screen, or take the screen back (on = false). The page stays fullscreen; only the always-on-top
 * changes. A no-op in a browser (there the output window leaves fullscreen itself to uncover).
 */
export function desktopOutputYield(on: boolean): void {
  const d = (window as unknown as { voDesktop?: { outputYield?: (on: boolean) => void } })
    .voDesktop;
  d?.outputYield?.(on === true);
}

/**
 * A minimized output window asks the desktop shell to come back (F1107-03): something new went on
 * screen, or «Вікно показу» was pressed. Restored without taking the keyboard from the control
 * window, full-screen again. A no-op in a browser and for a window that isn't minimized.
 */
export function desktopOutputRestore(): void {
  const d = (window as unknown as { voDesktop?: { outputRestore?: () => void } }).voDesktop;
  d?.outputRestore?.();
}

/**
 * A 2nd screen plugged back in (1.24.0-beta.2): the shell returned `n` output windows to it. A no-op
 * outside the app (or in an older shell).
 */
export function onDesktopDisplayBack(cb: (n: number) => void): () => void {
  const d = (
    window as unknown as {
      voDesktop?: { onDisplayBack?: (cb: (n: number) => void) => () => void };
    }
  ).voDesktop;
  return d?.onDisplayBack?.(cb) ?? (() => undefined);
}

/**
 * Control went to the desktop app (1.18.1: the hub's `movedId: 'desktop'` — «Відкрити застосунок»,
 * or the app opened after «Встановити застосунок»): a browser's control window closes itself; a
 * tab the browser keeps (one the user opened) goes to a page that says where the show is.
 */
export function leaveForDesktop(): void {
  if (inDesktop()) return;
  window.close();
  window.setTimeout(() => window.location.replace('/in-app.html'), 400);
}
