/**
 * The desktop shell (branch feat/desktop, desktop/src/preload.cts): its windows carry
 * `window.voDesktop`. There the shell places the output windows and puts them fullscreen itself,
 * keeps one control window and no browser tabs — what only a browser needs is left out.
 */
export const inDesktop = (): boolean =>
  typeof window !== 'undefined' && !!(window as unknown as { voDesktop?: unknown }).voDesktop;
