import { useState } from 'react';
import type { PlaylistEntry, SharedPlaylist } from '../lib/commands';
import { N_, tr, useLang } from '../i18n';

const KIND_MARK: Record<PlaylistEntry['kind'], string> = {
  passage: '📖',
  song: '♪',
  text: N_('Т'), // «Текст»: one letter
  image: '🖼',
  album: '🗂',
  video: '🎞',
};

/**
 * The operator's running order on the speaker's phone (0.6.9, «Послідовність»): the list
 * with the current item marked; an item goes to the speaker's preview or on screen. Plain
 * elements with vo-remote-* classes, like the picker.
 */
export function RemotePlaylist({
  playlist,
  canShow,
  onTake,
  onClose,
}: {
  playlist: SharedPlaylist;
  canShow: boolean;
  onTake: (entry: PlaylistEntry, show: boolean) => void;
  onClose: () => void;
}) {
  useLang();
  const at = playlist.items.findIndex((i) => i.id === playlist.currentId);
  const [chosen, setChosen] = useState<string | null>(
    playlist.items[at + 1]?.id ?? playlist.items[0]?.id ?? null,
  );
  const entry = playlist.items.find((i) => i.id === chosen) ?? null;

  return (
    <div className="vo-remote-sheet" role="dialog" aria-label={tr('Послідовність показу')}>
      <header className="vo-remote-sheet-head">
        <button type="button" className="vo-remote-chip" onClick={onClose} aria-label={tr('Назад')}>
          ←
        </button>
        <strong className="vo-remote-sheet-title">{tr('Послідовність')}</strong>
      </header>
      <div className="vo-remote-sheet-body">
        {playlist.items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            className="vo-remote-item"
            data-selected={it.id === chosen ? 'true' : undefined}
            aria-current={it.id === playlist.currentId ? 'true' : undefined}
            onClick={() => setChosen(it.id)}
          >
            <span className="vo-verse-num">{i + 1}</span>
            <span aria-hidden style={{ opacity: 0.6 }}>
              {tr(KIND_MARK[it.kind])}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
            {it.id === playlist.currentId && <span className="vo-remote-now">{tr('зараз')}</span>}
          </button>
        ))}
      </div>
      <footer className="vo-remote-sheet-foot">
        <button
          type="button"
          className="vo-remote-btn"
          disabled={!entry}
          onClick={() => entry && onTake(entry, false)}
        >
          {tr('У передпоказ')}
        </button>
        {canShow && (
          <button
            type="button"
            className="vo-remote-btn vo-remote-btn-live"
            disabled={!entry}
            onClick={() => entry && onTake(entry, true)}
          >
            {tr('На екран')}
          </button>
        )}
      </footer>
    </div>
  );
}
