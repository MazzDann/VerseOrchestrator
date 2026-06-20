/**
 * Open the presenter route in its own window. When the Window Management API is
 * available (Chrome/Edge, after a one-time permission prompt) the window is
 * placed on a secondary monitor and offered fullscreen; otherwise we fall back
 * to a plain pop-up the user drags over.
 */
export async function openPresenterWindow(): Promise<Window | null> {
  const url = `${location.origin}/presenter`;

  try {
    const anyWin = window as unknown as {
      getScreenDetails?: () => Promise<{
        screens: Array<{
          isPrimary: boolean;
          availLeft: number;
          availTop: number;
          availWidth: number;
          availHeight: number;
        }>;
      }>;
    };
    if (typeof anyWin.getScreenDetails === 'function') {
      const details = await anyWin.getScreenDetails();
      const external = details.screens.find((s) => !s.isPrimary);
      if (external) {
        const features = `popup,left=${external.availLeft},top=${external.availTop},width=${external.availWidth},height=${external.availHeight}`;
        return window.open(url, 'vo-presenter', features);
      }
    }
  } catch {
    /* permission denied or API unavailable -> fall through */
  }

  return window.open(url, 'vo-presenter', 'popup,width=1280,height=720');
}
