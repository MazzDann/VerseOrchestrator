import { create } from 'zustand';
import { N_ } from '@vo/shared';
import type { CatalogQueue, CatalogRow, ModuleKindId, ModulesInfo } from '../api';
import { fmtNumber, tr } from '../i18n';

/**
 * «Модулі» (1.15.0-beta.1, users' ask F1005-02): what the panel needs of Module's catalog and of
 * modules/ — the server does the downloading (server/src/catalog.ts).
 */

export const KIND_LABEL: Record<ModuleKindId, string> = {
  bibles: N_('Біблії'),
  dictionaries: N_('Словники'),
  commentaries: N_('Коментарі'),
  crossreferences: N_('Паралельні місця'),
};

const KIND_SUFFIX: Record<ModuleKindId, string> = {
  bibles: '',
  dictionaries: '.dictionary',
  commentaries: '.commentaries',
  crossreferences: '.crossreferences',
};

/** The file a catalog module is kept as in modules/ (catalog.ts `moduleFileName`). */
export function moduleFileName(fil: string, kind: ModuleKindId): string {
  const base = kind === 'bibles' ? fil : fil.slice(0, fil.lastIndexOf('.'));
  return `${base}${KIND_SUFFIX[kind]}.SQLite3`;
}

/** in the library · in modules/ but left out of it · not here */
export type ModuleState = 'library' | 'folder' | 'none';

/** Does the library take this file? No selection yet, or «all» for its kind: it does. */
export function inLibrary(info: ModulesInfo, kind: ModuleKindId, file: string): boolean {
  const sel = info.selection?.[kind];
  return sel == null || sel.some((n) => n.toLowerCase() === file.toLowerCase());
}

export function moduleState(row: CatalogRow, info: ModulesInfo | undefined): ModuleState {
  if (!info) return 'none';
  const name = moduleFileName(row.fil, row.kind).toLowerCase();
  const file = (info.files[row.kind] ?? []).find((f) => f.toLowerCase() === name);
  if (!file) return 'none';
  return inLibrary(info, row.kind, file) ? 'library' : 'folder';
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

/** The registry's title in the interface language when it has one. */
export const titleOf = (row: CatalogRow, ui: string): string => row.titles?.[ui] ?? row.title;

/** «2,1 МБ», «690 КБ» */
export function formatSize(bytes: number): string {
  if (bytes < 1048576) return tr('{n} КБ', { n: fmtNumber(Math.max(1, Math.round(bytes / 1024))) });
  return tr('{n} МБ', {
    n: fmtNumber(bytes / 1048576, { maximumFractionDigits: bytes < 10 * 1048576 ? 1 : 0 }),
  });
}

/** The rows of one kind in one language ('' = every language) that hold every word of the query. */
export function filterRows(
  rows: CatalogRow[],
  o: { kind: ModuleKindId; lang: string; query: string },
): CatalogRow[] {
  const words = o.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows
    .filter((r) => r.kind === o.kind && (!o.lang || r.lang === o.lang))
    .filter((r) => {
      if (!words.length) return true;
      const hay = [r.abbr, r.title, ...Object.values(r.titles ?? {})].join(' ').toLocaleLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => a.abbr.localeCompare(b.abbr));
}

/** The languages of a kind with their counts: the interface language first, then the most modules. */
export function languagesOf(rows: CatalogRow[], kind: ModuleKindId, ui: string) {
  const count = new Map<string, number>();
  for (const r of rows) if (r.kind === kind) count.set(r.lang, (count.get(r.lang) ?? 0) + 1);
  return [...count.entries()]
    .map(([code, n]) => ({ code, n }))
    .sort(
      (a, b) =>
        Number(b.code === ui) - Number(a.code === ui) || b.n - a.n || a.code.localeCompare(b.code),
    );
}

export type QueueItem = CatalogQueue['items'][number];

/** Waiting or under way: «Скасувати» still means something. */
export const isActive = (i: QueueItem | undefined): boolean =>
  !!i && (i.phase === 'waiting' || i.phase === 'downloading' || i.phase === 'placing');

/** 0–100 for a download under way. */
export const percent = (i: QueueItem): number =>
  i.total > 0 ? Math.min(100, Math.round((i.got / i.total) * 100)) : 0;

/** Who opened «Модулі» and on which tab: the settings, the empty library, the palette. */
export const useModulesPanel = create<{
  open: boolean;
  tab: 'catalog' | 'library';
  show: (tab?: 'catalog' | 'library') => void;
  hide: () => void;
  setTab: (tab: 'catalog' | 'library') => void;
}>((set) => ({
  open: false,
  tab: 'catalog',
  show: (tab) => set((s) => ({ open: true, tab: tab ?? s.tab })),
  hide: () => set({ open: false }),
  setTab: (tab) => set({ tab }),
}));
