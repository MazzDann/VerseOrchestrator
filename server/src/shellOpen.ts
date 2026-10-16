import { spawn, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shellDirName } from './layout.ts';

/**
 * Opening the desktop app next to app/ (1.18.0-beta.1, desktopShell.ts) — apart, with no
 * @vo/shared: the launcher runs under plain Node and opens it too (1.18.1: a start that would open
 * a browser — the desktop shortcut's `--app` — opens the app when it is there).
 */

/** The program inside it, as a start file runs it. */
export function shellProgram(top: string, platform: NodeJS.Platform = process.platform): string {
  const dir = path.join(top, shellDirName(platform));
  if (platform === 'darwin') return dir;
  return path.join(dir, platform === 'win32' ? 'VerseOrchestrator.exe' : 'verseorchestrator');
}

export const shellPresent = (top: string, platform: NodeJS.Platform = process.platform): boolean =>
  fs.existsSync(shellProgram(top, platform));

/**
 * How the desktop app is opened for the app running on `port`: it finds it there, takes over as
 * the control window and leaves it running when it quits (desktop/src/main.ts). From the home
 * folder, never inside app/ (a swap would meet EBUSY — 1.8.8). `handover` (1.18.1): a one-time
 * token (handover.ts) — its control window takes charge, the browser's one closes itself.
 */
export function openShellCommand(
  top: string,
  port: number,
  platform: NodeJS.Platform = process.platform,
  handover?: string,
): [string, string[], SpawnOptions] {
  const env: NodeJS.ProcessEnv = { ...process.env, VO_PORT: String(port) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VO_HANDOVER;
  const opts: SpawnOptions = { stdio: 'ignore', detached: true, cwd: os.homedir(), env };
  // `open` starts it through Launch Services (its own Dock icon, not this process's child);
  // --env hands it the port and the token (macOS 13+, the shell's own minimum)
  if (platform === 'darwin')
    return [
      '/usr/bin/open',
      [
        '--env',
        `VO_PORT=${port}`,
        ...(handover ? ['--env', `VO_HANDOVER=${handover}`] : []),
        shellProgram(top, platform),
      ],
      opts,
    ];
  // Linux: --no-sandbox like start.sh (Ubuntu 24.04's AppArmor gives Chromium no sandbox); the
  // token as an argument — an app already open hears it (Electron's second-instance)
  const args = [
    ...(platform === 'linux' ? ['--no-sandbox'] : []),
    ...(handover ? [`--handover=${handover}`] : []),
  ];
  return [shellProgram(top, platform), args, opts];
}

export function openShell(top: string, port: number, handover?: string): void {
  const [cmd, args, opts] = openShellCommand(top, port, process.platform, handover);
  const child = spawn(cmd, args, opts);
  child.on('error', (e) => console.warn(`[desktop] not opened: ${e.message}`));
  child.unref();
}
