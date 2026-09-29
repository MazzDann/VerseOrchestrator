import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { consoleLang, KeyedError, requestLang, tr, trError } from './lang';

const dirs: string[] = [];
const envLang = process.env.VO_LANG;
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  if (envLang === undefined) delete process.env.VO_LANG;
  else process.env.VO_LANG = envLang;
});

/** A data folder whose ui-state.json keeps the control window's settings with `language`. */
function dataDir(language?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-lang-'));
  dirs.push(dir);
  const settings = JSON.stringify({ state: { language }, version: 1 });
  fs.writeFileSync(
    path.join(dir, 'ui-state.json'),
    JSON.stringify({ 'vo:settings': { value: settings, at: 1 } }),
  );
  return dir;
}

describe('the console language (0.11.7)', () => {
  it('follows the control window, and VO_LANG over it', () => {
    delete process.env.VO_LANG;
    expect(consoleLang(dataDir('en'))).toBe('en');
    expect(consoleLang(dataDir('uk'))).toBe('uk');
    process.env.VO_LANG = 'en';
    expect(consoleLang(dataDir('uk'))).toBe('en');
  });

  it('takes a page language from Accept-Language', () => {
    expect(requestLang('en-US,en;q=0.9,uk;q=0.8')).toBe('en');
    expect(requestLang('de-DE,uk;q=0.5')).toBe('uk');
    expect(requestLang('fr')).toBe('uk');
    expect(requestLang(undefined)).toBe('uk');
  });

  it('translates keys and keyed errors', () => {
    expect(tr('Скасувати', undefined, 'en')).toBe('Cancel');
    expect(tr('Скасувати', undefined, 'uk')).toBe('Скасувати');
    const err = new KeyedError('сервер завершився з кодом {code}', { code: '1' });
    expect(err.message).toBe('сервер завершився з кодом 1');
    expect(trError(err, 'en')).toBe('the server ended with code 1');
  });
});
