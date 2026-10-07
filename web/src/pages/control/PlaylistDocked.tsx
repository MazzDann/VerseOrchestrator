import { useMemo, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import { PlaylistPanel } from '../../components/PlaylistPanel';
import { type SavedProgram, type SeqItem } from '../../playlistStore';
import { tr, useLang } from '../../i18n';

/**
 * «Послідовність показу» under the monitors («Показ» in ShowList, 1.8.12-beta.6 — a floating panel
 * before), with the notices of saving and opening a program.
 */
export function PlaylistDocked(props: {
  playlistItems: SeqItem[];
  playlistCurrentId: string | null;
  playlistSaved: SavedProgram[];
  activateItem: (it: SeqItem) => void;
  playlistRemove: (id: string) => void;
  playlistMove: (id: string, dir: -1 | 1) => void;
  playlistReorder: (from: number, to: number) => void;
  playlistClear: () => void;
  playlistCleared: number;
  playlistUndoClear: () => void;
  stepPlaylist: (delta: 1 | -1) => void;
  playlistSaveProgram: (name: string) => void;
  playlistLoadProgram: (name: string) => void;
  playlistDeleteProgram: (name: string) => void;
  playlistDeleted: { program: SavedProgram; index: number } | null;
  playlistUndoDelete: () => void;
  playlistReplacedBy: string | null;
  playlistUndoLoad: () => void;
}) {
  useLang();
  const {
    playlistItems,
    playlistCurrentId,
    playlistSaved,
    playlistCleared,
    playlistDeleted,
    playlistReplacedBy,
  } = props;
  // Under the monitors it is drawn with every render of the control window — a verse step too:
  // the panel is memo'd and its handlers stay the same functions, reading the latest props (60
  // items cost a step +115 ms in dev before, 1.8.12-beta.6)
  const latest = useRef(props);
  latest.current = props;
  const actions = useMemo(
    () => ({
      onActivate: (it: SeqItem) => latest.current.activateItem(it),
      onRemove: (id: string) => latest.current.playlistRemove(id),
      onMove: (id: string, dir: -1 | 1) => latest.current.playlistMove(id, dir),
      onReorder: (from: number, to: number) => latest.current.playlistReorder(from, to),
      onClear: () => latest.current.playlistClear(),
      onUndoClear: () => latest.current.playlistUndoClear(),
      onNext: () => latest.current.stepPlaylist(1),
      onPrev: () => latest.current.stepPlaylist(-1),
      onSave: (n: string) => {
        const exists = latest.current.playlistSaved.some((p) => p.name === n.trim());
        latest.current.playlistSaveProgram(n);
        notifications.show({
          message: exists
            ? tr('Програму оновлено: {name}', { name: n })
            : tr('Програму збережено: {name}', { name: n }),
          color: 'green',
          autoClose: 1500,
        });
      },
      onLoad: (n: string) => {
        latest.current.playlistLoadProgram(n);
        notifications.show({
          message: tr('Відкрито програму: {name}', { name: n }),
          color: 'brand',
          autoClose: 1500,
        });
      },
      onDelete: (n: string) => latest.current.playlistDeleteProgram(n),
      onUndoDelete: () => latest.current.playlistUndoDelete(),
      onUndoLoad: () => latest.current.playlistUndoLoad(),
    }),
    [],
  );
  const deletedProgram = useMemo(
    () =>
      playlistDeleted ? { name: playlistDeleted.program.name, index: playlistDeleted.index } : null,
    [playlistDeleted],
  );
  return (
    <PlaylistPanel
      items={playlistItems}
      currentId={playlistCurrentId}
      saved={playlistSaved}
      cleared={playlistCleared}
      deletedProgram={deletedProgram}
      replacedBy={playlistReplacedBy}
      {...actions}
    />
  );
}
