import { N_ } from '@vo/shared';
import { releaseAsset } from './layout.js';

/**
 * Is there a newer version (1.0.0)? The server asks GitHub for the project's releases now and
 * then — twice a day at most, quietly, never while it has nothing to go on (offline is just
 * «not checked») — and the control window says so. Installing is installer.ts and swap.ts;
 * nothing here changes the app.
 *
 * Versions 0.x are previews: an installation of 0.x looks at pre-releases too, one of 1.0.0 or
 * later only at regular releases.
 */

export const RELEASES_URL =
  process.env.VO_UPDATE_URL ??
  'https://api.github.com/repos/MazzDann/VerseOrchestrator/releases?per_page=30';
/** How long an answer counts as fresh. */
export const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

export type Channel = 'stable' | 'preview';

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface LatestRelease {
  version: string;
  /** the release page: what's new */
  url: string;
  publishedAt: string;
  prerelease: boolean;
  /** the archive for this system, if the release has one */
  asset: ReleaseAsset | null;
  /** the release's SHA256SUMS.txt */
  sums: string | null;
}

export interface UpdateState {
  current: string;
  channel: Channel;
  /** from a release archive (app/ can be replaced) or from a clone of the repository */
  install: 'release' | 'source';
  enabled: boolean;
  checkedAt: number | null;
  latest: LatestRelease | null;
  /** every release of this channel, newest first — any of them can be installed (1.6.2) */
  releases: LatestRelease[];
  available: boolean;
  /** a dictionary key: the last check failed */
  error: string | null;
}

/** `1.2.3` or `v1.2.3` → [1, 2, 3]; anything else → null. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative, zero or positive, like a sort comparator; unparsable versions sort first. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

export const channelFor = (current: string): Channel =>
  (parseVersion(current)?.[0] ?? 0) >= 1 ? 'stable' : 'preview';

interface GitHubRelease {
  tag_name?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: { name?: unknown; browser_download_url?: unknown; size?: unknown }[];
}

/**
 * Every release this channel takes, from GitHub's list, newest first, each version once
 * (anything malformed is skipped) — the dropdown of «Оновлення» (1.6.2).
 */
export function pickReleases(
  releases: unknown,
  channel: Channel,
  assetName: string,
): LatestRelease[] {
  if (!Array.isArray(releases)) return [];
  const found = new Map<string, LatestRelease>();
  for (const r of releases as GitHubRelease[]) {
    if (!r || r.draft === true || typeof r.tag_name !== 'string') continue;
    if (!parseVersion(r.tag_name)) continue;
    const prerelease = r.prerelease === true;
    if (prerelease && channel === 'stable') continue;
    const version = r.tag_name.replace(/^v/, '');
    if (found.has(version)) continue;
    const a = (r.assets ?? []).find((x) => x?.name === assetName);
    const sums = (r.assets ?? []).find((x) => x?.name === 'SHA256SUMS.txt');
    found.set(version, {
      version,
      url: typeof r.html_url === 'string' ? r.html_url : '',
      publishedAt: typeof r.published_at === 'string' ? r.published_at : '',
      prerelease,
      asset:
        a && typeof a.browser_download_url === 'string'
          ? { name: assetName, url: a.browser_download_url, size: Number(a.size) || 0 }
          : null,
      sums: typeof sums?.browser_download_url === 'string' ? sums.browser_download_url : null,
    });
  }
  return [...found.values()].sort((x, y) => compareVersions(y.version, x.version));
}

/** The newest release this channel takes (pickReleases' first). */
export function pickLatest(
  releases: unknown,
  channel: Channel,
  assetName: string,
): LatestRelease | null {
  return pickReleases(releases, channel, assetName)[0] ?? null;
}

export interface CheckerOptions {
  current: string;
  install: 'release' | 'source';
  /** the settings switch «Перевіряти оновлення» */
  isEnabled: () => boolean;
  url?: string;
  fetch?: typeof fetch;
  now?: () => number;
  platform?: string;
  arch?: string;
}

export function createUpdateChecker(o: CheckerOptions) {
  const now = o.now ?? Date.now;
  const doFetch = o.fetch ?? fetch;
  const assetName = releaseAsset(o.platform ?? process.platform, o.arch ?? process.arch);
  const channel = channelFor(o.current);
  let checkedAt: number | null = null;
  let latest: LatestRelease | null = null;
  let releases: LatestRelease[] = [];
  let error: string | null = null;
  let inflight: Promise<void> | null = null;

  const state = (): UpdateState => ({
    current: o.current,
    channel,
    install: o.install,
    enabled: o.isEnabled(),
    checkedAt,
    latest,
    releases,
    available: !!latest && compareVersions(latest.version, o.current) > 0,
    error,
  });

  async function ask(): Promise<void> {
    try {
      const res = await doFetch(o.url ?? RELEASES_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `VerseOrchestrator/${o.current}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      releases = pickReleases(await res.json(), channel, assetName);
      latest = releases[0] ?? null;
      error = null;
    } catch {
      // offline, GitHub down or rate-limited: say so, keep what the last answer said
      error = N_('Не вдалося перевірити оновлення: немає зв’язку з GitHub');
    }
    checkedAt = now();
  }

  return {
    state,
    /**
     * Ask GitHub unless the last answer is fresh (`force`: ask anyway — the «Перевірити зараз»
     * button, which also works with the switch off). Concurrent calls share one request.
     */
    async check(force = false): Promise<UpdateState> {
      if (!force && !o.isEnabled()) return state();
      if (!force && checkedAt !== null && now() - checkedAt < CHECK_EVERY_MS) return state();
      inflight ??= ask().finally(() => {
        inflight = null;
      });
      await inflight;
      return state();
    },
  };
}
