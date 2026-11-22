import { useEffect, useRef } from 'react';
import { RingProgress, Tooltip, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { worksOf } from '../lib/backgroundWork';
import { useServer } from '../serverStore';
import { tr, useLang } from '../i18n';

/**
 * «Фонова робота» (1.25.0-beta.1, the author: «має подавати UI що от йде робота моделі десь
 * окуратно»): a small ring in the header while the server works on its own — the library being
 * rebuilt, a model downloading or measuring the cores, vectors of translations or of
 * presentations. Its tooltip says what and how far; a click opens «Дані». Nothing shown otherwise.
 */
export function BackgroundWork({ onOpen }: { onOpen: () => void }) {
  useLang();
  const serverAvailable = useServer((s) => s.available);
  const queryClient = useQueryClient();
  const rebuild = useQuery({
    queryKey: ['rebuild'],
    queryFn: () => api.rebuildState(),
    enabled: serverAvailable === true,
    refetchInterval: (q) => (q.state.data?.phase === 'running' ? 1000 : 15_000),
    retry: false,
  });
  const semantic = useQuery({
    queryKey: ['semantic'],
    queryFn: () => api.semantic(),
    enabled: serverAvailable === true,
    // the hub tells a control window when a job starts; while one runs, every 2 s
    // …and now and then while idle: a pass started with no frame (the server's start) shows too
    refetchInterval: (q) => (worksOf(q.state.data, undefined).length ? 2000 : 15_000),
    retry: false,
  });
  const works = worksOf(
    semantic.isError ? undefined : semantic.data,
    rebuild.isError ? undefined : rebuild.data,
  );
  // the songs' first vectors done: «~ тема» is ready (said once, when a pass made some)
  const songsPhase = semantic.data?.songs?.phase;
  const was = useRef(songsPhase);
  useEffect(() => {
    const before = was.current;
    was.current = songsPhase;
    if (before !== 'running' || songsPhase !== 'done') return;
    void queryClient.invalidateQueries({ queryKey: ['songs-meaning'] });
    const s = semantic.data?.songs;
    if (s && s.total > 0 && s.done >= s.total)
      notifications.show({
        message: tr('Пошук презентацій за змістом готовий: «~ тема» у полі «Презентація»'),
        color: 'brand',
        autoClose: 4000,
      });
  }, [songsPhase, semantic.data?.songs, queryClient]);

  if (!works.length) return null;
  const parts = works.map((w) => w.part).filter((p): p is number => p !== null);
  const value = parts.length ? Math.round((Math.min(...parts) || 0) * 100) : 0;
  const label = works.map((w) => w.text).join('\n');
  return (
    <Tooltip label={label} multiline maw={320} style={{ whiteSpace: 'pre-line' }}>
      <UnstyledButton
        onClick={onOpen}
        aria-label={tr('Фонова робота: {what}', { what: label })}
        data-background-work
        style={{ display: 'flex', alignItems: 'center', alignSelf: 'center' }}
      >
        <RingProgress
          size={22}
          thickness={3}
          roundCaps
          sections={[{ value: parts.length ? Math.max(value, 4) : 25, color: 'brand' }]}
          className={parts.length ? undefined : 'vo-ring-spin'}
        />
      </UnstyledButton>
    </Tooltip>
  );
}
