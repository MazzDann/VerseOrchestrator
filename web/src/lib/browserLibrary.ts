import type { QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useDataSource } from '../dataSourceStore';
import { tr } from '../i18n';
import { addDroppedFile, type Dropped } from './engine/restore';

/** The files the browser's engine takes: modules (.SQLite3, converted here) and library segments. */
export const BROWSER_DROPPABLE = /\.(sqlite3|vodb|vodb\.gz)$/i;

/**
 * Modules and segments into this browser's engine (0.3.8; from anywhere on the window since
 * 1.17.1): each converted / merged in turn, what made it in before a failure stays and is
 * remembered, the data source turns to «У браузері», every read is asked again.
 */
export async function addToBrowserLibrary(
  files: File[],
  queryClient: QueryClient,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<Dropped[]> {
  const list = files.filter((f) => BROWSER_DROPPABLE.test(f.name));
  const added: Dropped[] = [];
  try {
    for (const [i, f] of list.entries()) {
      const r = await addDroppedFile(f, (stage) =>
        onProgress?.(
          i,
          list.length,
          `${stage === 'convert' ? tr('Перетворення') : tr('Збирання')}: ${f.name}`,
        ),
      );
      added.push(r);
    }
  } catch (e) {
    notifications.show({
      message: tr('Не вдалося додати файл: {error}', { error: tr((e as Error).message) }),
      color: 'red',
    });
  } finally {
    if (added.length > 0) {
      const { segments, setSegments, setSource } = useDataSource.getState();
      setSegments([...segments, ...added.map((d) => d.key).filter((k) => !segments.includes(k))]);
      setSource('local');
      void queryClient.invalidateQueries();
      notifications.show({
        message: added.map((d) => d.summary).join('\n'),
        color: 'green',
        autoClose: 4000,
      });
    }
  }
  return added;
}
