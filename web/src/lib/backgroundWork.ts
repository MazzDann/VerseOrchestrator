import type { RebuildState, SemanticState } from '../api';
import { tr } from '../i18n';

/** One piece of work under way: what it is and how far (null: no count to show). */
export interface Work {
  text: string;
  part: number | null;
}

/** What the server's jobs are doing now, in words — «Фонова робота» (1.25.0-beta.1). */
export function worksOf(sem: SemanticState | undefined, rebuild: RebuildState | undefined): Work[] {
  const out: Work[] = [];
  if (rebuild?.phase === 'running')
    out.push({
      text:
        rebuild.total > 0
          ? tr('Бібліотека збирається: {step} з {total}', {
              step: String(rebuild.step),
              total: String(rebuild.total),
            })
          : tr('Бібліотека збирається…'),
      part: rebuild.total > 0 ? rebuild.step / rebuild.total : null,
    });
  for (const m of sem?.models ?? [])
    if (m.download.phase === 'downloading')
      out.push({
        text: tr('Завантажується модель «{model}»', { model: m.name }),
        part: m.download.total > 0 ? m.download.got / m.download.total : null,
      });
  if (sem?.coresTest?.phase === 'running')
    out.push({ text: tr('Модель перевіряє ядра процесора…'), part: null });
  const job = sem?.job;
  if (job?.phase === 'running')
    out.push({
      text: job.current
        ? tr('Модель обчислює вектори {abbr}: {done} з {total}', {
            abbr: job.current.abbr,
            done: String(job.current.done),
            total: String(job.current.total),
          })
        : tr('Модель обчислює вектори…'),
      part: job.current && job.current.total > 0 ? job.current.done / job.current.total : null,
    });
  const songs = sem?.songs;
  if (songs?.phase === 'running')
    out.push({
      text:
        songs.total > 0
          ? tr('Модель обчислює вектори презентацій: {done} з {total}', {
              done: String(songs.done),
              total: String(songs.total),
            })
          : tr('Модель обчислює вектори презентацій…'),
      part: songs.total > 0 ? songs.done / songs.total : null,
    });
  return out;
}
