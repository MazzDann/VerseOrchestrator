import { N_ } from '../i18n/index.js';
import { normalizeForSearch } from '../normalize.js';
import { songScore } from './songVectors.js';

/**
 * «Розкласти за темами» (1.25.0-beta.2, the author: «варіант із готовим списком, але якщо є модель
 * то вона може підказувати, або ж як світч щоб вона згенерувала і тоді виправити»). A bundle keeps
 * its own list of topics and which of its songs each holds (bundle.ts `topics`, `song_topics`), so
 * they travel with it. The model fills them two ways, both from the songs' vectors (beta.1):
 *   - by the list (`assignTopics`): each topic's words against every song's passages, a song takes
 *     the one to three topics it stands out in;
 *   - by itself (`proposeTopics`): the songs gathered into groups of close ones, each group named by
 *     the words its songs share and the rest don't — for the operator to rename and correct.
 * A topic the operator gave a song or took from it stays so: the model never writes over it.
 */

export interface SongTopic {
  /** what the list and the chips show (NFC) */
  name: string;
  /** the words the model compares with the songs; empty = the name alone */
  about: string;
}

/** Who put a topic on a song: the model, the operator, or the operator took the model's away. */
export type TopicMark = 'model' | 'user' | 'off';

/** The ready list (the plan's ~20 topics), its words written for the model — in the interface's language when the control window seeds it. */
export const DEFAULT_TOPICS: SongTopic[] = [
  {
    name: N_('Хвала'),
    about: N_('хвала і прославлення Бога, хваліть Господа, алілуя, славте Його'),
  },
  { name: N_('Подяка'), about: N_('подяка Богові, дякуємо Тобі за все, за Твої дари і милість') },
  {
    name: N_('Молитва'),
    about: N_('молитва, прохання до Бога, почуй мене, Господи, у молитві до Тебе'),
  },
  {
    name: N_('Спасіння'),
    about: N_('спасіння грішника, благодать, прощення гріхів, Христос мене спас'),
  },
  {
    name: N_('Покаяння'),
    about: N_('покаяння, сповідь гріха, навернися, блудний син повертається до Бога'),
  },
  { name: N_('Віра'), about: N_('віра і довіра Богові, упевненість у Ньому, вірю, тверда основа') },
  {
    name: N_('Надія'),
    about: N_('надія і розрада в смутку й випробуваннях, втіха, не падай духом'),
  },
  { name: N_('Любов Божа'), about: N_('любов Бога до людини, Бог є любов, так полюбив Бог світ') },
  { name: N_('Христос'), about: N_('Ісус Христос, Спаситель і Друг, ім’я Ісуса') },
  { name: N_('Хрест'), about: N_('хрест, Голгофа, кров Христа, страждання і смерть Ісуса за нас') },
  {
    name: N_('Пасха'),
    about: N_('воскресіння Христа, Христос воскрес, гріб порожній, Він переміг смерть'),
  },
  {
    name: N_('Різдво'),
    about: N_('Різдво Христове, народився Ісус у Вифлеємі, ясла, пастухи, ангели співають, зоря'),
  },
  {
    name: N_('Друге пришестя'),
    about: N_('друге пришестя Христа, Він прийде на хмарах, знаки часу, будьте готові'),
  },
  {
    name: N_('Небо'),
    about: N_('небо, вічна батьківщина, новий Єрусалим, вічний дім, золоті вулиці'),
  },
  { name: N_('Святий Дух'), about: N_('Святий Дух, сила з висоти, Утішитель, зійди на нас') },
  {
    name: N_('Хрещення'),
    about: N_('хрещення, занурення у воду, поховані з Христом, нове життя, обітниця Богові'),
  },
  {
    name: N_('Вечеря Господня'),
    about: N_('вечеря Господня, хліб і вино, тіло і кров Христа, причастя, омовіння ніг'),
  },
  { name: N_('Субота'), about: N_('субота, день спочинку, святий день Господній, сьомий день') },
  { name: N_('Сім’я'), about: N_('сім’я, батьки і діти, чоловік і дружина, рідний дім, мама') },
  { name: N_('Дитячі'), about: N_('пісня для дітей, маленькі діти, Ісус любить дітей') },
  {
    name: N_('Ранок і вечір'),
    about: N_('ранок і вечір, сонце сходить, новий день, вечірня молитва, нічний спочинок'),
  },
  { name: N_('Служіння'), about: N_('служіння, праця для Бога, місія, іди і проповідуй, жнива') },
];

/**
 * The second ready list (the author, 2026-11-23: the sections a hymnal of a service has): by where
 * in a service a song goes — «Початок», «Суботні», «До праці» … «Прихід» = the second coming.
 */
export const SERVICE_TOPICS: SongTopic[] = [
  {
    name: N_('Початок'),
    about: N_('початок богослужіння, прийдіть, зберімось у домі Божім, Господи, будь з нами'),
  },
  { name: N_('Суботні'), about: N_('субота, день спочинку, святий день Господній, сьомий день') },
  { name: N_('Прославлення'), about: N_('хвала і прославлення Бога, славте Господа, алілуя') },
  { name: N_('Біблія'), about: N_('Слово Боже, Біблія, Писання, світло на моїй дорозі') },
  { name: N_('Христос'), about: N_('Ісус Христос, Спаситель і Друг, ім’я Ісуса') },
  {
    name: N_('Посвячення'),
    about: N_('посвячення Богові, віддаю Тобі серце й життя, хочу йти за Тобою'),
  },
  { name: N_('Віра'), about: N_('віра і довіра Богові, вірю, тверда основа') },
  { name: N_('Молитва'), about: N_('молитва, почуй мене, Господи, у молитві до Тебе') },
  {
    name: N_('До праці'),
    about: N_('праця для Бога, жнива, іди і проповідуй, слуги Христові, до праці'),
  },
  { name: N_('Прихід'), about: N_('друге пришестя Христа, Він прийде на хмарах, будьте готові') },
  {
    name: N_('Вечеря'),
    about: N_('вечеря Господня, хліб і вино, тіло і кров Христа, омовіння ніг'),
  },
];

/** At most this many topics a song takes from the model. */
export const TOPICS_PER_SONG = 3;

/** What the model reads of a topic. */
export const topicQuery = (t: SongTopic): string =>
  t.about.trim() ? `${t.name}: ${t.about.trim()}` : t.name;

/** A topic's name as stored and compared: composed, single spaces, at most 60 characters. */
export const topicName = (s: string): string =>
  s.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 60);

/**
 * Every song's score for every topic: its passages' cosines to the topic's words, taken as a song
 * is in «~ тема» (songScore — the best passage and a little of the next). `vecs` = a song's
 * passages one after another (int8, the model's width), as `song_vectors` keeps them.
 */
export function topicScores(songs: Int8Array[], topics: Int8Array[]): number[][] {
  const d = topics[0]?.length ?? 0;
  return songs.map((x) => {
    const n = d ? Math.floor(x.length / d) : 0;
    return topics.map((q) => {
      const cos: number[] = [];
      for (let i = 0; i < n; i++) {
        let s = 0;
        const at = i * d;
        for (let j = 0; j < d; j++) s += x[at + j] * q[j];
        cos.push(s / (127 * 127));
      }
      return songScore(cos);
    });
  });
}

/** A word's stem for matching a topic's words in a song: normalized, its first five letters. */
const stemOf = (w: string): string => normalizeForSearch(w).slice(0, 5);

/**
 * Each topic's own words as stems (5+ letters, from its name and words) — not those three or more
 * topics share («Бога», «Христа»): they tell no topic apart.
 */
export function topicStems(topics: SongTopic[]): Set<string>[] {
  const stems = topics.map(
    (t) =>
      new Set(
        songWords(`${t.name} ${t.about}`)
          .filter((w) => w.length >= 5)
          .map(stemOf),
      ),
  );
  const used = new Map<string, number>();
  for (const set of stems) for (const x of set) used.set(x, (used.get(x) ?? 0) + 1);
  for (const set of stems) for (const x of [...set]) if (used.get(x)! > 2) set.delete(x);
  return stems;
}

/** How many of each topic's own words a song's text holds. */
export function topicMatches(text: string, stems: Set<string>[]): number[] {
  const words = new Set(songWords(text).map(stemOf));
  return stems.map((set) => [...set].filter((x) => words.has(x)).length);
}

/** What a topic's own word in a song adds (in deviations), for at most two of them. */
const WORD_WEIGHT = 0.6;

/**
 * The topics each song takes (indices into the topic list, the closest first). Some topics' words
 * are near every hymn («Хвала», «Христос»), so a topic's score counts against how it scores across
 * all the songs (`scores`: every song with vectors, not only the bundle's — a small bundle says
 * little of that); the topic's own words in the song's text (`matches`, aligned with `pick`) add
 * to it — the model hears «Різдво» poorly in Ukrainian, «Вифлеєм» in the text says it. A song takes
 * the topics it stands out in by `threshold` deviations, at most `most`, none further than
 * `spread` below its best. Measured on 2 544 hymns (2026-11-23, «Швидка»): 1.5 keeps the clear
 * ones and leaves about 30 % of the songs with none — the operator gives those theirs.
 */
export function assignTopics(
  scores: number[][],
  pick: number[],
  opts: { threshold?: number; spread?: number; most?: number; matches?: number[][] } = {},
): number[][] {
  const { threshold = 1.5, spread = 0.8, most = TOPICS_PER_SONG, matches } = opts;
  const k = scores[0]?.length ?? 0;
  const n = scores.length;
  const mean = new Array<number>(k).fill(0);
  const sd = new Array<number>(k).fill(0);
  for (const s of scores) for (let t = 0; t < k; t++) mean[t] += s[t] / n;
  for (const s of scores) for (let t = 0; t < k; t++) sd[t] += (s[t] - mean[t]) ** 2 / n;
  return pick.map((i, p) => {
    const z = scores[i].map(
      (v, t) =>
        (sd[t] > 0 ? (v - mean[t]) / Math.sqrt(sd[t]) : 0) +
        WORD_WEIGHT * Math.min(2, matches?.[p]?.[t] ?? 0),
    );
    const order = z.map((v, t) => [v, t] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    const best = order[0]?.[0] ?? 0;
    return order
      .filter(([v], j) => j < most && v >= threshold && v >= best - spread)
      .map(([, t]) => t);
  });
}

// ── «Нехай модель запропонує свої теми»: groups of close songs, named by their words ────────

/** Words that say nothing of a theme (Ukrainian and Russian hymn texts). */
const STOP = new Set(
  [
    'і й та але або що як так це цей ця ці той та те ті там тут коли де хто чому щоб навіть ще вже лише тільки', // i18n-ignore
    'мене мені мій моя моє мої мною тебе тобі твій твоя твоє твої тобою його йому їх їм нас нам наш наша наше', // i18n-ignore
    'наші вас вам ваш він вона воно вони ми ви я ти себе собі свій своя своє свої все всі весь вся усе усі', // i18n-ignore
    'буде будеш будемо бути був була були було є немає нема ні не ні без для від до за із зі на над під по про', // i18n-ignore
    'при через між серед біля коло понад аж хоч хай нехай бо адже ось оце тож тоді знов знову завжди ніколи', // i18n-ignore
    'и а но или что как так это этот эта эти тот та те там тут когда где кто чтоб чтобы даже еще уже лишь только', // i18n-ignore
    'меня мне мой моя мое моё мои мною тебя тебе твой твоя твое твоё твои тобой его ему их им нас нам наш наша', // i18n-ignore
    'наше наши вас вам ваш он она оно они мы вы я ты себя себе свой своя свое своё свои всё все весь вся', // i18n-ignore
    'будет будешь будем быть был была были было есть нет ни не без для от до за из на над под по про при', // i18n-ignore
    'через между среди около вот ведь пусть хоть тогда снова опять всегда никогда очень много можно нужно', // i18n-ignore
    'нами вами ними твою мою свою нашу вашу тобою собою всіх всім усіх усім буду будь будуть хочу може тому цього того свого твого мого нашого', // i18n-ignore
    'нами вами ними твою мою свою нашу вашу тобой собой всех всем буду будь будут хочу может тому этого того своего твоего моего нашего', // i18n-ignore
    'тебе тобі тебя знову снова лише нині ныне хай нехай коли когда тільки только дуже очень', // i18n-ignore
    'приспів припев куплет', // i18n-ignore
  ]
    .join(' ')
    .split(' '),
);

/** A song's distinct words (lowercase, letters only, 4+ letters, no stop words). */
export function songWords(text: string): string[] {
  const out = new Set<string>();
  for (const m of text
    .normalize('NFC')
    .toLowerCase()
    .matchAll(/\p{L}[\p{L}’'ʼ-]*/gu)) {
    const w = m[0].replace(/[’'ʼ-]+$/u, '');
    if (w.length >= 4 && !STOP.has(w)) out.add(w);
  }
  return [...out];
}

/** A tiny seeded random generator: the same songs give the same groups. */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

/** A song's one vector: the mean of its passages, of unit length. */
export function songVector(vecs: Int8Array, d: number): Float32Array {
  const v = new Float32Array(d);
  const n = Math.floor(vecs.length / d);
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) v[j] += vecs[i * d + j];
  let len = 0;
  for (let j = 0; j < d; j++) len += v[j] * v[j];
  len = Math.sqrt(len) || 1;
  for (let j = 0; j < d; j++) v[j] /= len;
  return v;
}

const dot = (a: Float32Array, b: Float32Array): number => {
  let s = 0;
  for (let j = 0; j < a.length; j++) s += a[j] * b[j];
  return s;
};

/** How many groups for `n` songs: about one per 25, between 4 and 16. */
export const groupsFor = (n: number): number => Math.max(4, Math.min(16, Math.round(n / 25)));

/**
 * The songs gathered into `k` groups of close ones (k-means on the unit vectors, k-means++ seeds,
 * a fixed seed), each named by the words its songs share and the other songs don't. A group under
 * three songs gets no topic. Returns the proposed topics and each song's (index or -1).
 */
export function proposeTopics(
  songs: { vec: Float32Array; words: string[] }[],
  k = groupsFor(songs.length),
): { topics: SongTopic[]; group: number[] } {
  const n = songs.length;
  if (n < 6) return { topics: [], group: songs.map(() => -1) };
  k = Math.min(k, Math.floor(n / 3));
  const rnd = seeded(n * 7919 + k);
  // k-means++ seeds
  const centres: Float32Array[] = [Float32Array.from(songs[Math.floor(rnd() * n)].vec)];
  while (centres.length < k) {
    const dist = songs.map((s) => Math.max(0, 1 - Math.max(...centres.map((c) => dot(s.vec, c)))));
    const sum = dist.reduce((a, b) => a + b, 0);
    let r = rnd() * sum;
    let i = 0;
    while (i < n - 1 && r > dist[i]) r -= dist[i++];
    centres.push(Float32Array.from(songs[i].vec));
  }
  const group = new Array<number>(n).fill(0);
  for (let round = 0; round < 25; round++) {
    let moved = 0;
    songs.forEach((s, i) => {
      let best = 0;
      let bestDot = -Infinity;
      centres.forEach((c, g) => {
        const v = dot(s.vec, c);
        if (v > bestDot) {
          bestDot = v;
          best = g;
        }
      });
      if (group[i] !== best) moved++;
      group[i] = best;
    });
    centres.forEach((c, g) => {
      c.fill(0);
      songs.forEach((s, i) => {
        if (group[i] === g) for (let j = 0; j < c.length; j++) c[j] += s.vec[j];
      });
      const len = Math.sqrt(dot(c, c)) || 1;
      for (let j = 0; j < c.length; j++) c[j] /= len;
    });
    if (!moved && round) break;
  }
  // how many songs hold each word, in all and in each group
  const all = new Map<string, number>();
  for (const s of songs) for (const w of s.words) all.set(w, (all.get(w) ?? 0) + 1);
  const named: { topic: SongTopic; size: number }[] = [];
  const renumber = new Map<number, number>();
  for (let g = 0; g < k; g++) {
    const members = songs.filter((_, i) => group[i] === g);
    // a handful of songs is no topic (3 in a small bundle, 2 % of a big one)
    if (members.length < Math.max(3, Math.round(n * 0.02))) continue;
    const here = new Map<string, number>();
    for (const s of members) for (const w of s.words) here.set(w, (here.get(w) ?? 0) + 1);
    const ranked = [...here]
      .filter(([, c]) => c >= Math.max(2, members.length * 0.12))
      .map(([w, c]) => {
        const p = c / members.length;
        const q = (all.get(w) ?? c) / n;
        return { w, score: (p - q) * Math.log(p / q) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (a.w < b.w ? -1 : 1));
    // one word per stem: «хрест» and «хреста» name one thing
    const words: string[] = [];
    for (const { w } of ranked) {
      if (words.some((x) => x.slice(0, 5) === w.slice(0, 5))) continue;
      words.push(w);
      if (words.length === 6) break;
    }
    if (!words.length) continue;
    const cap = (w: string) => w[0].toLocaleUpperCase('uk') + w.slice(1);
    // the name: its two words of five letters or more (short ones are rarely the theme)
    const long = words.filter((w) => w.length >= 5);
    const title = (long.length ? long : words).slice(0, 2).map(cap).join(' · ');
    let name = topicName(title);
    // two groups with the same words: the second one numbered
    for (let m = 2; named.some((x) => x.topic.name === name); m++)
      name = topicName(`${title} ${m}`);
    renumber.set(g, named.length);
    named.push({ topic: { name, about: words.join(', ') }, size: members.length });
  }
  return {
    topics: named.map((x) => x.topic),
    group: group.map((g) => renumber.get(g) ?? -1),
  };
}
