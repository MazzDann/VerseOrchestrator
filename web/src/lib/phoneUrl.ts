import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

/**
 * The address a phone can open for one of this app's pages. When the operator opened
 * the app on localhost (a phone can't reach that), this machine's LAN IP instead. Shared
 * by the QR panels (PhoneLink) and the viewers' QR on the output (1.5.16).
 */
export function usePhoneUrl(path: string): {
  url: string;
  lanIps: string[] | null;
  onLocalhost: boolean;
} {
  const [lanIps, setLanIps] = useState<string[] | null>(null);
  const onLocalhost = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(window.location.hostname);

  useEffect(() => {
    api
      .host()
      .then((r) => setLanIps(r.ips))
      .catch(() => setLanIps([]));
  }, []);

  const url = useMemo(() => {
    const { protocol, port, origin } = window.location;
    if (onLocalhost && lanIps?.[0])
      return `${protocol}//${lanIps[0]}${port ? `:${port}` : ''}${path}`;
    return `${origin}${path}`;
  }, [lanIps, onLocalhost, path]);

  return { url, lanIps, onLocalhost };
}
