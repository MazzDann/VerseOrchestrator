import { N_ } from '@vo/shared';
import { releaseAsset } from './layout.js';

/**
 * Is there a newer version (1.0.0)? The server asks GitHub for the project's releases now and
 * then — every hour, and when «Оновлення» is opened on an answer older than ten minutes (1.12.3;
 * twice a day before it), quietly, never while it has nothing to go on (offline is just «not
 * checked») — and the control window says so. Installing is installer.ts and swap.ts; nothing
 * here changes the app.
 *
 * An unchanged list comes back as a short 304 «Not Modified» (1.12.3): the request carries the
 * last answer's ETag. At most seven requests an hour — GitHub gives an address 60 unsigned ones.
 *
 * Two channels (1.8.11): «Стабільний» takes regular releases only, «Бета» pre-releases too —
 * versions like `1.8.12-beta.1`, published as GitHub pre-releases. The operator chooses in
 * «Оновлення»; without a choice, an installation of a pre-release (or of a 0.x preview) follows
 * the betas. Versions before 1.8.11 never see a beta: they skip pre-releases and can't read the
 * version.
 */

// 100 (the API's most, one request all the same): betas take places in the list since 1.8.11, the
// dropdown keeps the stable releases it showed with 30
export const RELEASES_URL =
  process.env.VO_UPDATE_URL ??
  'https://api.github.com/repos/MazzDann/VerseOrchestrator/releases?per_page=100';
/**
 * How long an answer counts as fresh: a little under the hourly look (index.ts), which would
 * otherwise find it a few seconds too young and wait another hour (12 hours before 1.12.3 — a
 * copy said its version was the newest for hours after a fix was out, users' report F1010-01b).
 */
export const CHECK_EVERY_MS = 50 * 60 * 1000;
/** «Оновлення» opened (1.12.3): an answer older than this is asked again. */
export const OPEN_FRESH_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 8000;

export type Channel = 'stable' | 'beta';

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

/** A version, maybe with a pre-release part (semver): `1.8.12`, `v1.8.12`, `1.8.12-beta.1`. */
const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*))?$/;

/** `1.2.3`, `v1.2.3` or `1.2.3-beta.1` (1.8.11) → [1, 2, 3]; anything else → null. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = VERSION.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** The pre-release part (1.8.11): `1.8.12-beta.1` → `beta.1`; a regular release → null. */
export function preRelease(v: string): string | null {
  return VERSION.exec(v.trim())?.[4] ?? null;
}

/**
 * Semver's order of pre-releases: a regular release after its pre-releases (1.8.12-beta.3 <
 * 1.8.12); field by field, numbers as numbers and below words, a shorter list first.
 */
function comparePre(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const x = a.split('.');
  const y = b.split('.');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    const nx = /^\d+$/.test(x[i]);
    const ny = /^\d+$/.test(y[i]);
    if (nx && ny && Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
    if (nx !== ny) return nx ? -1 : 1;
    if (!nx && x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/** Negative, zero or positive, like a sort comparator; unparsable versions sort first. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || comparePre(preRelease(a), preRelease(b));
}

/**
 * The channel (1.8.11): the operator's choice; without one, betas for an installation of a beta
 * (or of a 0.x preview), regular releases for the rest.
 */
export const channelFor = (current: string, chosen?: Channel): Channel =>
  chosen ??
  (preRelease(current) !== null || (parseVersion(current)?.[0] ?? 0) < 1 ? 'beta' : 'stable');

/**
 * An older version the operator chose over the newest release (1.6.3, «Поточний»): `version`
 * runs on purpose, so «Оновлення» keeps quiet about the releases up to `skip` — the newest one
 * when it was chosen. A release newer than that is news again.
 */
export interface Pin {
  version: string;
  skip: string;
}

/** `to` chosen over `newest`: a pin when it is older; anything else isn't one. */
export function pinFor(to: string, newest: string | null): Pin | null {
  return newest && compareVersions(to, newest) < 0 ? { version: to, skip: newest } : null;
}

/**
 * The pin a swap from `from` to `to` leaves (1.6.3). `to` is chosen over the newest release
 * the operator knew of when choosing it (`known`: for a download, the newest when it began — a
 * release out since then wasn't passed over) and over `from` when it is older. «Повернути
 * версію» that steps up, undoing a step down, chooses nothing over anything.
 */
export function pinForSwap(o: {
  kind: 'update' | 'rollback';
  from: string;
  to: string;
  known: string | null;
}): Pin | null {
  if (o.kind === 'rollback' && compareVersions(o.to, o.from) > 0) return null;
  return pinFor(o.to, o.known && compareVersions(o.known, o.from) > 0 ? o.known : o.from);
}

/** Does the pin keep `current` quiet — nothing out newer than what it skipped? */
export function isQuiet(pin: Pin | undefined, current: string, newest: string | null): boolean {
  return !!pin && !!newest && pin.version === current && compareVersions(newest, pin.skip) <= 0;
}

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
    // a beta by its flag or by its name: `v1.8.12-beta.1` published as a regular release by
    // mistake stays out of «Стабільний» all the same
    const prerelease = r.prerelease === true || preRelease(r.tag_name) !== null;
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
  /** «Канал» in «Оновлення» (1.8.11); undefined: not chosen (channelFor) */
  channel?: () => Channel | undefined;
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
  const channel = () => channelFor(o.current, o.channel?.());
  let checkedAt: number | null = null;
  // GitHub's last answer as it came: a change of channel picks from it again, no new request
  let answer: unknown = null;
  // …and its ETag: the next request asks «changed since?» (1.12.3)
  let etag: string | null = null;
  let error: string | null = null;
  let inflight: Promise<void> | null = null;

  const state = (): UpdateState => {
    const releases = pickReleases(answer, channel(), assetName);
    const latest = releases[0] ?? null;
    return {
      current: o.current,
      channel: channel(),
      install: o.install,
      enabled: o.isEnabled(),
      checkedAt,
      latest,
      releases,
      available: !!latest && compareVersions(latest.version, o.current) > 0,
      error,
    };
  };

  async function ask(): Promise<void> {
    try {
      const res = await doFetch(o.url ?? RELEASES_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `VerseOrchestrator/${o.current}`,
          ...(etag && answer !== null ? { 'If-None-Match': etag } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status !== 304) {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        answer = await res.json();
        etag = res.headers.get('etag');
      }
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
     * Ask GitHub unless the last answer is younger than `maxAge` (`force`: ask anyway — the
     * «Перевірити зараз» button, which also works with the switch off). Concurrent calls share
     * one request.
     */
    async check(force = false, maxAge = CHECK_EVERY_MS): Promise<UpdateState> {
      if (!force && !o.isEnabled()) return state();
      if (!force && checkedAt !== null && now() - checkedAt < maxAge) return state();
      inflight ??= ask().finally(() => {
        inflight = null;
      });
      await inflight;
      return state();
    },
  };
}
