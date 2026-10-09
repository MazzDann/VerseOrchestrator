import { useCallback, useState } from 'react';

/**
 * What the phone remote shows (1.11.0-beta.3): «Пульт» — its buttons, or «Сцена» — what the speaker
 * watches (the screen's text, «Далі», the timer, the message), no buttons. Kept on that phone only.
 */
export type RemoteView = 'remote' | 'stage';

const KEY = 'vo:remoteView';

export function loadRemoteView(): RemoteView {
  try {
    return localStorage.getItem(KEY) === 'stage' ? 'stage' : 'remote';
  } catch {
    return 'remote'; // private mode / blocked storage
  }
}

export function useRemoteView(): [RemoteView, (v: RemoteView) => void] {
  const [view, setView] = useState<RemoteView>(loadRemoteView);
  const set = useCallback((v: RemoteView) => {
    setView(v);
    try {
      if (v === 'remote') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, v);
    } catch {
      /* not saved — it still applies until the page is closed */
    }
  }, []);
  return [view, set];
}
