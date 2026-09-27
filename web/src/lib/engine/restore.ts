import { api } from '../../api';
import { useDataSource } from '../../dataSourceStore';
import { localEngine } from './index';

/**
 * Download (or revalidate from the HTTP cache — segments carry an ETag) and merge the
 * given segment files into the browser engine. `onProgress` gets per-file updates.
 */
export async function loadSegments(
  files: string[],
  onProgress?: (file: string, state: 'download' | 'merge' | 'done', info?: string) => void,
): Promise<void> {
  const loaded = new Set((await localEngine.status()).map((s) => s.key));
  for (const file of files) {
    if (loaded.has(file)) {
      onProgress?.(file, 'done');
      continue;
    }
    onProgress?.(file, 'download');
    const bytes = await api.segmentBytes(file);
    onProgress?.(file, 'merge');
    const r = await localEngine.add(file, bytes);
    onProgress?.(file, 'done', `${r.verses} віршів, ${r.ms} мс`);
  }
}

/** On app start in «у браузері» mode: bring back the remembered segments. */
export function restoreLocalSegments(): void {
  const { source, segments } = useDataSource.getState();
  if (source !== 'local' || segments.length === 0) return;
  localEngine.setReady(loadSegments(segments));
}
