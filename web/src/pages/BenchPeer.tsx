import { useEffect, useState } from 'react';
import { openLink, type BenchMsg, type Link } from '../lib/bench/sync';
import { tr, useLang } from '../i18n';

/**
 * The other end of the sync benchmark (`/bench/peer`, opened by /bench): listens on
 * every in-browser transport and answers each ping with a tiny pong on the same one.
 */
export function BenchPeer() {
  useLang();
  const [pings, setPings] = useState(0);

  useEffect(() => {
    const back = window.opener ?? (window.parent !== window ? window.parent : null);
    const links: Link[] = (['broadcast', 'storage', 'postmessage', 'sharedworker'] as const).map(
      (t) => openLink(t, 'peer', back),
    );
    let n = 0;
    const offs = links.map((link) =>
      link.onMessage((m: BenchMsg) => {
        if (m.k !== 'ping') return;
        link.send({ k: 'pong', id: m.id });
        if (++n % 50 === 0) setPings(n);
      }),
    );
    const hello = new BroadcastChannel('vo-bench-sync');
    hello.postMessage({ k: 'ready', id: 0 } satisfies BenchMsg);
    hello.close();
    return () => {
      offs.forEach((off) => off());
      links.forEach((l) => l.close());
    };
  }, []);

  return (
    <div
      style={{
        padding: 16,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 13,
        color: 'var(--mantine-color-dimmed)',
      }}
    >
      {tr('Партнер тесту синхронізації — вікно закриється саме. Відповідей: {n}', { n: pings })}
    </div>
  );
}
