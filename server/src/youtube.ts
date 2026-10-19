/**
 * A YouTube video's title (1.19.0-beta.6, the users' F1017-06), from YouTube's oEmbed — no key needed.
 * It also says whether the video can be shown in another app: its owner may forbid it (401), or it
 * is gone or private (404 / 400).
 */
export type YouTubeRefusal = 'embed' | 'missing' | 'failed';

export async function youtubeTitle(
  id: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ title: string } | { refused: YouTubeRefusal }> {
  const get = opts.fetchImpl ?? fetch;
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
  let res: Response;
  try {
    res = await get(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
  } catch {
    return { refused: 'failed' };
  }
  if (res.status === 401 || res.status === 403) return { refused: 'embed' };
  if (res.status === 404 || res.status === 400) return { refused: 'missing' };
  if (!res.ok) return { refused: 'failed' };
  const body = (await res.json().catch(() => null)) as { title?: unknown } | null;
  const title = typeof body?.title === 'string' ? body.title : '';
  return { title };
}
