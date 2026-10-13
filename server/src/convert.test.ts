import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONVERTED_RECORD,
  convertDocumentsFolder,
  convertedName,
  converterFor,
  converters,
  type Converter,
} from './convert';

const dirs: string[] = [];
const tempDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-conv-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A stand-in for textutil / Pages: the «.docx» holds the source's text, upper-cased. */
const fake = async (_c: Converter, from: string, to: string) => {
  fs.writeFileSync(to, fs.readFileSync(from, 'utf8').toUpperCase());
};
const MAC = converters(
  'darwin',
  (app) => app === 'Pages.app',
  () => true,
);

describe('a Mac’s own formats (convert.ts)', () => {
  it('converts only on macOS, with what is installed', () => {
    expect(converters('win32')).toEqual([]);
    expect(converters('linux')).toEqual([]);
    expect(MAC.map((c) => `${c.ext}→${c.to}`)).toEqual([
      'rtf→docx',
      'doc→docx',
      'odt→docx',
      'wordml→docx',
      'html→docx',
      'htm→docx',
      'webarchive→docx',
      'pages→docx',
    ]);
    // Keynote not installed here: no .key
    expect(converterFor('Пісня.key', MAC)).toBeNull();
    expect(converterFor('Проповідь.PAGES', MAC)?.via).toBe('pages');
    expect(convertedName('a/Проповідь.pages', 'docx')).toBe('a/Проповідь.docx');
  });

  it('the documents folder: a .docx next to each source, made again on a change', async () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, '2026'));
    fs.writeFileSync(path.join(dir, 'Проповідь.pages'), 'pages text');
    fs.writeFileSync(path.join(dir, '2026', 'Лекція.rtf'), 'rtf text');
    fs.writeFileSync(path.join(dir, 'Notes.txt'), 'read as it is');
    expect(await convertDocumentsFolder(dir, MAC, undefined, fake)).toBe(2);
    expect(fs.readFileSync(path.join(dir, 'Проповідь.docx'), 'utf8')).toBe('PAGES TEXT');
    expect(fs.readFileSync(path.join(dir, '2026', 'Лекція.docx'), 'utf8')).toBe('RTF TEXT');
    expect(fs.existsSync(path.join(dir, '.converting'))).toBe(false);
    // nothing changed: nothing made
    expect(await convertDocumentsFolder(dir, MAC, undefined, fake)).toBe(0);
    // the source saved again: made again
    fs.writeFileSync(path.join(dir, 'Проповідь.pages'), 'pages text, edited');
    const t = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(dir, 'Проповідь.pages'), t, t);
    expect(await convertDocumentsFolder(dir, MAC, undefined, fake)).toBe(1);
    expect(fs.readFileSync(path.join(dir, 'Проповідь.docx'), 'utf8')).toBe('PAGES TEXT, EDITED');
  });

  it('leaves the user’s own .docx alone, and takes away only what it made', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'Мій.docx'), 'mine');
    fs.writeFileSync(path.join(dir, 'Мій.rtf'), 'rtf');
    fs.writeFileSync(path.join(dir, 'Інший.rtf'), 'other');
    fs.writeFileSync(path.join(dir, 'Третій.odt'), 'third');
    expect(await convertDocumentsFolder(dir, MAC, undefined, fake)).toBe(2);
    expect(fs.readFileSync(path.join(dir, 'Мій.docx'), 'utf8')).toBe('mine');
    // a source gone: its .docx goes …
    fs.rmSync(path.join(dir, 'Інший.rtf'));
    // … unless someone changed the .docx since
    fs.rmSync(path.join(dir, 'Третій.odt'));
    fs.writeFileSync(path.join(dir, 'Третій.docx'), 'edited by hand, longer');
    await convertDocumentsFolder(dir, MAC, undefined, fake);
    expect(fs.existsSync(path.join(dir, 'Інший.docx'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'Третій.docx'), 'utf8')).toBe('edited by hand, longer');
    expect(JSON.parse(fs.readFileSync(path.join(dir, CONVERTED_RECORD), 'utf8'))).toEqual({});
  });

  it('a failed conversion leaves nothing half-made', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'Bad.pages'), 'x');
    const logs: string[] = [];
    const failing = async (_c: Converter, _from: string, to: string) => {
      fs.writeFileSync(to, 'half');
      throw new Error('Pages refused');
    };
    expect(await convertDocumentsFolder(dir, MAC, (m) => logs.push(m), failing)).toBe(0);
    expect(fs.readdirSync(dir).sort()).toEqual(['Bad.pages']);
    expect(logs[0]).toMatch(/not converted Bad\.pages: Pages refused/);
  });

  it('one .docx per name, a deleted one not remade, a failure not retried until it changes', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'Лекція.pages'), 'pages');
    fs.writeFileSync(path.join(dir, 'Лекція.rtf'), 'rtf');
    let runs = 0;
    const counting: typeof fake = async (c, from, to) => {
      runs++;
      await fake(c, from, to);
    };
    expect(await convertDocumentsFolder(dir, MAC, undefined, counting)).toBe(1);
    // the first by name keeps it, and a second pass makes nothing (no back-and-forth)
    expect(fs.readFileSync(path.join(dir, 'Лекція.docx'), 'utf8')).toBe('PAGES');
    expect(await convertDocumentsFolder(dir, MAC, undefined, counting)).toBe(0);
    expect(runs).toBe(1);
    // deleted in the app: stays deleted while the source is as it was
    fs.rmSync(path.join(dir, 'Лекція.docx'));
    expect(await convertDocumentsFolder(dir, MAC, undefined, counting)).toBe(0);
    expect(fs.existsSync(path.join(dir, 'Лекція.docx'))).toBe(false);
    // a failure is remembered by the source's size and time
    fs.writeFileSync(path.join(dir, 'Bad.odt'), 'x');
    const failed = new Map<string, string>();
    let tries = 0;
    const failing: typeof fake = async () => {
      tries++;
      throw new Error('no');
    };
    await convertDocumentsFolder(dir, MAC, undefined, failing, failed);
    await convertDocumentsFolder(dir, MAC, undefined, failing, failed);
    // Bad.odt tried once, then remembered; Лекція.pages unchanged — not tried at all
    expect(tries).toBe(1);
    expect(failed.has('Bad.odt')).toBe(true);
  });
});
