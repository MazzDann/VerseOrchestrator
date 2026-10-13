import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FORGOTTEN_MS,
  RESUME_MS,
  SEEN_MS,
  createStats,
  localDay,
  shownOf,
  statsCsv,
} from './stats.js';

const live = (extra: object) => ({ status: 'live', reference: '', text: '', ...extra });
const song = (songId: number, stanza = 0, label = `Пісня ${songId}`) =>
  live({ reference: label, source: { kind: 'song', songId, stanza } });
const verses = (bookNumber: number, chapter: number, vs: number[], page = 0) =>
  live({
    reference: `${bookNumber} ${chapter}:${vs[0]}`,
    source: {
      kind: 'verses',
      translationIds: [1],
      bookNumber,
      chapter,
      verses: vs,
      page,
      reveal: 0,
    },
  });

let dir = '';
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = '';
});
function open(clock: { t: number }) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-stats-'));
  const file = path.join(dir, 'stats.db');
  return { file, stats: createStats(file, () => clock.t) };
}

describe('what a screen shows, as a row', () => {
  it('a passage, a song, a document, the app’s own slides; nothing for an empty screen', () => {
    expect(shownOf(verses(500, 3, [16, 17, 18]))).toMatchObject({
      kind: 'verses',
      key: 'v:500:3:16-18',
      book: 500,
      chapter: 3,
      from: 16,
      to: 18,
    });
    // another stanza or page of the same thing is the same showing
    expect(shownOf(song(7, 3))?.key).toBe(shownOf(song(7, 0))?.key);
    expect(shownOf(verses(500, 3, [16, 17, 18], 1))?.key).toBe('v:500:3:16-18');
    expect(
      shownOf(live({ reference: 'Лекція', source: { kind: 'doc', docId: 4, unit: 9 } })),
    ).toMatchObject({ kind: 'doc', key: 'd:4', docId: 4, label: 'Лекція' });
    expect(shownOf(live({ kind: 'cover' }))?.kind).toBe('cover');
    expect(shownOf(live({ kind: 'countdown' }))?.kind).toBe('countdown');
    expect(shownOf(live({ kind: 'picture', text: 'logo.png' }))).toMatchObject({
      kind: 'picture',
      label: 'logo.png',
    });
    expect(shownOf(live({ reference: 'Оголошення', text: 'Обід о 13:00' }))).toMatchObject({
      kind: 'text',
      detail: 'Обід о 13:00',
    });
    for (const status of ['blank', 'black', 'empty'])
      expect(shownOf({ ...song(7), status })).toBeNull();
    expect(shownOf(null)).toBeNull();
    // a speaker's remote put it there
    expect(shownOf(live({ source: { kind: 'song', songId: 2, by: 'Іван' } }))?.by).toBe('Іван');
  });
});

describe('the statistics file', () => {
  it('one row per showing, with how long it stayed; a quick return goes on', () => {
    const clock = { t: Date.UTC(2026, 9, 11, 9) };
    const { stats } = open(clock);
    stats.note(shownOf(song(7)));
    clock.t += 30_000;
    stats.note(shownOf(song(7, 1))); // the next stanza: the same showing
    clock.t += 30_000;
    stats.note(null); // «Очистити»
    clock.t += RESUME_MS - 1000;
    stats.note(shownOf(song(7, 2))); // back soon: goes on
    clock.t += 60_000;
    stats.note(shownOf(verses(500, 3, [16])));
    clock.t += 10_000;
    stats.note(null);
    clock.t += RESUME_MS + 1000;
    stats.note(shownOf(verses(500, 3, [16]))); // back later: a showing of its own
    clock.t += 5_000;
    const rows = stats.rows(0, clock.t + 1);
    expect(rows.map((r) => [r.kind, r.until === null ? null : r.until - r.at])).toEqual([
      ['song', 60_000 + RESUME_MS - 1000 + 60_000],
      ['verses', 10_000],
      ['verses', null], // still on screen
    ]);
    const s = stats.summary(0, clock.t + 1);
    expect(s.total).toMatchObject({ shows: 3, days: 1 });
    // the song's gap (off screen, then back) isn't time on screen; the one still on screen counts up to now
    expect(rows[0].gap).toBe(RESUME_MS - 1000);
    expect(s.total.ms).toBe(120_000 + 10_000 + 5_000);
    expect(s.songs).toEqual([expect.objectContaining({ songId: 7, label: 'Пісня 7', shows: 1 })]);
    expect(s.books).toEqual([expect.objectContaining({ book: 500, shows: 2 })]);
    expect(s.passages[0]).toMatchObject({ book: 500, shows: 2 });
    stats.shutdown();
  });

  it('counts by song and by day, names a song by its latest label, finds the forgotten ones', () => {
    const day = 24 * 3600_000;
    const clock = { t: Date.UTC(2026, 6, 5, 9) };
    const { stats } = open(clock);
    const show = (item: object, ms = 60_000) => {
      stats.note(shownOf(item));
      clock.t += ms;
      stats.note(null);
      clock.t += RESUME_MS + 1;
    };
    show(song(1, 0, 'Стара назва'));
    show(song(2));
    clock.t += FORGOTTEN_MS + day; // song 1 not since — song 2 comes back
    show(song(2));
    show(song(3));
    clock.t += day;
    show(song(1, 0, 'Нова назва'));
    const s = stats.summary(0, clock.t);
    expect(s.songs.map((x) => [x.songId, x.shows])).toEqual([
      [1, 2],
      [2, 2],
      [3, 1],
    ]);
    expect(s.songs[0].label).toBe('Нова назва');
    expect(s.days.length).toBe(3);
    expect(s.days.reduce((n, d) => n + d.shows, 0)).toBe(5);
    // the period's own figures
    const recent = stats.summary(clock.t - 2 * day, clock.t);
    expect(recent.total.shows).toBe(3);
    stats.shutdown();
  });

  it('«давно не співали»: shown before, not for eight weeks', () => {
    const clock = { t: Date.UTC(2026, 0, 5, 9) };
    const { stats } = open(clock);
    stats.note(shownOf(song(9)));
    clock.t += 60_000;
    stats.note(null);
    clock.t += FORGOTTEN_MS - 3600_000;
    expect(stats.summary(0, clock.t).forgotten).toEqual([]);
    clock.t += 2 * 3600_000;
    expect(stats.summary(0, clock.t).forgotten).toEqual([
      expect.objectContaining({ songId: 9, shows: 1 }),
    ]);
    stats.shutdown();
  });

  it('a showing a crash left open is closed at the next start; «Очистити» empties it', () => {
    const clock = { t: Date.UTC(2026, 9, 11, 9) };
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { stats, file } = open(clock);
    stats.note(shownOf(song(5)));
    // on screen a while: its mark every SEEN_MS
    for (let i = 0; i < 3; i++) {
      clock.t += SEEN_MS;
      vi.advanceTimersByTime(SEEN_MS);
    }
    clock.t += 5000;
    vi.useRealTimers();
    // no shutdown: the process was killed — its length is kept up to the last mark
    const again = createStats(file, () => clock.t + 1000);
    const start = clock.t - 3 * SEEN_MS - 5000;
    expect(again.rows(0, clock.t + 2).map((r) => r.until! - r.at)).toEqual([3 * SEEN_MS]);
    expect(again.rows(0, clock.t + 2)[0].at).toBe(start);
    again.clear();
    expect(again.rows(0, clock.t + 2)).toEqual([]);
    again.note(shownOf(song(5)));
    expect(again.rows(0, clock.t + 2000).length).toBe(1);
    again.shutdown();
    stats.shutdown();
  });

  it('CSV for a spreadsheet: a BOM, a head, quoted cells', () => {
    const at = new Date(2026, 9, 11, 9, 5, 0).getTime();
    const csv = statsCsv([
      {
        id: 1,
        at,
        until: at + 90_000,
        kind: 'text',
        label: 'Оголошення, важливе',
        detail: 'Кажуть "так"',
        book: null,
        chapter: null,
        verse_from: null,
        verse_to: null,
        song_id: null,
        doc_id: null,
        by: null,
        gap: 30_000,
      },
      {
        id: 2,
        at,
        until: at + 1000,
        kind: 'text',
        label: '=1+2',
        detail: '- пункт',
        book: null,
        chapter: null,
        verse_from: null,
        verse_to: null,
        song_id: null,
        doc_id: null,
        by: '@пульт',
        gap: 0,
      },
    ]);
    // a formula's first sign stays words in a spreadsheet
    expect(csv).toContain(`,text,'=1+2,'- пункт,,,,,,,'@пульт`);
    expect(csv.startsWith('﻿start,end,seconds,kind,label')).toBe(true);
    expect(csv).toContain(
      `${localDay(at)} 09:05:00,${localDay(at)} 09:06:30,60,text,"Оголошення, важливе","Кажуть ""так"""`,
    );
  });
});
