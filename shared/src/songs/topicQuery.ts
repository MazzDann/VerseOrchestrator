import { N_, translate } from '../i18n/index.js';
import { normalizeForSearch } from '../normalize.js';
import { DEFAULT_TOPICS, SERVICE_TOPICS, topicStems, type SongTopic } from './topics.js';

/**
 * «~ Різдво» in the songs (1.25.0-beta.7): one word alone tells a small model little — «Швидка» took
 * «Пасха» for the cross (1 of the first 20 songs about the resurrection). A query that names a ready
 * topic is asked with the topic's own words too, and a song whose text holds them comes up.
 */

/**
 * Beginnings of words that say a topic by themselves, in place of those of its own words: the model
 * hears «Різдво» poorly even with them, and they are words of many a hymn («народ…», «співа…»).
 */
const SURE_WORDS: [name: string, words: string][] = [
  [
    N_('Різдво'),
    'вифле віфле різдв рождеств ясла яслах яслях немовл младенец волхв пастух пастуш коляд', // i18n-ignore
  ],
];

const READY: SongTopic[] = [...DEFAULT_TOPICS, ...SERVICE_TOPICS];
const named = (s: string) => normalizeForSearch(s);

let byName: Map<string, SongTopic> | null = null;
function topicsByName(): Map<string, SongTopic> {
  if (byName) return byName;
  byName = new Map();
  for (const t of READY)
    for (const name of [t.name, translate('en', t.name)])
      if (!byName.has(named(name))) byName.set(named(name), t);
  return byName;
}

let stems: Map<string, Set<string>> | null = null;
/** The words that tell a ready topic from the others, as stems. */
function stemsOf(topic: SongTopic): Set<string> {
  if (!stems) {
    const sets = topicStems(DEFAULT_TOPICS);
    stems = new Map(DEFAULT_TOPICS.map((t, i) => [t.name, sets[i]]));
    for (const t of SERVICE_TOPICS) if (!stems.has(t.name)) stems.set(t.name, topicStems([t])[0]);
    for (const [name, words] of SURE_WORDS) stems.set(name, new Set(words.split(' ').map(named)));
  }
  return stems.get(topic.name) ?? new Set();
}

export interface TopicQuery {
  /** the topic's words, for the model */
  about: string;
  /** its own words as stems, for the songs' texts */
  stems: Set<string>;
}

/** What a query that names a ready topic (in either language) asks for; null for any other. */
export function topicQueryOf(query: string): TopicQuery | null {
  const topic = topicsByName().get(named(query));
  return topic ? { about: topic.about, stems: stemsOf(topic) } : null;
}

/** What each of a topic's own words in a song adds to its closeness, for at most two of them. */
export const TOPIC_WORD_BOOST = 0.1;

/** How many of the topic's own words a normalized text holds (2 are enough to say). */
export function topicWordsIn(textNorm: string, q: TopicQuery): number {
  const text = ` ${textNorm}`;
  let n = 0;
  for (const stem of q.stems) if (text.includes(` ${stem}`) && ++n === 2) break;
  return n;
}
