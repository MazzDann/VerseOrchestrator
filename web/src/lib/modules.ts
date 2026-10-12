import { create } from 'zustand';
import { N_ } from '@vo/shared';
import type { ModuleKindId, ModulesInfo } from '../api';
import { fmtNumber, tr } from '../i18n';

/** «Модулі»: what the panel needs of the module files in modules/ and the library's selection. */

export const KIND_LABEL: Record<ModuleKindId, string> = {
  bibles: N_('Біблії'),
  dictionaries: N_('Словники'),
  commentaries: N_('Коментарі'),
  crossreferences: N_('Паралельні місця'),
  subheadings: N_('Підзаголовки'),
};

/** Does the library take this file? No selection yet, or «all» for its kind: it does. */
export function inLibrary(info: ModulesInfo, kind: ModuleKindId, file: string): boolean {
  const sel = info.selection?.[kind];
  return sel == null || sel.some((n) => n.toLowerCase() === file.toLowerCase());
}

/** «uk» → «Українська», «zh Simplified» → «Китайська Simplified»; a code it can't name stays. */
export function langName(code: string, ui: string): string {
  if (!code) return tr('Інша мова');
  const [base, ...rest] = code.split(' ');
  try {
    const name = new Intl.DisplayNames([ui], { type: 'language' }).of(base === 'iw' ? 'he' : base);
    if (!name || name.toLowerCase() === base.toLowerCase()) return code;
    return [name[0].toLocaleUpperCase(ui) + name.slice(1), ...rest].join(' ');
  } catch {
    return code;
  }
}

/** «2,1 МБ», «690 КБ» */
export function formatSize(bytes: number): string {
  if (bytes < 1048576) return tr('{n} КБ', { n: fmtNumber(Math.max(1, Math.round(bytes / 1024))) });
  return tr('{n} МБ', {
    n: fmtNumber(bytes / 1048576, { maximumFractionDigits: bytes < 10 * 1048576 ? 1 : 0 }),
  });
}

/** Who opened «Модулі»: the settings, the empty library, the palette. */
export const useModulesPanel = create<{
  open: boolean;
  show: () => void;
  hide: () => void;
}>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
