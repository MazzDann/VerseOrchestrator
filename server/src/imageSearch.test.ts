import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { creditOf, fromCommons, fromOpenverse, plain, searchImages } from './imageSearch';
import { addImage, imageEntry } from './images';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('free pictures by a search (1.19.0-beta.9)', () => {
  it('reads Wikimedia Commons: pictures only, its author in words, in its order', () => {
    const body = {
      continue: { gsroffset: 24 },
      query: {
        pages: {
          '2': {
            pageid: 2,
            index: 2,
            title: 'File:Sunrise over hills.jpg',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/a/Sunrise.jpg',
                thumburl: 'https://upload.wikimedia.org/thumb/a/Sunrise.jpg/1920px-Sunrise.jpg',
                thumbwidth: 1920,
                thumbheight: 1080,
                width: 4000,
                height: 2250,
                mime: 'image/jpeg',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Sunrise.jpg',
                extmetadata: {
                  Artist: { value: '<a href="//x">Jane&nbsp;Doe</a>' },
                  LicenseShortName: { value: 'CC BY-SA 4.0' },
                },
              },
            ],
          },
          '1': {
            pageid: 1,
            index: 1,
            title: 'File:Map.svg',
            imageinfo: [
              { url: 'u', width: 1, height: 1, mime: 'image/svg+xml', descriptionurl: 'd' },
            ],
          },
          '3': {
            pageid: 3,
            index: 1,
            title: 'File:Lake.png',
            imageinfo: [
              {
                url: 'https://u/lake.png',
                width: 800,
                height: 600,
                mime: 'image/png',
                descriptionurl: 'd',
              },
            ],
          },
        },
      },
    };
    const found = fromCommons(body);
    expect(found.map((f) => f.id)).toEqual(['commons:3', 'commons:2']);
    expect(found[1]).toMatchObject({
      title: 'Sunrise over hills',
      thumb: 'https://upload.wikimedia.org/thumb/a/Sunrise.jpg/320px-Sunrise.jpg',
      url: 'https://upload.wikimedia.org/thumb/a/Sunrise.jpg/1920px-Sunrise.jpg',
      w: 1920,
      author: 'Jane Doe',
      license: 'CC BY-SA 4.0',
      credit: 'Jane Doe · CC BY-SA 4.0 · Wikimedia Commons',
    });
    expect(found[0].credit).toBe('Wikimedia Commons');
  });
  it('reads Openverse with its licence names', () => {
    const found = fromOpenverse({
      page_count: 3,
      results: [
        {
          id: 'a',
          title: 'Hills',
          url: 'https://x/h.jpg',
          thumbnail: 'https://x/t',
          creator: 'Ann',
          license: 'by',
          license_version: '2.0',
          filetype: 'jpg',
        },
        { id: 'b', title: 'Old', url: 'https://x/o.jpg', license: 'pdm' },
        { id: 'c', title: 'Doc', url: 'https://x/d.svg', filetype: 'svg' },
      ],
    });
    expect(found.map((f) => f.credit)).toEqual(['Ann · CC BY 2.0 · Openverse', 'PDM · Openverse']);
  });
  it('words only of HTML; a credit skips what is missing', () => {
    expect(plain('<span>A &amp; B</span>  <i>C</i>')).toBe('A & B C');
    expect(creditOf('', 'CC0', 'Openverse')).toBe('CC0 · Openverse');
  });
  it('refuses an empty search, says when the source is busy or down', async () => {
    expect(await searchImages('  ', 'commons', 1)).toEqual({ refused: 'query' });
    const answer = (status: number) => async () => new Response('{}', { status });
    expect(await searchImages('x', 'openverse', 1, { fetchImpl: answer(429) })).toEqual({
      refused: 'busy',
    });
    expect(await searchImages('x', 'commons', 1, { fetchImpl: answer(500) })).toEqual({
      refused: 'failed',
    });
    const said: string[] = [];
    await searchImages('гори', 'commons', 2, {
      fetchImpl: (async (u: string, init?: RequestInit) => {
        said.push(String(u), String((init?.headers as Record<string, string>)['User-Agent']));
        return new Response('{"query":{"pages":{}}}');
      }) as typeof fetch,
    });
    expect(said[0]).toContain('gsroffset=24');
    expect(said[0]).toContain(encodeURIComponent('гори filetype:bitmap').replace(/%20/g, '+'));
    expect(said[1]).toMatch(/^VerseOrchestrator\/.* \(https:\/\/github\.com\//);
  });
  it('a picture keeps its credit on the list', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-credit-'));
    try {
      const img = addImage(dir, {
        name: 'Sunrise',
        full: PNG,
        small: PNG,
        w: 1,
        h: 1,
        credit: '  Jane  Doe · CC BY 4.0 ',
      });
      if ('refused' in img) throw new Error('refused');
      expect(imageEntry(img).credit).toBe('Jane Doe · CC BY 4.0');
      const plainOne = addImage(dir, { name: 'Mine', full: PNG, small: PNG, w: 1, h: 1 });
      if ('refused' in plainOne) throw new Error('refused');
      expect('credit' in imageEntry(plainOne)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
