import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyLayout, LAYOUT_MARKER, readLayout, RELEASE_MARKER } from './layout';
import { libraryState } from './launcher';

const dirs: string[] = [];
/** A release folder: the start file's level with modules/, and app/ with the marker. */
function release(marker: unknown = RELEASE_MARKER) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-release-'));
  dirs.push(top);
  const app = path.join(top, 'app');
  fs.mkdirSync(app);
  fs.mkdirSync(path.join(top, 'modules'));
  fs.writeFileSync(
    path.join(app, LAYOUT_MARKER),
    typeof marker === 'string' ? marker : JSON.stringify(marker),
  );
  return { top, app };
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('the release layout (0.14.0)', () => {
  it('a release keeps the user’s folders next to app/', () => {
    const { top, app } = release();
    expect(readLayout(app)).toEqual({
      data: path.join(top, 'data'),
      modules: path.join(top, 'modules'),
    });
  });

  it('points everything the entry points start at those folders; an explicit folder wins', () => {
    const { top, app } = release();
    const env: NodeJS.ProcessEnv = {};
    applyLayout(app, env);
    expect(env).toEqual({
      VO_DATA_DIR: path.join(top, 'data'),
      MODULES_DIR: path.join(top, 'modules'),
    });
    const mine: NodeJS.ProcessEnv = { VO_DATA_DIR: 'D:/elsewhere' };
    applyLayout(app, mine);
    expect(mine.VO_DATA_DIR).toBe('D:/elsewhere');
  });

  it('a project checkout (no marker, or a broken one) keeps its own data/ and modules/', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-checkout-'));
    dirs.push(plain);
    const env: NodeJS.ProcessEnv = {};
    expect(applyLayout(plain, env)).toBeNull();
    expect(env).toEqual({});
    expect(readLayout(release('{ not json').app)).toBeNull();
    expect(readLayout(release({ data: '../data' }).app)).toBeNull();
  });

  it('the launcher then finds the modules a user put at the top', () => {
    const { top, app } = release();
    fs.writeFileSync(path.join(top, 'modules', 'KJV.SQLite3'), '');
    const env: NodeJS.ProcessEnv = {};
    applyLayout(app, env);
    expect(libraryState(app, env)).toEqual({ kind: 'build', modules: path.join(top, 'modules') });
  });
});
