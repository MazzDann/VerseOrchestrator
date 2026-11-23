import fs from 'node:fs';
import Database from 'better-sqlite3';
import {
  DEFAULT_TOPICS,
  EMBED_MODELS,
  assignTopics,
  librarySongIds,
  proposeTopics,
  songVector,
  songWords,
  topicQuery,
  topicMatches,
  topicScores,
  topicStems,
  type EmbedModelId,
  type SongTopic,
} from '@vo/shared';
import { bundleTopics, readBundles, saveModelTopics, saveTopicList } from '@vo/shared/songs-node';
import { readLibrarySongs } from './songVectors.js';
import { vectorsPath } from './vectorJob.js';

/**
 * «Розкласти за темами» (1.25.0-beta.2): the model puts a bundle's songs under topics, from the
 * songs' vectors (songVectors.ts) — by the bundle's list (`own: false`; the ready list when it has
 * none), or by groups of close songs it names itself (`own: true`), which then become the list.
 * Only the model's own marks change: a topic the operator gave a song or took from it stays.
 */

export type SortOutcome =
  | { ok: true; songs: number; sorted: number; topics: number; ms: number }
  | { ok: false; missing: 'bundle' | 'vectors' | 'model'; done?: number; total?: number };

/** A bundle sorted while most of its songs have no vectors would say little: wait for them. */
const ENOUGH = 0.9;

/** Every song's vectors of `model` (song id → its passages), the whole library's. */
function songVectorsOf(dataDir: string, model: EmbedModelId): Map<number, Int8Array> {
  const out = new Map<number, Int8Array>();
  if (!fs.existsSync(vectorsPath(dataDir))) return out;
  const db = new Database(vectorsPath(dataDir), { readonly: true });
  try {
    db.pragma('busy_timeout = 3000');
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'song_vectors'").get()) return out;
    for (const r of db
      .prepare('SELECT song_id, vecs FROM song_vectors WHERE model = ?')
      .all(model) as { song_id: number; vecs: Uint8Array }[])
      out.set(r.song_id, new Int8Array(r.vecs.buffer, r.vecs.byteOffset, r.vecs.byteLength));
  } finally {
    db.close();
  }
  return out;
}

export async function sortBundleTopics(d: {
  dataDir: string;
  libraryPath: string;
  dir: string;
  bundleId: string;
  own: boolean;
  model: EmbedModelId;
  /** a topic's words through the query model; null: the model can't be used now */
  embed: (text: string) => Promise<Int8Array | null>;
}): Promise<SortOutcome> {
  const started = Date.now();
  const bt = bundleTopics(d.dir, d.bundleId);
  if (!bt) return { ok: false, missing: 'bundle' };
  // the library ids of this bundle's songs (as writeLibrarySongs gave them)
  const bundles = readBundles(d.dir);
  const ids = librarySongIds(bundles);
  const at = bundles.findIndex((b) => b.meta.id === d.bundleId);
  if (at < 0) return { ok: false, missing: 'bundle' };
  const idOf = new Map(bundles[at].songs.map((s, i) => [s.key, ids[at][i]]));
  const vecs = songVectorsOf(d.dataDir, d.model);
  const mine = bt.keys
    .map((key) => ({ key, id: idOf.get(key)! }))
    .filter((s) => s.id !== undefined && vecs.has(s.id));
  if (!bt.keys.length) return { ok: true, songs: 0, sorted: 0, topics: 0, ms: 0 };
  if (mine.length < bt.keys.length * ENOUGH)
    return { ok: false, missing: 'vectors', done: mine.length, total: bt.keys.length };

  const byKey = new Map<string, string[]>();
  let topics: SongTopic[];
  // each song's words: its title and every slide once
  const texts = new Map(
    readLibrarySongs(d.libraryPath).map((s) => [s.id, s.passages.texts.join('\n')]),
  );
  if (d.own) {
    const dims = EMBED_MODELS[d.model].dims;
    const found = proposeTopics(
      mine.map((s) => ({
        vec: songVector(vecs.get(s.id)!, dims),
        words: songWords(texts.get(s.id) ?? ''),
      })),
    );
    // the topics the operator put on songs stay in the list, the model's new ones after them
    const used = new Set(bt.topics.marks.filter((m) => m.by === 'user').map((m) => m.topic));
    const kept = bt.topics.list.filter(
      (t) => used.has(t.name) && !found.topics.some((f) => f.name === t.name),
    );
    topics = [...kept, ...found.topics];
    saveTopicList(d.dir, d.bundleId, topics);
    mine.forEach((s, i) => {
      const g = found.group[i];
      byKey.set(s.key, g >= 0 ? [found.topics[g].name] : []);
    });
  } else {
    topics = bt.topics.list.length ? bt.topics.list : DEFAULT_TOPICS;
    if (!bt.topics.list.length) saveTopicList(d.dir, d.bundleId, topics);
    const asked: Int8Array[] = [];
    for (const t of topics) {
      const v = await d.embed(topicQuery(t));
      if (!v) return { ok: false, missing: 'model' };
      asked.push(v);
    }
    // a topic scores against every song of the library (a small bundle says little of the spread)
    const all = [...vecs];
    const index = new Map(all.map(([id], i) => [id, i]));
    const scores = topicScores(
      all.map(([, v]) => v),
      asked,
    );
    const stems = topicStems(topics);
    const picked = assignTopics(
      scores,
      mine.map((s) => index.get(s.id)!),
      { matches: mine.map((s) => topicMatches(texts.get(s.id) ?? '', stems)) },
    );
    mine.forEach((s, i) =>
      byKey.set(
        s.key,
        picked[i].map((t) => topics[t].name),
      ),
    );
  }
  saveModelTopics(d.dir, d.bundleId, byKey);
  return {
    ok: true,
    songs: bt.keys.length,
    sorted: [...byKey.values()].filter((t) => t.length).length,
    topics: topics.length,
    ms: Date.now() - started,
  };
}
