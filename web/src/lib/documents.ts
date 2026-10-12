import { create } from 'zustand';
import type { QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { documentKind } from '@vo/shared';
import { api } from '../api';
import { tr } from '../i18n';
import { DOC_KEYS } from './songKeys';

/**
 * Documents (1.17.0-beta.1): files added from the control window — picked or dropped — go into the
 * documents folder on the server (modules/documents) and into the library at once. The folder is
 * the truth: a file put there by hand comes in by itself.
 */

/** Is this a file the documents take (by its name)? */
export const isDocumentFile = (name: string): boolean => documentKind(name) !== null;

/** The document to open once an import is done (the panel reads it). */
export const useDocOpen = create<{ id: number | null; open: (id: number | null) => void }>(
  (set) => ({ id: null, open: (id) => set({ id }) }),
);

export async function refreshDocuments(queryClient: QueryClient): Promise<void> {
  await Promise.all(DOC_KEYS.map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
}

/**
 * Add files to the documents, one by one; each says how it went. Returns the last one added (to
 * open it), or null.
 */
export async function importDocuments(
  files: File[],
  queryClient: QueryClient,
): Promise<number | null> {
  let last: number | null = null;
  for (const file of files) {
    if (!isDocumentFile(file.name)) {
      notifications.show({
        message: tr('«{file}» — не документ: додаються .docx, .md і .txt', { file: file.name }),
        color: 'gray',
      });
      continue;
    }
    try {
      const r = await api.importDocument(file);
      if (r.id != null) last = r.id;
      const replaced = r.replaced;
      notifications.show({
        message: r.same
          ? tr('«{file}» уже є в документах', { file: r.file })
          : replaced
            ? tr('«{file}» замінено новішим: стару копію відкладено', { file: r.file })
            : tr('Документ додано: {file}', { file: r.file }),
        color: r.same ? 'gray' : 'green',
        // the old copy waits in the folder's .trash (the last 20 deleted or replaced)
        autoClose: replaced ? 6000 : 2500,
      });
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося додати «{file}»: {error}', {
          file: file.name,
          error: tr((e as Error).message),
        }),
        color: 'red',
      });
    }
  }
  await refreshDocuments(queryClient);
  return last;
}
