import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { RemotePassage } from '../lib/commands';

type Step = 'translations' | 'books' | 'chapters' | 'verses';

/** At most this many translations on one slide (the control window's limit too). */
const MAX_TRANSLATIONS = 5;

/**
 * The speaker's verse picker on the phone (1.5.1): translations → book → chapter → verse,
 * read straight from the library API (read-only, open to the LAN). A verse goes to the
 * speaker's own preview («У передпоказ») or straight on screen («На екран»); the
 * operator's selection is never touched. Plain elements with vo-remote-* classes, like
 * the rest of the phone pages.
 */
export function RemotePicker({
  start,
  translationIds: initialIds,
  canShow,
  onPick,
  onClose,
}: {
  /** where to open: the speaker's cursor, else what is on screen, else the book list */
  start: RemotePassage | null;
  translationIds: number[];
  canShow: boolean;
  onPick: (p: RemotePassage, show: boolean) => void;
  onClose: () => void;
}) {
  const [ids, setIds] = useState<number[]>(initialIds);
  const [book, setBook] = useState<number | null>(start?.bookNumber ?? null);
  const [chapter, setChapter] = useState<number | null>(start?.chapter ?? null);
  const [verse, setVerse] = useState<number | null>(start?.verses[0] ?? null);
  const [step, setStep] = useState<Step>(
    ids.length === 0 ? 'translations' : start ? 'verses' : 'books',
  );
  const [filter, setFilter] = useState('');
  const primary = ids[0] ?? null;

  const translations = useQuery({ queryKey: ['translations'], queryFn: api.translations });
  const books = useQuery({
    queryKey: ['books', primary],
    queryFn: () => api.books(primary!),
    enabled: primary != null,
  });
  const chapters = useQuery({
    queryKey: ['chapters', primary, book],
    queryFn: () => api.chapters(primary!, book!),
    enabled: primary != null && book != null && step !== 'books',
  });
  const verses = useQuery({
    queryKey: ['verses', primary, book, chapter],
    queryFn: () => api.verses(primary!, book!, chapter!),
    enabled: primary != null && book != null && chapter != null && step === 'verses',
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
    else if (step === 'books') onClose();
    else go(book == null ? 'books' : 'verses');
  };
  const toggleTranslation = (id: number) =>
    setIds((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length < MAX_TRANSLATIONS
          ? [...cur, id]
          : cur,
    );
  const pick = (show: boolean) => {
    if (primary == null || book == null || chapter == null || verse == null) return;
    onPick({ translationIds: ids, bookNumber: book, chapter, verses: [verse] }, show);
  };

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
          : `${bookName} ${chapter ?? ''}`;

  return (
    <div className="vo-remote-sheet" role="dialog" aria-label="Вибір вірша">
      <header className="vo-remote-sheet-head">
        <button type="button" className="vo-remote-chip" onClick={back} aria-label="Назад">
          ←
        </button>
        <strong className="vo-remote-sheet-title">{title}</strong>
        {step !== 'translations' && (
          <button type="button" className="vo-remote-chip" onClick={() => go('translations')}>
            {abbrs || 'Переклади'}
          </button>
        )}
        <button type="button" className="vo-remote-chip" onClick={onClose} aria-label="Закрити">
          ✕
        </button>
      </header>

      {(step === 'books' || step === 'translations') && (
        <input
          className="vo-remote-filter"
          placeholder={step === 'books' ? 'Фільтр книг…' : 'Фільтр перекладів…'}
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

        {(translations.isError || books.isError || verses.isError) && (
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
      ) : step === 'verses' ? (
        <footer className="vo-remote-sheet-foot">
          <button
            type="button"
            className="vo-remote-btn"
            disabled={verse == null}
            onClick={() => pick(false)}
          >
            У передпоказ
          </button>
          {canShow && (
            <button
              type="button"
              className="vo-remote-btn vo-remote-btn-live"
              disabled={verse == null}
              onClick={() => pick(true)}
            >
              На екран
            </button>
          )}
        </footer>
      ) : null}
    </div>
  );
}
