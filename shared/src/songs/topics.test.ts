import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { SCHEMA_SQL } from '../library/schema.js';
import { normalizeForSearch } from '../normalize.js';
import {
  prepareBundle,
  readBundleTopics,
  stableSongId,
  upsertBundleSongs,
  visibleTopics,
  writeLibrarySongs,
  writeModelTopics,
  writeSongTopics,
  writeTopicList,
  type Bundle,
} from './bundle.js';
import {
  assignTopics,
  groupsFor,
  proposeTopics,
  songWords,
  topicMatches,
  topicStems,
  topicName,
} from './topics.js';

/** «Розкласти за темами» (1.25.0-beta.2): the pure parts and the bundle's tables. */

describe('topics by the list', () => {
  // ten songs, three topics: every song a little near every topic, songs 0 and 1 far nearer one
  const scores = Array.from({ length: 10 }, (_, i) => [
    0.3 + (i % 3) * 0.01,
    0.3 + ((i + 1) % 3) * 0.01,
    0.3 + ((i + 2) % 3) * 0.01,
  ]);
  scores[0] = [0.3, 0.6, 0.3];
  scores[1] = [0.55, 0.3, 0.5];

  it('a song takes the topics it stands out in, the nearest first; an ordinary one none', () => {
    const got = assignTopics(scores, [0, 1, 5]);
    expect(got[0]).toEqual([1]);
    expect(got[1]).toEqual([0, 2]);
    expect(got[2]).toEqual([]);
  });

  it('at most `most`, none further than `spread` below the best', () => {
    expect(assignTopics(scores, [1], { most: 1 })[0]).toEqual([0]);
    expect(assignTopics(scores, [1], { spread: 0 })[0]).toEqual([0]);
  });

  it('the topic’s own words in the song lift it over the threshold', () => {
    expect(assignTopics(scores, [5], { threshold: 1 })[0]).toEqual([]);
    expect(assignTopics(scores, [5], { threshold: 1, matches: [[2, 0, 0]] })[0]).toEqual([0]);
  });

  it('a topic’s own words: 5+ letters, not those three topics share', () => {
    const stems = topicStems([
      { name: 'Різдво', about: 'народження Христа у Вифлеємі' },
      { name: 'Пасха', about: 'воскресіння Христа' },
      { name: 'Хрест', about: 'страждання Христа' },
    ]);
    const stem = (w: string) => normalizeForSearch(w).slice(0, 5);
    expect([...stems[0]].sort()).toEqual(['Різдво', 'народження', 'Вифлеємі'].map(stem).sort());
    expect(stems[1].has('христ')).toBe(false);
    expect(topicMatches('Народився Христос у Вифлеємі', stems)).toEqual([2, 0, 0]);
  });

  it('a topic’s name: composed, single spaces, at most 60 characters', () => {
    expect(topicName('  Друге   пришестя ')).toBe('Друге пришестя');
    expect(topicName('x'.repeat(80))).toHaveLength(60);
  });
});

describe('topics of the model’s own', () => {
  const axis = (k: number, jitter: number) => {
    const v = new Float32Array(8);
    v[k] = 1;
    v[(k + 1) % 8] = jitter;
    const len = Math.hypot(...v);
    return v.map((x) => x / len);
  };

  it('close songs in one group, named by the words they share and the others don’t', () => {
    const songs = [
      ...Array.from({ length: 6 }, (_, i) => ({
        vec: axis(0, i * 0.02),
        words: songWords(`Субота святий день спочинку пісня ${i}`),
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        vec: axis(4, i * 0.02),
        words: songWords(`Воскрес Христос гробниця порожня пісня ${i}`),
      })),
    ];
    const found = proposeTopics(songs, 2);
    expect(found.topics).toHaveLength(2);
    expect(new Set(found.group.slice(0, 6)).size).toBe(1);
    expect(new Set(found.group.slice(6)).size).toBe(1);
    expect(found.group[0]).not.toBe(found.group[6]);
    const names = found.topics.map((t) => t.name).join(' | ');
    expect(names).toMatch(/Субота|Спочинку|Святий/);
    expect(names).toMatch(/Воскрес|Христос|Гробниця|Порожня/);
    expect(names).not.toMatch(/Пісня/); // in every song: says nothing
  });

  it('too few songs: no groups; the count grows with the bundle', () => {
    expect(proposeTopics([{ vec: axis(0, 0), words: ['слово'] }]).topics).toEqual([]);
    expect(groupsFor(50)).toBe(4);
    expect(groupsFor(500)).toBe(16);
  });
});

describe('a bundle’s topics', () => {
  const bundleDb = () => {
    const db = new Database(':memory:');
    prepareBundle(db);
    const slides = [{ text: 'a', style: null }];
    upsertBundleSongs(db, [
      { key: '1. А', number: 1, title: 'А', slides },
      { key: '2. Б', number: 2, title: 'Б', slides },
    ]);
    return db;
  };

  it('the model writes over its own marks only; the operator’s stay', () => {
    const db = bundleDb();
    writeTopicList(db, [
      { name: 'Хвала', about: '' },
      { name: 'Пасха', about: '' },
    ]);
    writeModelTopics(
      db,
      new Map([
        ['1. А', ['Хвала', 'Пасха']],
        ['2. Б', ['Пасха']],
      ]),
    );
    // the operator takes «Пасха» from А and gives «Хвала» to Б
    writeSongTopics(db, '1. А', ['Хвала']);
    writeSongTopics(db, '2. Б', ['Пасха', 'Хвала']);
    writeModelTopics(
      db,
      new Map([
        ['1. А', ['Пасха']],
        ['2. Б', []],
      ]),
    );
    const shown = visibleTopics(readBundleTopics(db));
    expect(shown.get('1. А')).toEqual(['Хвала']); // kept by the operator: theirs; «Пасха» stays off
    expect(shown.get('2. Б')).toEqual(['Хвала', 'Пасха']); // all the operator set stays
  });

  it('a rename keeps the songs, a topic dropped from the list leaves them', () => {
    const db = bundleDb();
    writeTopicList(db, [
      { name: 'Хвала', about: '' },
      { name: 'Пасха', about: '' },
    ]);
    writeModelTopics(db, new Map([['1. А', ['Хвала', 'Пасха']]]));
    writeTopicList(db, [{ name: 'Прославлення', about: 'хвала', was: 'Хвала' }]);
    const t = readBundleTopics(db);
    expect(t.list).toEqual([{ name: 'Прославлення', about: 'хвала' }]);
    expect(visibleTopics(t).get('1. А')).toEqual(['Прославлення']);
    expect(t.marks.some((m) => m.topic === 'Пасха')).toBe(false);
  });

  it('a bundle from before topics reads as none', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE songs (key TEXT PRIMARY KEY, number INTEGER, title TEXT, slides TEXT)');
    expect(readBundleTopics(db)).toEqual({ list: [], marks: [] });
  });

  it('the library gets every song’s topics, in the list’s order; an old library its table', () => {
    const db = bundleDb();
    writeTopicList(db, [
      { name: 'Хвала', about: '' },
      { name: 'Пасха', about: '' },
    ]);
    writeModelTopics(db, new Map([['1. А', ['Пасха', 'Хвала']]]));
    const bundles: Bundle[] = [
      {
        meta: { id: 'b1', name: 'ПС', format: 1, created: '' },
        songs: [
          { key: '1. А', number: 1, title: 'А', slides: [{ text: 'a', style: null }] },
          { key: '2. Б', number: 2, title: 'Б', slides: [{ text: 'b', style: null }] },
        ],
        topics: readBundleTopics(db),
      },
    ];
    const lib = new Database(':memory:');
    lib.exec(SCHEMA_SQL);
    writeLibrarySongs(lib, bundles);
    expect(lib.prepare('SELECT song_id, topic, ord FROM song_topics ORDER BY ord').all()).toEqual([
      { song_id: stableSongId('b1', '1. А'), topic: 'Хвала', ord: 0 },
      { song_id: stableSongId('b1', '1. А'), topic: 'Пасха', ord: 1 },
    ]);
    const old = new Database(':memory:');
    old.exec(
      'CREATE TABLE songs (id INTEGER PRIMARY KEY, number INTEGER, title TEXT, title_norm TEXT);' +
        'CREATE TABLE song_slides (song_id INTEGER, ord INTEGER, text TEXT, render TEXT);',
    );
    writeLibrarySongs(old, bundles);
    expect(old.prepare('SELECT COUNT(*) AS n FROM song_topics').get()).toEqual({ n: 2 });
  });
});
