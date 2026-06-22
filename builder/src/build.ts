import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { stripTags, normalizeForSearch, cleanDefinition, strongNumbers } from '@vo/shared';
import { SCHEMA_SQL } from './schema.js';
import { readModule } from './mybible.js';
import { readDictionary, dictTopicNorm, strongLang } from './dictionary.js';
import { readCrossrefs, readCommentaries } from './extras.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA_DIR = path.join(repoRoot, 'data');
const OUT_PATH = path.join(DATA_DIR, 'library.db');

/**
 * Pick the modules folder: $MODULES_DIR, else the project `modules/` folder,
 * else `data/modules`, else fall back to the reference copy in `old/MyBible`.
 */
function resolveModulesDir(): string {
  if (process.env.MODULES_DIR) return path.resolve(process.env.MODULES_DIR);
  for (const dir of [path.join(repoRoot, 'modules'), path.join(DATA_DIR, 'modules')]) {
    if (fs.existsSync(dir) && listModuleFiles(dir).length > 0) return dir;
  }
  return path.join(repoRoot, 'old', 'MyBible');
}

const SKIP = /\.(commentaries|dictionary|crossreferences|subheadings)\.SQLite3$/i;

function listModuleFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.sqlite3') && !SKIP.test(f))
    .map((f) => path.join(dir, f));
}

function listDictionaryFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.dictionary\.SQLite3$/i.test(f))
    .map((f) => path.join(dir, f));
}

function listByExt(dir: string, re: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => re.test(f))
    .map((f) => path.join(dir, f));
}

function fileHash(file: string): string {
  const s = fs.statSync(file);
  return `${s.size}:${Math.round(s.mtimeMs)}`;
}

/**
 * Some module files on disk have corrupted (mojibake) Cyrillic names — box-drawing
 * characters from a UTF-8/CP866 mix-up at extraction time. When the filename-derived
 * abbreviation is garbage, fall back to a short label taken from the (clean) title.
 */
function cleanAbbr(rawAbbr: string, title: string): string {
  if (!/[─-╿�]/.test(rawAbbr)) return rawAbbr;
  let label = (title || '').split(',')[0].trim();
  const words = label.split(/\s+/);
  if (label.length > 14 && words.length > 1) label = words.slice(0, 2).join(' ');
  return label || rawAbbr;
}

function buildOnce(): void {
  const modulesDir = resolveModulesDir();
  const files = listModuleFiles(modulesDir);
  const dictFiles = listDictionaryFiles(modulesDir);
  const xrefFiles = listByExt(modulesDir, /\.crossreferences\.SQLite3$/i);
  const commentaryFiles = listByExt(modulesDir, /\.commentaries\.SQLite3$/i);
  console.log(`[builder] modules dir: ${modulesDir}`);
  console.log(
    `[builder] candidate files: ${files.length} modules, ${dictFiles.length} dictionaries, ` +
      `${xrefFiles.length} crossrefs, ${commentaryFiles.length} commentaries`,
  );

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(OUT_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000'); // tolerate the server reading concurrently

  let translationId = 0;
  let totalVerses = 0;

  const run = db.transaction(() => {
    // Create the schema first, then prepare statements against the new tables.
    // Everything runs inside one transaction so readers (the server) keep seeing
    // the previous data until the rebuild commits.
    db.exec(SCHEMA_SQL);

    const insTranslation = db.prepare(
      `INSERT INTO translations (id, abbr, title, language, rtl, has_strong, source_file, source_hash)
       VALUES (@id, @abbr, @title, @language, @rtl, @hasStrong, @sourceFile, @sourceHash)`,
    );
    const insBook = db.prepare(
      `INSERT INTO books (translation_id, book_number, short_name, long_name, color)
       VALUES (@translationId, @bookNumber, @shortName, @longName, @color)`,
    );
    const insVerse = db.prepare(
      `INSERT INTO verses (translation_id, book_number, chapter, verse, text, text_norm, text_raw)
       VALUES (@translationId, @bookNumber, @chapter, @verse, @text, @textNorm, @textRaw)`,
    );
    const insVerseStrong = db.prepare(
      `INSERT INTO verse_strongs (translation_id, verse_id, strong) VALUES (?, ?, ?)`,
    );
    const insName = db.prepare(
      `INSERT INTO book_names (translation_id, book_number, name_norm)
       VALUES (@translationId, @bookNumber, @nameNorm)`,
    );

    for (const file of files) {
      const name = path.basename(file);
      let mod;
      try {
        mod = readModule(file);
      } catch (err) {
        console.warn(`[builder]   skip ${name}: ${(err as Error).message}`);
        continue;
      }
      if (!mod) continue;

      translationId += 1;
      const abbr = cleanAbbr(name.replace(/\.SQLite3$/i, ''), mod.info.description);
      insTranslation.run({
        id: translationId,
        abbr,
        title: mod.info.description || abbr,
        language: mod.info.language,
        rtl: mod.info.rtl ? 1 : 0,
        hasStrong: mod.info.hasStrong ? 1 : 0,
        sourceFile: name,
        sourceHash: fileHash(file),
      });

      for (const b of mod.books) {
        const shortName = b.short_name ?? '';
        const longName = b.long_name ?? '';
        insBook.run({
          translationId,
          bookNumber: b.book_number,
          shortName,
          longName,
          color: b.book_color ?? '',
        });
        const names = new Set(
          [longName, shortName].map((n) => normalizeForSearch(n)).filter(Boolean),
        );
        for (const nameNorm of names) {
          insName.run({ translationId, bookNumber: b.book_number, nameNorm });
        }
      }

      let strongRows = 0;
      for (const v of mod.verses) {
        const raw = v.text ?? '';
        const info = insVerse.run({
          translationId,
          bookNumber: v.book_number,
          chapter: v.chapter,
          verse: v.verse,
          text: stripTags(raw),
          textNorm: normalizeForSearch(raw),
          textRaw: raw,
        });
        if (mod.info.hasStrong) {
          const verseId = Number(info.lastInsertRowid);
          for (const num of strongNumbers(raw)) {
            insVerseStrong.run(translationId, verseId, num);
            strongRows += 1;
          }
        }
      }

      totalVerses += mod.verses.length;
      if (strongRows > 0) {
        console.log(`[builder]     ${strongRows} Strong index rows`);
      }
      console.log(
        `[builder]   + ${abbr} (${mod.info.language || '??'}) — ${mod.books.length} books, ${mod.verses.length} verses`,
      );
    }

    db.exec("INSERT INTO verses_fts(verses_fts) VALUES('rebuild')");

    // Import dictionary modules (*.dictionary.SQLite3) — Strong's and explanatory.
    const insDict = db.prepare(
      `INSERT INTO dictionaries (id, abbr, name, language, type, is_strong)
       VALUES (@id, @abbr, @name, @language, @type, @isStrong)`,
    );
    const insEntry = db.prepare(
      `INSERT INTO dictionary_entries (dictionary_id, topic, topic_norm, strong_lang, definition)
       VALUES (@dictionaryId, @topic, @topicNorm, @strongLang, @definition)`,
    );
    let dictId = 0;
    for (const file of dictFiles) {
      const dictName = path.basename(file).replace(/\.dictionary\.SQLite3$/i, '');
      let dict;
      try {
        dict = readDictionary(file);
      } catch (err) {
        console.warn(`[builder]   skip dict ${dictName}: ${(err as Error).message}`);
        continue;
      }
      if (!dict) continue;
      dictId += 1;
      insDict.run({
        id: dictId,
        abbr: dictName,
        name: dict.name || dictName,
        language: dict.language,
        type: dict.type,
        isStrong: dict.isStrong ? 1 : 0,
      });
      for (const e of dict.entries) {
        insEntry.run({
          dictionaryId: dictId,
          topic: String(e.topic),
          topicNorm: dictTopicNorm(String(e.topic), dict.isStrong),
          strongLang: dict.isStrong ? strongLang(String(e.topic)) : '',
          definition: cleanDefinition(e.definition ?? ''),
        });
      }
      console.log(
        `[builder]   dict ${dictName} (${dict.isStrong ? 'strong' : 'explanatory'}) — ${dict.entries.length} entries`,
      );
    }

    // Cross-references — merge every crossref module into one table.
    const insXref = db.prepare(
      `INSERT INTO cross_references (book, chapter, verse, book_to, chapter_to, verse_to_start, verse_to_end)
       VALUES (@book, @chapter, @verse, @bookTo, @chapterTo, @verseToStart, @verseToEnd)`,
    );
    for (const file of xrefFiles) {
      const name = path.basename(file);
      try {
        const xrefs = readCrossrefs(file);
        for (const x of xrefs) insXref.run(x);
        console.log(`[builder]   xref ${name} — ${xrefs.length} refs`);
      } catch (err) {
        console.warn(`[builder]   skip xref ${name}: ${(err as Error).message}`);
      }
    }

    // Commentaries — one `source` per module; clean the HTML to plain text at import.
    const insComment = db.prepare(
      `INSERT INTO commentaries (source, book, chapter_from, verse_from, chapter_to, verse_to, marker, text)
       VALUES (@source, @book, @chapterFrom, @verseFrom, @chapterTo, @verseTo, @marker, @text)`,
    );
    for (const file of commentaryFiles) {
      const source = path.basename(file).replace(/\.commentaries\.SQLite3$/i, '');
      try {
        const entries = readCommentaries(file);
        for (const c of entries) {
          insComment.run({
            source,
            book: c.book,
            chapterFrom: c.chapterFrom,
            verseFrom: c.verseFrom,
            chapterTo: c.chapterTo,
            verseTo: c.verseTo,
            marker: c.marker,
            text: cleanDefinition(c.text),
          });
        }
        console.log(`[builder]   commentary ${source} — ${entries.length} notes`);
      } catch (err) {
        console.warn(`[builder]   skip commentary ${source}: ${(err as Error).message}`);
      }
    }
  });

  const started = Date.now();
  run();
  // VACUUM needs exclusive access; skip it quietly if a reader (the server) is
  // attached. The data is already committed by this point regardless.
  try {
    db.exec('VACUUM');
  } catch (err) {
    console.warn(`[builder] VACUUM skipped: ${(err as Error).message}`);
  }
  db.close();
  console.log(
    `[builder] done: ${translationId} translations, ${totalVerses} verses -> ${OUT_PATH} (${Date.now() - started}ms)`,
  );
}

function watch(): void {
  const modulesDir = resolveModulesDir();
  console.log(`[builder] watching ${modulesDir} for changes...`);
  let timer: NodeJS.Timeout | null = null;
  fs.watch(modulesDir, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      console.log('[builder] change detected, rebuilding...');
      try {
        buildOnce();
      } catch (err) {
        console.error('[builder] rebuild failed:', err);
      }
    }, 750);
  });
}

buildOnce();
if (process.argv.includes('--watch')) watch();
