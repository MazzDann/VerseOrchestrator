import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type RebuildState } from '../api';
import { useServer } from '../serverStore';
import { N_, tr } from '../i18n';

/**
 * «Пересканувати модулі»: the server rebuilds the library from modules/ and songs/, then
 * every query reads it again. The settings panel and the «Бібліотеки ще немає» state
 * (0.13.1) share it.
 *
 * Since 1.12.4 the build is the server's job (server/src/rebuildJob.ts; users' report F1010-01:
 * the button spun for good on one long request): the button starts it and is free at once; the
 * state comes every second while it builds — and to the control window in charge through the hub
 * (useHub → `noteRebuild`), so a build started in another window shows here too.
 */
export function useRebuildLibrary(): {
  rebuilding: boolean;
  job: RebuildState | undefined;
  rebuild: () => Promise<void>;
  stop: () => Promise<void>;
} {
  const serverAvailable = useServer((s) => s.available);
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const query = useQuery({
    queryKey: ['rebuild'],
    queryFn: () => api.rebuildState(),
    enabled: serverAvailable === true,
    // every second while it builds; else now and then — a window without the hub (a separate
    // settings window, a control window not in charge) learns of a build started elsewhere
    refetchInterval: (q) => (q.state.data?.phase === 'running' ? 1000 : 15_000),
    retry: false,
  });
  // a server that stopped answering: its last «running» is not shown as going on, with a
  // «Зупинити» that can't reach it (review)
  const job = query.isError ? undefined : query.data;
  useEffect(() => {
    if (job) noteRebuild(queryClient, job);
  }, [job, queryClient]);

  const fail = (e: unknown, key: string) =>
    notifications.show({ message: tr(key, { error: (e as Error).message }), color: 'red' });
  const take = (s: RebuildState) => {
    queryClient.setQueryData(['rebuild'], s);
    noteRebuild(queryClient, s);
  };
  const rebuild = async () => {
    setStarting(true);
    try {
      take(await api.rebuild());
    } catch (e) {
      fail(e, N_('Не вдалося перебудувати бібліотеку: {error}'));
    } finally {
      setStarting(false);
    }
  };
  const stop = async () => {
    try {
      take(await api.stopRebuild());
    } catch (e) {
      fail(e, N_('Не вдалося зупинити перебудову: {error}'));
    }
  };
  return { rebuilding: starting || job?.phase === 'running', job, rebuild, stop };
}

// the newest job this window saw running, and the newest whose end it announced: several
// buttons (and the hub) share one notice, and a job that ended before this window looked — a
// reload — isn't news
let sawRunning = 0;
let announced = 0;

/** A job's state reached this window (a poll, a button, the hub): its end, said once. */
export function noteRebuild(queryClient: QueryClient, job: RebuildState): void {
  if (job.phase === 'running') {
    sawRunning = Math.max(sawRunning, job.id);
    return;
  }
  if (job.phase === 'idle' || job.id > sawRunning || job.id <= announced) return;
  announced = job.id;
  // past the builder's commit (its last step, VACUUM) the library is new, however it ended
  const rebuilt = job.phase === 'done' || (job.total > 0 && job.step >= job.total);
  // every query reads the new library — not this one, it has just answered
  if (rebuilt)
    void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'rebuild' });
  if (job.phase === 'done') {
    notifications.show({ message: tr('Бібліотеку оновлено'), color: 'green' });
  } else if (job.phase === 'stopped') {
    notifications.show({
      message: rebuilt
        ? tr('Перебудову зупинено')
        : tr('Перебудову зупинено — бібліотека лишилася як була'),
      color: 'gray',
    });
  } else {
    const error = !job.error
      ? ''
      : 'text' in job.error
        ? job.error.text
        : tr(job.error.key, job.error.vars);
    notifications.show({
      message: tr('Не вдалося перебудувати бібліотеку: {error}', { error }),
      color: 'red',
    });
  }
}

/** «Збираю… RST+, 3 з 29» — how far the build is, for under the button. */
export function rebuildProgress(job: RebuildState): string {
  if (job.total === 0) return tr('Готую перебудову…');
  if (job.current === 'finish') return tr('Завершую перебудову…');
  return tr('Збираю… {module}, {step} з {total}', {
    module: job.current === 'songs' ? tr('пісні') : (job.current ?? ''),
    step: String(job.step),
    total: String(job.total),
  });
}
