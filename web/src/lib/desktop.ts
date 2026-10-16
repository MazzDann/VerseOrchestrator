/**
 * The desktop shell (branch feat/desktop, desktop/src/preload.cts): its windows carry
 * `window.voDesktop`. There the shell places the output windows and puts them fullscreen itself,
 * keeps one control window and no browser tabs — what only a browser needs is left out.
 */
export const inDesktop = (): boolean =>
  typeof window !== 'undefined' && !!(window as unknown as { voDesktop?: unknown }).voDesktop;

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
