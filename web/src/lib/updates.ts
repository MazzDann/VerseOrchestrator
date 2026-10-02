import { useQuery } from '@tanstack/react-query';
import { api, type CodeState, type UpdateState } from '../api';
import { useServer } from '../serverStore';

/** Is there a newer version (1.0.0)? Shared by «Оновлення» in the settings and the settings button's dot. */
export function useUpdateState(): UpdateState | undefined {
  const serverAvailable = useServer((s) => s.available);
  return useQuery({
    queryKey: ['update'],
    queryFn: api.update,
    enabled: serverAvailable === true,
    staleTime: 60 * 60 * 1000,
    // every second while an update downloads, checks or unpacks
    refetchInterval: (q) =>
      BUSY.has(q.state.data?.installer?.phase ?? 'idle') ? 1000 : 6 * 60 * 60 * 1000,
    // a download goes on while the operator looks elsewhere: back here, it isn't stuck at 1 MB
    refetchIntervalInBackground: true,
    retry: false,
  }).data;
}

const BUSY = new Set(['download', 'verify', 'unpack']);

/**
 * A copy of the repository (upd2, 1.6.0): has its code changed under it? Asked once a minute —
 * a `git pull` shows up in «Оновлення» and as the settings button's dot without a reload. null in
 * a release copy (and before the first answer).
 */
export function useCodeState(): CodeState | null {
  const serverAvailable = useServer((s) => s.available);
  const install = useUpdateState()?.install;
  return (
    useQuery({
      queryKey: ['update-code'],
      queryFn: api.codeState,
      enabled: serverAvailable === true && install === 'source',
      refetchInterval: 60_000,
      retry: false,
    }).data ?? null
  );
}

/**
 * After «Перезапустити» (1.6.0): the app goes away while the launcher prepares the new code (a
 * UI build, maybe npm ci — minutes the first time), then comes back on the same address.
 * Resolves true once another server answers — `boot` (GET /api/health) other than the one that
 * restarted — or one answers again after it was seen away. Not by «away» alone: with nothing to
 * build the app is away for well under a second, between two looks (measured: 0.4 s); nor by the
 * label, which a copy without release tags shares across commits.
 */
export async function waitForRelaunch(boot: string, ms = 600_000): Promise<boolean> {
  const sleep = () => new Promise((r) => setTimeout(r, 500));
  let wentAway = false;
  for (const end = Date.now() + ms; Date.now() < end; ) {
    await sleep();
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const health = (await res.json()) as { boot?: string };
      if (res.ok && ((health.boot && health.boot !== boot) || wentAway)) return true;
    } catch {
      wentAway = true;
    }
  }
  return false;
}

/**
 * After «Перезапустити й оновити»: the app goes away, the new version (or, when it fails, the old
 * one again) comes back on the same address. Resolves once it answers — the page then reloads.
 */
export async function waitForRestart(to: string, ms = 180_000): Promise<boolean> {
  const sleep = () => new Promise((r) => setTimeout(r, 1000));
  let wentAway = false;
  let back = false;
  for (const end = Date.now() + ms; !back && Date.now() < end; ) {
    await sleep();
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const { version } = (await res.json()) as { version?: string };
      back = version === to || (wentAway && res.ok);
    } catch {
      wentAway = true;
    }
  }
  if (!back) return false;
  // the helper writes how it went a moment after the new version first answers: wait for it,
  // so the reloaded page says «Оновлено з … до …»
  for (const end = Date.now() + 15_000; Date.now() < end; await sleep()) {
    try {
      const s = (await (await fetch('/api/update', { cache: 'no-store' })).json()) as UpdateState;
      if (s.lastUpdate?.to === to) break;
    } catch {
      /* try again */
    }
  }
  return true;
}
