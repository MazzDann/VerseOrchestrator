import { api } from '../api';

export type WideSearch = Awaited<ReturnType<typeof api.search>> & {
  /** nothing where it was asked: found in the other translations */
  fallback: boolean;
  /** found only in the archived ones (1.26.0-beta.2) */
  archive: boolean;
};

/**
 * A search in `ids`; with nothing there, in the other translations (the author's call, 1.8.12-beta.4);
 * with nothing there either, in the archived ones too (1.26.0-beta.2). `skip` = the operator's archive;
 * a page without one (a phone, the desk) leaves it out — the server knows it.
 */
export async function searchWide(
  q: string,
  ids: number[],
  opts: { inOrder?: boolean; skip?: readonly string[] } = {},
): Promise<WideSearch> {
  let res = await api.search(q, ids, opts);
  // no model: no words are understood anywhere (no vectors in one translation — another may have them)
  if (res.results.length > 0 || res.missing === 'model')
    return { ...res, fallback: false, archive: false };
  const first = res;
  if (ids.length > 0) {
    res = await api.search(q, [], opts);
    if (res.results.length > 0) return { ...res, fallback: true, archive: false };
  }
  if (!opts.skip || opts.skip.length > 0) {
    const all = await api.search(q, [], { ...opts, skip: [] });
    if (all.results.length > 0) return { ...all, fallback: true, archive: true };
  }
  return { ...(ids.length > 0 ? res : first), fallback: false, archive: false };
}
