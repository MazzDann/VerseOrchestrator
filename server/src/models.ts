import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  EMBED_MODELS,
  LibraryError,
  modelBytes,
  modelFileUrl,
  N_,
  type EmbedModel,
  type EmbedModelId,
} from '@vo/shared';

/**
 * «Пошук за змістом» (1.15.0-beta.2): the models live in data/models/<id>/ — not shipped with the
 * app (the author's call 2026-10-11), downloaded on a click from Hugging Face at a pinned revision.
 * A file is kept only when its SHA-256 is the one written in shared/src/embed/models.ts: written as
 * `.part`, checked, then renamed — a cut download never passes for a model.
 */

export type ModelPhase = 'idle' | 'downloading' | 'done' | 'failed' | 'cancelled';

export interface ModelDownload {
  id: EmbedModelId;
  phase: ModelPhase;
  got: number;
  total: number;
  note?: { key: string; vars?: Record<string, string> };
}

/** No byte for this long: the download stops (a stalled connection would hold it forever). */
const STALL_MS = 60_000;

export function modelDir(dataDir: string, id: EmbedModelId): string {
  return path.join(dataDir, 'models', id);
}

/** Every file of the model there, at its size (the hash was checked when it came). */
export function modelInstalled(
  dataDir: string,
  id: EmbedModelId,
  models: Record<EmbedModelId, EmbedModel> = EMBED_MODELS,
): boolean {
  return models[id].files.every((f) => {
    try {
      return fs.statSync(path.join(modelDir(dataDir, id), f.name)).size === f.size;
    } catch {
      return false;
    }
  });
}

export function createModelStore(d: {
  dataDir: string;
  version: string;
  fetch?: typeof fetch;
  onChange?: (s: ModelDownload) => void;
  stallMs?: number;
  /** the models (tests give small ones) */
  models?: Record<EmbedModelId, EmbedModel>;
}) {
  const get = d.fetch ?? fetch;
  const all = d.models ?? EMBED_MODELS;
  const headers = {
    'User-Agent': `VerseOrchestrator/${d.version} (+https://github.com/MazzDann/VerseOrchestrator)`,
  };
  const states = new Map<EmbedModelId, ModelDownload>();
  let abort: AbortController | null = null;
  let last = 0;
  const changed = (s: ModelDownload, force = true) => {
    const now = Date.now();
    if (!force && now - last < 250) return;
    last = now;
    d.onChange?.({ ...s });
  };

  async function fetchFile(
    s: ModelDownload,
    url: string,
    to: string,
    sha256: string,
    signal: AbortSignal,
  ) {
    const stall = new AbortController();
    let timer = setTimeout(() => stall.abort(), d.stallMs ?? STALL_MS);
    const part = `${to}.part`;
    const out = await fsp.open(part, 'w');
    const hash = createHash('sha256');
    try {
      const res = await get(url, { headers, signal: AbortSignal.any([signal, stall.signal]) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        clearTimeout(timer);
        timer = setTimeout(() => stall.abort(), d.stallMs ?? STALL_MS);
        hash.update(chunk);
        await out.write(chunk);
        s.got += chunk.length;
        changed(s, false);
      }
    } finally {
      clearTimeout(timer);
      await out.close();
    }
    if (hash.digest('hex') !== sha256) {
      await fsp.rm(part, { force: true });
      throw new LibraryError(
        502,
        N_('Файл моделі пошкоджено під час завантаження. Спробуйте ще раз.'),
      );
    }
    await fsp.rename(part, to);
  }

  async function run(id: EmbedModelId): Promise<void> {
    const m = all[id];
    const dir = modelDir(d.dataDir, id);
    const s: ModelDownload = { id, phase: 'downloading', got: 0, total: modelBytes(m) };
    states.set(id, s);
    changed(s);
    abort = new AbortController();
    try {
      await fsp.mkdir(dir, { recursive: true });
      for (const f of m.files) {
        const to = path.join(dir, f.name);
        // a file already in place (an earlier, cut-short download got this far) is kept
        if (fs.existsSync(to) && fs.statSync(to).size === f.size) {
          s.got += f.size;
          continue;
        }
        await fetchFile(s, modelFileUrl(m, f), to, f.sha256, abort.signal);
      }
      s.phase = 'done';
    } catch (err) {
      if (abort.signal.aborted) s.phase = 'cancelled';
      else {
        s.phase = 'failed';
        s.note =
          err instanceof LibraryError
            ? { key: err.key }
            : {
                key: N_('Не вдалося завантажити модель: {error}'),
                vars: { error: (err as Error).message },
              };
        console.warn(`[models] ${id}: ${(err as Error).message}`);
      }
      for (const f of m.files) await fsp.rm(path.join(dir, `${f.name}.part`), { force: true });
    } finally {
      abort = null;
      changed(s);
    }
  }

  return {
    state: (id: EmbedModelId): ModelDownload =>
      states.get(id) ?? {
        id,
        phase: modelInstalled(d.dataDir, id, all) ? 'done' : 'idle',
        got: 0,
        total: modelBytes(all[id]),
      },
    /** «Завантажити модель» — one at a time */
    download(id: EmbedModelId): ModelDownload {
      if ([...states.values()].some((s) => s.phase === 'downloading'))
        throw new LibraryError(409, N_('Зачекайте, доки завантажиться інша модель'));
      if (modelInstalled(d.dataDir, id, all)) return this.state(id);
      void run(id);
      return { ...states.get(id)! };
    },
    cancel(): void {
      abort?.abort();
    },
    /** «Видалити модель»: its folder goes (the vectors made with it stay — they are its, not the files') */
    async remove(id: EmbedModelId): Promise<void> {
      if (states.get(id)?.phase === 'downloading')
        throw new LibraryError(409, N_('Модель саме завантажується'));
      await fsp.rm(modelDir(d.dataDir, id), { recursive: true, force: true });
      states.delete(id);
    },
  };
}

export type ModelStore = ReturnType<typeof createModelStore>;
