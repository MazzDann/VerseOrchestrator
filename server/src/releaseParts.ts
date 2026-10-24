import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Updates in parts (1.20.0-beta.1): a release is split into segments by how often each changes
 * (measured 2026-10-24 on a 1.18.3→1.19.0 copy — `.claude/update-parts-plan.md`), so an update
 * downloads only the segments whose content changed. The big static mass — the bundled Node
 * (≈106M), the third-party node_modules (≈85M), the WASM engines (≈30M), the Electron shell
 * (≈321M) — is kept; a normal release is then ≈10M of our own code, not ≈219M.
 *
 * This module splits a built release top folder into part archives + a manifest, and writes the
 * segment content hashes into `app/parts.json` so an installed copy knows what it already has.
 * The same `assign` + `walkFiles` tell the installer (installer.ts, beta.2) which files of its
 * current copy belong to a segment it can keep. Plain Node (no @vo): it runs in CI via tsx.
 */

/** The manifest's format: an installer that reads another number falls back to the full archive. */
export const PARTS_FORMAT = 1;
/** The manifest asset (per OS/arch), next to the full archive; `app/parts.json` is the subset in app/. */
export const PARTS_FILE = 'parts.json';

export type SegmentName = 'runtime' | 'deps' | 'engines' | 'shell' | 'app';

/**
 * Which segment a file (its path relative to the release top, forward slashes) belongs to — the
 * first that claims it. The segments cover the two content trees `app/` and `shell/`. Everything
 * else belongs to no segment: `data/` and `modules/` are the user's (an update never touches them),
 * and the release-top loose files (the `start.*` launchers, the «HOW TO START» / «ЯК ЗАПУСТИТИ»
 * readmes, the `.vo-portable` marker) are tiny and are refreshed by the updater's own top-files
 * path (installer.ts, `updates/top/VERSION`), not through an `app/` swap — so they stay out.
 */
export function assign(rel: string): SegmentName | null {
  if (rel.startsWith('data/') || rel.startsWith('modules/')) return null;
  // our code inside node_modules / the shell goes with `app`, so `deps` / `shell` stay static
  if (rel.startsWith('app/node_modules/@vo/')) return 'app';
  if (rel.startsWith('shell/resources/app/')) return 'app';
  if (rel.startsWith('app/node/')) return 'runtime';
  if (rel.startsWith('app/node_modules/')) return 'deps';
  if (rel.startsWith('app/web/dist/') && /\.(wasm|data)$/.test(rel)) return 'engines';
  if (rel.startsWith('shell/')) return 'shell';
  if (rel.startsWith('app/')) return 'app';
  return null;
}

/** The segments in archive order; `app` last (it carries parts.json, written after the rest). */
export const SEGMENTS: SegmentName[] = ['runtime', 'deps', 'engines', 'shell', 'app'];

/** Every file under `top` (relative paths, forward slashes), skipping `app/parts.json`. */
export function walkFiles(top: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, rel);
      else if (e.isFile() && rel !== 'app/parts.json') out.push(rel);
    }
  };
  walk(top, '');
  return out;
}

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

const fileSha = (abs: string): string => {
  const h = createHash('sha256');
  h.update(fs.readFileSync(abs));
  return h.digest('hex');
};

/**
 * A segment's content hash: deterministic across builds and systems — over the sorted
 * `relpath\0filesha` of its files, so two copies with the same content match whatever the
 * archive's bytes (zip/tar embed timestamps) or the order a walk returned them in.
 */
export function contentHash(top: string, files: string[]): string {
  const lines = [...files]
    .sort()
    .map((rel) => `${rel}\0${fileSha(path.join(top, ...rel.split('/')))}`);
  return sha256(lines.join('\n'));
}

export interface SegmentPlan {
  name: SegmentName;
  files: string[];
  bytes: number;
}

/** Each file of `top` put in its segment; throws if a file is claimed by none but `app`'s rule. */
export function planParts(top: string): SegmentPlan[] {
  const files = walkFiles(top);
  const byName = new Map<SegmentName, string[]>(SEGMENTS.map((n) => [n, []]));
  for (const rel of files) {
    const seg = assign(rel);
    if (seg) byName.get(seg)!.push(rel);
  }
  return SEGMENTS.map((name) => {
    const segFiles = byName.get(name)!;
    const bytes = segFiles.reduce(
      (n, rel) => n + fs.statSync(path.join(top, ...rel.split('/'))).size,
      0,
    );
    return { name, files: segFiles, bytes };
  }).filter((s) => s.files.length > 0);
}

/** The part archive's extension for a system: a zip for Windows and macOS, a tarball for Linux. */
export const partExt = (platform: string) => (platform === 'linux' ? 'tar.gz' : 'zip');

/** The part asset's name: `VerseOrchestrator-<os>-<arch>.<segment>.<ext>`. */
export const partAsset = (os_: string, arch: string, seg: string, platform: string) =>
  `VerseOrchestrator-${os_}-${arch}.${seg}.${partExt(platform)}`;

/** The manifest asset's name: `VerseOrchestrator-<os>-<arch>.parts.json`. */
export const manifestAsset = (os_: string, arch: string) =>
  `VerseOrchestrator-${os_}-${arch}.${PARTS_FILE}`;

const run = (cmd: string, args: string[], opts: { cwd?: string; input?: string } = {}) =>
  new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: [opts.input ? 'pipe' : 'ignore', 'ignore', 'inherit'],
      windowsHide: true,
    });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    if (opts.input) {
      p.stdin!.write(opts.input);
      p.stdin!.end();
    }
  });

/** Archive the files (relative to `top`) into `out`, each entry keeping its path — per system. */
export type Archive = (
  top: string,
  out: string,
  files: string[],
  platform: string,
) => Promise<void>;

/**
 * The file list fed to `tar --null -T -` on stdin: the paths (relative to the archive's top),
 * NUL-separated, empties dropped. NUL separators avoid every line-list quirk — an empty or trailing
 * line made a newer bsdtar (GitHub's windows-latest) fail with «tar.exe: : Couldn't visit
 * directory», and a line list is sensitive to CRLF / BOM too.
 *
 * Every path here is ASCII: the segments cover only `app/` and `shell/`, whose trees are code and
 * binaries, and `assign` keeps the one non-ASCII release file («ЯК ЗАПУСТИТИ.txt», at the top) out
 * of every segment. That matters because Windows bsdtar decodes a `-T` list in the active code
 * page, not UTF-8, so a Cyrillic name in it would become an empty entry and the same error.
 */
export const tarFileList = (files: string[]): string => files.filter(Boolean).join('\0');

/**
 * The real archiver, with the same bsdtar the installer unpacks with (installer.ts unpackCommand):
 * a zip on Windows and macOS (`--format=zip`, so bsdtar / ditto read it back), a gzip tarball on
 * Linux — paths fed on stdin (`--null -T -`), relative to `top`. No 7z or Info-ZIP dependency,
 * and no temp list file.
 */
export const systemArchive: Archive = async (top, out, files, platform) => {
  const tarBin =
    platform === 'win32'
      ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar';
  // `--no-recursion`: the list is already every file we want, so tar must archive exactly those
  // and never descend into anything. Without it a newer bsdtar (GitHub's windows-latest) tries to
  // «visit» a listed entry it sees as a directory and dies with «Couldn't visit directory»; the
  // builds here (bsdtar 3.5.2) and GNU tar on Linux tolerate it, so it only shows up in CI.
  const v = process.env.VO_PARTS_VERBOSE ? ['-v'] : [];
  const args =
    platform === 'linux'
      ? ['-czf', out, '-C', top, '--no-recursion', ...v, '--null', '-T', '-']
      : ['-cf', out, '--format=zip', '-C', top, '--no-recursion', ...v, '--null', '-T', '-'];
  process.stderr.write(`[parts] ${path.basename(out)}: ${files.length} files\n`);
  await run(tarBin, args, { input: tarFileList(files) });
};

/** A segment in the manifest asset: the installer downloads `file` (verified) when `contentHash` differs. */
export interface ManifestSegment {
  name: SegmentName;
  file: string;
  size: number;
  archiveSha256: string;
  contentHash: string;
}

export interface PartsManifest {
  format: number;
  os: string;
  arch: string;
  /** the full archive, for a copy that falls back (and to name the release) */
  full: string;
  segments: ManifestSegment[];
}

export interface BuildOptions {
  /** the built release top folder (`VerseOrchestrator-<ver>-<os>-<arch>/`) */
  top: string;
  /** where the part archives + the manifest go (the CI `out/` next to the full archive) */
  outDir: string;
  os: string;
  arch: string;
  platform?: string;
  full: string;
  archive?: Archive;
}

/**
 * Split the built release into part archives in `outDir`, write the manifest asset there and the
 * segment hashes into `<top>/app/parts.json`. Returns the manifest. The full archive must be made
 * AFTER this (so it carries `app/parts.json` — a copy installed from it can then update by parts).
 */
export async function buildReleaseParts(o: BuildOptions): Promise<PartsManifest> {
  const platform = o.platform ?? process.platform;
  const archive = o.archive ?? systemArchive;
  const plan = planParts(o.top);
  // the content hashes first — before parts.json exists, so it isn't hashed into `app`
  const hashes = new Map<SegmentName, string>(
    plan.map((s) => [s.name, contentHash(o.top, s.files)]),
  );

  // `app/parts.json`: what an installed copy compares against (no urls, no archive shas)
  const appParts = {
    format: PARTS_FORMAT,
    segments: plan.map((s) => ({ name: s.name, contentHash: hashes.get(s.name)! })),
  };
  fs.mkdirSync(path.join(o.top, 'app'), { recursive: true });
  fs.writeFileSync(path.join(o.top, 'app', 'parts.json'), JSON.stringify(appParts, null, 2) + '\n');

  fs.mkdirSync(o.outDir, { recursive: true });
  const segments: ManifestSegment[] = [];
  for (const s of plan) {
    // the `app` archive must carry parts.json (written just now)
    const files = s.name === 'app' ? [...s.files, 'app/parts.json'] : s.files;
    const file = partAsset(o.os, o.arch, s.name, platform);
    const out = path.join(o.outDir, file);
    await archive(o.top, out, files, platform);
    const size = fs.statSync(out).size;
    segments.push({
      name: s.name,
      file,
      size,
      archiveSha256: fileSha(out),
      contentHash: hashes.get(s.name)!,
    });
  }

  const manifest: PartsManifest = {
    format: PARTS_FORMAT,
    os: o.os,
    arch: o.arch,
    full: o.full,
    segments,
  };
  fs.writeFileSync(
    path.join(o.outDir, manifestAsset(o.os, o.arch)),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  return manifest;
}

// CLI (CI): node --import tsx server/src/releaseParts.ts <top> <outDir> <os> <arch> <fullAssetName>
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('releaseParts.ts')
) {
  const [top, outDir, os_, arch, full] = process.argv.slice(2);
  if (!top || !outDir || !os_ || !arch || !full) {
    console.error('usage: releaseParts.ts <top> <outDir> <os> <arch> <fullAssetName>');
    process.exit(2);
  }
  buildReleaseParts({ top, outDir, os: os_, arch, full }).then(
    (m) => {
      for (const s of m.segments)
        console.log(
          `${s.name.padEnd(8)} ${(s.size / 1048576).toFixed(1).padStart(7)} MB  ${s.file}`,
        );
    },
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
