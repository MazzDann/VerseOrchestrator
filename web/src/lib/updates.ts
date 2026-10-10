import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIntersection } from '@mantine/hooks';
import { api, type CodeState, type UpdateState } from '../api';
import { useServer } from '../serverStore';
import { FIRST_FOREIGN_SAFE, KIND_SINCE, type SeqItem } from '../playlistStore';

/** Is there a newer version (1.0.0)? Shared by «Оновлення» in the settings and the settings button's dot. */
export function useUpdateState(): UpdateState | undefined {
  const serverAvailable = useServer((s) => s.available);
  return useQuery({
    queryKey: ['update'],
    queryFn: () => api.update(),
    enabled: serverAvailable === true,
    staleTime: 60 * 60 * 1000,
    // every second while an update downloads, checks or unpacks; else hourly, as the server
    // looks (1.12.3 — six hours before)
    refetchInterval: (q) =>
      BUSY.has(q.state.data?.installer?.phase ?? 'idle') ? 1000 : 60 * 60 * 1000,
    // a download goes on while the operator looks elsewhere: back here, it isn't stuck at 1 MB
    refetchIntervalInBackground: true,
    retry: false,
  }).data;
}

const BUSY = new Set(['download', 'verify', 'unpack']);

/**
 * «Оновлення» in sight (1.12.3): the server asks GitHub again when its answer is older than ten
 * minutes — a release out this morning shows now, not at the next look (users' report F1010-01b:
 * «У вас остання версія», checked hours before a fix came out). The ref goes on the section.
 */
export function useFreshUpdate() {
  const serverAvailable = useServer((s) => s.available);
  const queryClient = useQueryClient();
  const { ref, entry } = useIntersection<HTMLDivElement>();
  const inSight = !!entry?.isIntersecting;
  useEffect(() => {
    if (!inSight || serverAvailable !== true) return;
    api.update(true).then(
      (s) => queryClient.setQueryData(['update'], s),
      () => {}, // the hourly look tries again
    );
  }, [inSight, serverAvailable, queryClient]);
  return ref;
}

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*))?$/;

/**
 * The kinds of item in these lists (the running order, the saved programs) that `version` fails
 * on (1.9.1): before 1.9.1 a kind it doesn't know keeps its control window from opening. In the
 * order of `KIND_SINCE`; an item of a version newer than this one is `foreign`.
 */
export function kindsBreaking(
  version: string,
  lists: readonly (readonly SeqItem[])[],
): SeqItem['kind'][] {
  if (compareVersions(version, FIRST_FOREIGN_SAFE) >= 0) return [];
  const found = new Set(lists.flatMap((l) => l.map((it) => it.kind)));
  const kinds = Object.keys(KIND_SINCE) as (keyof typeof KIND_SINCE)[];
  const out: SeqItem['kind'][] = kinds.filter(
    (k) => found.has(k) && compareVersions(version, KIND_SINCE[k]) < 0,
  );
  if (found.has('foreign')) out.push('foreign');
  return out;
}

/**
 * Negative, zero or positive, like a sort comparator (server/src/updates.ts compareVersions):
 * semver, betas too (1.8.11) — a release after its betas, numbers as numbers.
 */
export function compareVersions(a: string, b: string): number {
  const x = VERSION.exec(a.trim());
  const y = VERSION.exec(b.trim());
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  for (let i = 1; i <= 3; i++)
    if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
  const [p, q] = [x[4] ?? null, y[4] ?? null];
  if (p === q) return 0;
  if (p === null) return 1;
  if (q === null) return -1;
  const u = p.split('.');
  const v = q.split('.');
  for (let i = 0; i < Math.max(u.length, v.length); i++) {
    if (u[i] === undefined) return -1;
    if (v[i] === undefined) return 1;
    const nu = /^\d+$/.test(u[i]);
    const nv = /^\d+$/.test(v[i]);
    if (nu && nv && Number(u[i]) !== Number(v[i])) return Number(u[i]) - Number(v[i]);
    if (nu !== nv) return nu ? -1 : 1;
    if (!nu && u[i] !== v[i]) return u[i] < v[i] ? -1 : 1;
  }
  return 0;
}

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
