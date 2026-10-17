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

const extOf = (name: string): string => (/\.([^./\\]+)$/.exec(name)?.[1] ?? '').toLowerCase();

/**
 * What the app's computer converts (server/src/convert.ts — a Mac: .pages, .rtf, .doc … into the
 * library as documents, .key into «Пісні» as a .pptx); none elsewhere. Asked once per page.
 */
export type ConvertKind = { ext: string; to: 'docx' | 'pptx' };
let kinds: ConvertKind[] = [];
let asked: Promise<ConvertKind[]> | null = null;
export const loadConvertKinds = (): Promise<ConvertKind[]> =>
  (asked ??= api
    .convertKinds()
    .then((r) => (kinds = r.kinds))
    .catch(() => {
      asked = null; // an older server, or none yet: asked again next time
      return [];
    }));
/** A Mac's document kind the server reads by converting it (sent as it is). */
export const isConvertedDocument = (name: string): boolean =>
  kinds.some((k) => k.to === 'docx' && k.ext === extOf(name));
/** A presentation the server turns into a .pptx first (Keynote). */
export const isConvertedSong = (name: string): boolean =>
  kinds.some((k) => k.to === 'pptx' && k.ext === extOf(name));
/** The file picker's list: the app's own kinds and, on a Mac, the converted ones. */
export const documentAccept = (): string =>
  ['.docx', '.md', '.markdown', '.txt', '.pdf']
    .concat(kinds.filter((k) => k.to === 'docx').map((k) => `.${k.ext}`))
    .join(',');

/** Is this a file the documents take (by its name)? */
export const isDocumentFile = (name: string): boolean =>
  documentKind(name) !== null || isConvertedDocument(name);

/**
 * A document to open — after an import, or from a verse's «У документах» (1.17.0-beta.2), then
 * with the unit that cites it (`ord`) marked as found. The control window goes to «Документи».
 */
export const useDocOpen = create<{
  id: number | null;
  ord: number | null;
  open: (id: number | null, ord?: number | null) => void;
}>((set) => ({ id: null, ord: null, open: (id, ord = null) => set({ id, ord }) }));

export async function refreshDocuments(queryClient: QueryClient): Promise<void> {
  await Promise.all(DOC_KEYS.map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
}

/**
 * Add files to the documents, one by one; each says how it went. Returns the last one added (to
 * open it), or null. `onAdded` hears each one the library has (1.18.2: dropped on «Показ», it
 * goes next in the running order).
 */
export async function importDocuments(
  files: File[],
  queryClient: QueryClient,
  onAdded?: (doc: { id: number; file: string }, from: File) => void,
): Promise<number | null> {
  let last: number | null = null;
  for (const file of files) {
    if (!isDocumentFile(file.name)) {
      notifications.show({
        message: tr('«{file}» — не документ: додаються .docx, .md, .txt і .pdf', {
          file: file.name,
        }),
        color: 'gray',
      });
      continue;
    }
    try {
      const r = await api.importDocument(file);
      if (r.id != null) {
        last = r.id;
        onAdded?.({ id: r.id, file: r.file }, file);
      }
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
