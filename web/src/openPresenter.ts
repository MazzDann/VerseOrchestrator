/**
 * Open an output route (`/presenter`, `/stage`) in its own window. When the
 * Window Management API is available (Chrome/Edge, after a one-time permission
 * prompt) the window is placed on a secondary monitor; otherwise we fall back to
 * a plain pop-up the user drags over.
 */
export async function openOutputWindow(
  path: string,
  name: string,
  fallback = 'width=1280,height=720',
): Promise<Window | null> {
  const url = `${location.origin}${path}`;

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
        return window.open(url, name, features);
      }
    }
  } catch {
    /* permission denied or API unavailable -> fall through */
  }

  return window.open(url, name, `popup,${fallback}`);
}

/** Open the presenter (audience) output window on a secondary monitor if possible. */
export function openPresenterWindow(): Promise<Window | null> {
  return openOutputWindow('/presenter', 'vo-presenter');
}

/** Open the stage-display (operator/speaker confidence) window. */
export function openStageWindow(): Promise<Window | null> {
  return openOutputWindow('/stage', 'vo-stage', 'width=1100,height=700');
}
