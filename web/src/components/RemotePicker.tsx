import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { RemoteTarget } from '../lib/commands';

type Step = 'translations' | 'books' | 'chapters' | 'verses' | 'songs' | 'stanzas';

/** At most this many translations on one slide (the control window's limit too). */
const MAX_TRANSLATIONS = 5;

/**
 * The speaker's picker on the phone: Bible verses (1.5.1: translations → book → chapter →
 * verse) or song stanzas (1.5.3: search → song → stanza), read straight from the library
 * API (read-only, open to the LAN). The choice goes to the speaker's own preview
 * («У передпоказ») or straight on screen («На екран»); the operator's selection is never
 * touched. Plain elements with vo-remote-* classes, like the rest of the phone pages.
 */
export function RemotePicker({
  start,
  translationIds: initialIds,
  canShow,
  verses: versesAllowed,
  songs: songsAllowed,
  onPick,
  onClose,
}: {
  /** where to open: the speaker's cursor, else what is on screen, else the book list */
  start: RemoteTarget | null;
  translationIds: number[];
  canShow: boolean;
  /** what this remote may choose — each granted by the operator on its own (1.5.3) */
  verses: boolean;
  songs: boolean;
  onPick: (t: RemoteTarget, show: boolean) => void;
  onClose: () => void;
}) {
  const startPassage = start?.kind === 'verses' ? start.passage : null;
  const startSong = start?.kind === 'song' ? start.song : null;
  const [ids, setIds] = useState<number[]>(initialIds);
  const [book, setBook] = useState<number | null>(startPassage?.bookNumber ?? null);
  const [chapter, setChapter] = useState<number | null>(startPassage?.chapter ?? null);
  const [verse, setVerse] = useState<number | null>(startPassage?.verses[0] ?? null);
  const [songId, setSongId] = useState<number | null>(startSong?.songId ?? null);
  const [stanza, setStanza] = useState<number | null>(startSong?.stanza ?? null);
  // open where it makes sense — and only in a mode this remote may use
  const [step, setStep] = useState<Step>(() => {
    if (songsAllowed && (startSong || !versesAllowed)) return startSong ? 'stanzas' : 'songs';
    if (ids.length === 0) return 'translations';
    return startPassage ? 'verses' : 'books';
  });
  const [filter, setFilter] = useState('');
  const [songQuery, setSongQuery] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setSongQuery(filter.trim()), 250);
    return () => window.clearTimeout(t);
  }, [filter]);
  const primary = ids[0] ?? null;
  const songsMode = step === 'songs' || step === 'stanzas';

  const translations = useQuery({ queryKey: ['translations'], queryFn: api.translations });
  const books = useQuery({
    queryKey: ['books', primary],
    queryFn: () => api.books(primary!),
    enabled: primary != null && !songsMode,
  });
  const chapters = useQuery({
    queryKey: ['chapters', primary, book],
    queryFn: () => api.chapters(primary!, book!),
    enabled: primary != null && book != null && (step === 'chapters' || step === 'verses'),
  });
  const verses = useQuery({
    queryKey: ['verses', primary, book, chapter],
    queryFn: () => api.verses(primary!, book!, chapter!),
    enabled: primary != null && book != null && chapter != null && step === 'verses',
  });
  const songs = useQuery({
    queryKey: ['songs', songQuery],
    queryFn: () => api.songs(songQuery),
    enabled: step === 'songs',
  });
  const song = useQuery({
    queryKey: ['song', songId],
    queryFn: () => api.song(songId!),
    enabled: songId != null && step === 'stanzas',
  });

  const bookName = books.data?.find((b) => b.bookNumber === book)?.longName ?? '';
  const q = filter.trim().toLowerCase();
  const shownBooks = useMemo(
    () =>
      (books.data ?? []).filter(
        (b) => !q || b.longName.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q),
      ),
    [books.data, q],
  );
  const shownTranslations = useMemo(
    () =>
      (translations.data ?? []).filter(
        (t) => !q || t.abbr.toLowerCase().includes(q) || t.title.toLowerCase().includes(q),
      ),
    [translations.data, q],
  );

  const go = (s: Step) => {
    setFilter('');
    setStep(s);
  };
  const back = () => {
    if (step === 'verses') go('chapters');
    else if (step === 'chapters') go('books');
    else if (step === 'stanzas') go('songs');
    else if (step === 'translations') go(book == null ? 'books' : 'verses');
    else onClose();
  };
  const toggleTranslation = (id: number) =>
    setIds((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length < MAX_TRANSLATIONS
          ? [...cur, id]
          : cur,
    );
  const chosen: RemoteTarget | null =
    step === 'stanzas'
      ? songId != null && stanza != null
        ? { kind: 'song', song: { songId, stanza } }
        : null
      : primary != null && book != null && chapter != null && verse != null
        ? {
            kind: 'verses',
            passage: { translationIds: ids, bookNumber: book, chapter, verses: [verse] },
          }
        : null;

  const abbrs = ids
    .map((id) => translations.data?.find((t) => t.id === id)?.abbr)
    .filter(Boolean)
    .join(', ');
  const title =
    step === 'translations'
      ? 'Переклади'
      : step === 'books'
        ? 'Книга'
        : step === 'chapters'
          ? bookName
          : step === 'verses'
            ? `${bookName} ${chapter ?? ''}`
            : step === 'songs'
              ? 'Пісні'
              : song.data
                ? `№${song.data.number ?? ''} ${song.data.title}`
                : 'Пісня';

  return (
    <div className="vo-remote-sheet" role="dialog" aria-label="Вибір вірша або пісні">
      <header className="vo-remote-sheet-head">
        <button type="button" className="vo-remote-chip" onClick={back} aria-label="Назад">
          ←
        </button>
        <strong className="vo-remote-sheet-title">{title}</strong>
        {!songsMode && step !== 'translations' && (
          <button type="button" className="vo-remote-chip" onClick={() => go('translations')}>
            {abbrs || 'Переклади'}
          </button>
        )}
        <button type="button" className="vo-remote-chip" onClick={onClose} aria-label="Закрити">
          ✕
        </button>
      </header>

      {versesAllowed && songsAllowed && (
        <div className="vo-remote-row vo-remote-modes" role="group" aria-label="Що вибрати">
          <button
            type="button"
            className="vo-remote-chip"
            aria-pressed={!songsMode}
            data-selected={!songsMode ? 'true' : undefined}
            onClick={() =>
              go(
                ids.length === 0
                  ? 'translations'
                  : book == null
                    ? 'books'
                    : chapter == null
                      ? 'chapters'
                      : 'verses',
              )
            }
          >
            Біблія
          </button>
          <button
            type="button"
            className="vo-remote-chip"
            aria-pressed={songsMode}
            data-selected={songsMode ? 'true' : undefined}
            onClick={() => go(songId == null ? 'songs' : 'stanzas')}
          >
            Пісні
          </button>
        </div>
      )}

      {(step === 'books' || step === 'translations' || step === 'songs') && (
        <input
          className="vo-remote-filter"
          placeholder={
            step === 'books'
              ? 'Фільтр книг…'
              : step === 'songs'
                ? 'Номер або слова пісні…'
                : 'Фільтр перекладів…'
          }
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
        />
      )}

      <div className="vo-remote-sheet-body">
        {step === 'translations' &&
          shownTranslations.map((t) => {
            const on = ids.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                className="vo-remote-item"
                aria-pressed={on}
                data-selected={on ? 'true' : undefined}
                disabled={!on && ids.length >= MAX_TRANSLATIONS}
                onClick={() => toggleTranslation(t.id)}
              >
                <span aria-hidden className="vo-remote-check">
                  {on ? '✓' : ''}
                </span>
                <span>
                  <strong>{t.abbr}</strong> <span style={{ opacity: 0.65 }}>{t.title}</span>
                </span>
              </button>
            );
          })}

        {step === 'books' &&
          shownBooks.map((b) => (
            <button
              key={b.bookNumber}
              type="button"
              className="vo-remote-item"
              data-selected={b.bookNumber === book ? 'true' : undefined}
              onClick={() => {
                if (b.bookNumber !== book) {
                  setChapter(null);
                  setVerse(null);
                }
                setBook(b.bookNumber);
                go('chapters');
              }}
            >
              {b.longName}
            </button>
          ))}

        {step === 'chapters' && (
          <div className="vo-remote-grid">
            {(chapters.data ?? []).map((c) => (
              <button
                key={c}
                type="button"
                className="vo-remote-item"
                data-selected={c === chapter ? 'true' : undefined}
                onClick={() => {
                  if (c !== chapter) setVerse(null);
                  setChapter(c);
                  go('verses');
                }}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {step === 'verses' &&
          (verses.data ?? []).map((v) => (
            <button
              key={v.verse}
              type="button"
              className="vo-remote-item vo-remote-verse"
              data-selected={v.verse === verse ? 'true' : undefined}
              onClick={() => setVerse(v.verse)}
            >
              <span className="vo-verse-num">{v.verse}</span>
              <span>{v.text}</span>
            </button>
          ))}

        {step === 'songs' &&
          (songs.data ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              className="vo-remote-item"
              data-selected={s.id === songId ? 'true' : undefined}
              onClick={() => {
                if (s.id !== songId) setStanza(null);
                setSongId(s.id);
                go('stanzas');
              }}
            >
              <span className="vo-verse-num">{s.number ?? ''}</span>
              <span>{s.title}</span>
            </button>
          ))}

        {step === 'stanzas' &&
          (song.data?.slides ?? []).map((sl, i) => (
            <button
              key={i}
              type="button"
              className="vo-remote-item vo-remote-verse"
              data-selected={i === stanza ? 'true' : undefined}
              onClick={() => setStanza(i)}
            >
              <span className="vo-verse-num">{i + 1}</span>
              <span style={{ whiteSpace: 'pre-line' }}>{sl.text}</span>
            </button>
          ))}

        {(translations.isError || books.isError || verses.isError || songs.isError) && (
          <p style={{ opacity: 0.7 }}>Бібліотека недоступна з цього телефона.</p>
        )}
      </div>

      {step === 'translations' ? (
        <footer className="vo-remote-sheet-foot">
          <button
            type="button"
            className="vo-remote-btn vo-remote-btn-primary"
            disabled={ids.length === 0}
            onClick={() => go(book == null ? 'books' : chapter == null ? 'chapters' : 'verses')}
          >
            Готово{ids.length ? ` (${ids.length})` : ''}
          </button>
        </footer>
      ) : step === 'verses' || step === 'stanzas' ? (
        <footer className="vo-remote-sheet-foot">
          <button
            type="button"
            className="vo-remote-btn"
            disabled={!chosen}
            onClick={() => chosen && onPick(chosen, false)}
          >
            У передпоказ
          </button>
          {canShow && (
            <button
              type="button"
              className="vo-remote-btn vo-remote-btn-live"
              disabled={!chosen}
              onClick={() => chosen && onPick(chosen, true)}
            >
              На екран
            </button>
          )}
        </footer>
      ) : null}
    </div>
  );
}
