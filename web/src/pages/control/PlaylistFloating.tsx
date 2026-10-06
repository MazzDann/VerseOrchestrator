import { IconList } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { FloatingPanel } from '../../components/FloatingPanel';
import { PlaylistPanel } from '../../components/PlaylistPanel';
import { type SavedProgram, type SeqItem } from '../../playlistStore';
import { tr, useLang } from '../../i18n';

/** «Послідовність показу» as a floating panel, with the notices of saving and opening a program. */
export function PlaylistFloating({
  playlistOpen,
  setPlaylistOpen,
  playlistItems,
  playlistCurrentId,
  playlistSaved,
  activateItem,
  playlistRemove,
  playlistMove,
  playlistReorder,
  playlistClear,
  playlistCleared,
  playlistUndoClear,
  stepPlaylist,
  playlistSaveProgram,
  playlistLoadProgram,
  playlistDeleteProgram,
  playlistDeleted,
  playlistUndoDelete,
  playlistReplacedBy,
  playlistUndoLoad,
}: {
  playlistOpen: boolean;
  setPlaylistOpen: (open: boolean) => void;
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
  return (
    <FloatingPanel
      opened={playlistOpen}
      onClose={() => setPlaylistOpen(false)}
      title={tr('Послідовність показу')}
      storageKey="vo:playlistPanelPos"
      width={340}
      icon={<IconList size={16} />}
    >
      <PlaylistPanel
        items={playlistItems}
        currentId={playlistCurrentId}
        saved={playlistSaved}
        onActivate={activateItem}
        onRemove={playlistRemove}
        onMove={playlistMove}
        onReorder={playlistReorder}
        onClear={playlistClear}
        cleared={playlistCleared}
        onUndoClear={playlistUndoClear}
        onNext={() => stepPlaylist(1)}
        onPrev={() => stepPlaylist(-1)}
        onSave={(n) => {
          const exists = playlistSaved.some((p) => p.name === n.trim());
          playlistSaveProgram(n);
          notifications.show({
            message: exists
              ? tr('Програму оновлено: {name}', { name: n })
              : tr('Програму збережено: {name}', { name: n }),
            color: 'green',
            autoClose: 1500,
          });
        }}
        onLoad={(n) => {
          playlistLoadProgram(n);
          notifications.show({
            message: tr('Відкрито програму: {name}', { name: n }),
            color: 'brand',
            autoClose: 1500,
          });
        }}
        onDelete={playlistDeleteProgram}
        deletedProgram={
          playlistDeleted
            ? { name: playlistDeleted.program.name, index: playlistDeleted.index }
            : null
        }
        onUndoDelete={playlistUndoDelete}
        replacedBy={playlistReplacedBy}
        onUndoLoad={playlistUndoLoad}
      />
    </FloatingPanel>
  );
}
