import { Fragment, isValidElement, useEffect } from 'react';
import { create } from 'zustand';
import {
  notificationsStore,
  type NotificationData,
  type NotificationsState,
} from '@mantine/notifications';

/**
 * The control window's notices, kept for the session (the user's ask during a Mac check,
 * 2026-10-09): most of them close in 1.5–3 s, and one that went by while the operator looked at
 * another window was lost for good. «Сповіщення» in the header lists them, newest first.
 *
 * Nothing at the ~126 `notifications.show` call sites changes: a subscriber on Mantine's own
 * store (`notificationsStore`) records each notice the first time its id appears there, and a
 * later change under the same id (a «…» notice that turns into «Готово») updates that entry.
 * Only words are kept — never the element itself: a notice's «Скасувати» button must not live on
 * in the list. Kept in sessionStorage, so a reload of the window keeps them; the control window
 * alone installs the subscriber (`useNoticeRecorder` in pages/Control.tsx).
 */

/** How many the list keeps: the newest. */
export const NOTICE_HISTORY_MAX = 100;

const STORAGE_KEY = 'vo:notices';

/** Deep enough for any notice's layout; a cycle can't hang the walk. */
const MAX_DEPTH = 40;

export interface NoticeEntry {
  /** the notice's id in Mantine's store */
  id: string;
  /** when it first appeared, ms */
  at: number;
  /** its Mantine colour («green», «red», …); none — the default */
  color?: string;
  title?: string;
  /** the message as plain text */
  text: string;
  /** the entry's own number: one id can come back later as a notice of its own (a list key) */
  seq: number;
  /** the number of its last change: above `seen` → not seen yet */
  rev: number;
}

/** A notice's words, as the recorder reads them. */
export interface NoticeInput {
  id: string;
  color?: string;
  title?: string;
  text: string;
}

export interface NoticeHistoryState {
  /** newest first, at most NOTICE_HISTORY_MAX */
  entries: NoticeEntry[];
  /** the last `rev` the operator saw (the list open) */
  seen: number;
  /** the last number given to an entry's `seq` or `rev` */
  last: number;
  /** a notice that appeared */
  record: (notice: NoticeInput, at?: number) => void;
  /** a notice on screen changed: its newest entry takes the new words (none left — a new one) */
  update: (notice: NoticeInput, at?: number) => void;
  /** the list was opened: everything in it is seen */
  markSeen: () => void;
  clear: () => void;
}

/** What sessionStorage gives — or a test's stand-in. */
export type NoticeStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Entries not seen yet (the dot and the count on «Сповіщення»). */
export const unseenCount = (s: Pick<NoticeHistoryState, 'entries' | 'seen'>): number =>
  s.entries.reduce((n, e) => (e.rev > s.seen ? n + 1 : n), 0);

// ---------------------------------------------------------------- words

/**
 * A notice's message (or title) as plain text: a string as it is, a number as digits, an element
 * by its children's words, all the way down; `null`, `undefined` and booleans say nothing. Two
 * elements side by side (a line and its button) get a space between their words; runs of spaces
 * close up, each line is trimmed, `<br>` starts a new one.
 */
export function noticeText(node: unknown): string {
  return textOf(node, 0)
    .split('\n')
    .map((line) => line.replace(/[ \t\r]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function textOf(node: unknown, depth: number): string {
  if (node == null || typeof node === 'boolean' || depth > MAX_DEPTH) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'bigint') return String(node);
  if (Array.isArray(node)) return joinChildren(node, depth);
  if (isValidElement(node)) {
    if (node.type === 'br') return '\n';
    return textOf((node.props as { children?: unknown }).children, depth + 1);
  }
  // a render function, a symbol, a plain object: no words
  return '';
}

/** A block of its own — an element that isn't a Fragment (trx's pieces stay inline). */
const isBlock = (node: unknown) => isValidElement(node) && node.type !== Fragment;

function joinChildren(list: readonly unknown[], depth: number): string {
  let out = '';
  let prevBlock = false;
  for (const child of list) {
    const text = textOf(child, depth + 1);
    if (!text) continue;
    const block = isBlock(child);
    if (prevBlock && block && !/\s$/.test(out) && !/^\s/.test(text)) out += ' ';
    out += text;
    prevBlock = block;
  }
  return out;
}

/** What the list keeps of one of Mantine's notices. */
export function noticeInput(n: NotificationData): NoticeInput | null {
  if (n.id == null) return null;
  const title = noticeText(n.title);
  return {
    id: String(n.id),
    color: typeof n.color === 'string' && n.color ? n.color : undefined,
    title: title || undefined,
    text: noticeText(n.message),
  };
}

// ---------------------------------------------------------------- the store

const sessionStore = (): NoticeStorage | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    // blocked site data: the getter itself throws
    return null;
  }
};

const isEntry = (e: unknown): e is NoticeEntry => {
  const x = e as Partial<NoticeEntry> | null;
  return (
    !!x &&
    typeof x === 'object' &&
    typeof x.id === 'string' &&
    typeof x.text === 'string' &&
    Number.isFinite(x.at) &&
    Number.isFinite(x.seq) &&
    Number.isFinite(x.rev) &&
    (x.color === undefined || typeof x.color === 'string') &&
    (x.title === undefined || typeof x.title === 'string')
  );
};

type Kept = Pick<NoticeHistoryState, 'entries' | 'seen' | 'last'>;

const EMPTY: Kept = { entries: [], seen: 0, last: 0 };

function restore(storage: () => NoticeStorage | null): Kept {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const data = (JSON.parse(raw) ?? {}) as { entries?: unknown; seen?: unknown; last?: unknown };
    const list: unknown[] = Array.isArray(data.entries) ? data.entries : [];
    const entries = list.filter(isEntry).slice(0, NOTICE_HISTORY_MAX);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const top = entries.reduce((m, e) => Math.max(m, e.seq, e.rev), 0);
    const last = Math.max(top, num(data.last) ?? 0);
    const seen = Math.min(num(data.seen) ?? last, last);
    return { entries, seen, last };
  } catch {
    // a broken copy, or storage that refuses to be read: a fresh list
    return EMPTY;
  }
}

function save(storage: () => NoticeStorage | null, s: Kept): void {
  try {
    storage()?.setItem(
      STORAGE_KEY,
      JSON.stringify({ entries: s.entries, seen: s.seen, last: s.last }),
    );
  } catch {
    // a full or blocked storage (Safari private mode): the list still works for this page
  }
}

const hasWords = (n: NoticeInput) => !!n.text || !!n.title;

/**
 * A notice history with its own storage (tests pass a stand-in; the app uses sessionStorage).
 * Restored when made, saved on every change.
 */
export function createNoticeHistory(storage: () => NoticeStorage | null = sessionStore) {
  const store = create<NoticeHistoryState>()((set) => ({
    ...restore(storage),
    record: (n, at = Date.now()) =>
      set((s) => {
        if (!hasWords(n)) return s;
        const last = s.last + 1;
        const entry: NoticeEntry = { ...n, at, seq: last, rev: last };
        return { last, entries: [entry, ...s.entries].slice(0, NOTICE_HISTORY_MAX) };
      }),
    update: (n, at = Date.now()) =>
      set((s) => {
        if (!hasWords(n)) return s;
        const i = s.entries.findIndex((e) => e.id === n.id);
        const last = s.last + 1;
        if (i < 0) {
          const entry: NoticeEntry = { ...n, at, seq: last, rev: last };
          return { last, entries: [entry, ...s.entries].slice(0, NOTICE_HISTORY_MAX) };
        }
        const entries = [...s.entries];
        // the time it first appeared stays: its place in the list doesn't move
        entries[i] = { ...entries[i], color: n.color, title: n.title, text: n.text, rev: last };
        return { last, entries };
      }),
    markSeen: () => set((s) => (s.seen === s.last ? s : { seen: s.last })),
    clear: () => set((s) => ({ entries: [], seen: s.last })),
  }));
  store.subscribe((s, prev) => {
    if (s.entries !== prev.entries || s.seen !== prev.seen) save(storage, s);
  });
  return store;
}

export type NoticeHistoryStore = ReturnType<typeof createNoticeHistory>;

/** The control window's list. */
export const useNoticeHistory = createNoticeHistory();

// ---------------------------------------------------------------- the recorder

/** What the recorder needs of Mantine's notifications store. */
export interface NoticeSource {
  getState: () => Pick<NotificationsState, 'notifications' | 'queue'>;
  subscribe: (listener: (state: NotificationsState) => void) => () => unknown;
}

/**
 * Watches a notifications store for `history`: a notice whose id wasn't there a moment ago is a
 * new entry (shown again after it closed — a new one too); one still there whose words or colour
 * changed updates its entry. What was there is remembered between installs, so React's
 * StrictMode remount doesn't record the same notices twice. Returns `install(source)`, which
 * records what the source holds now and listens on; it returns the way to stop.
 */
export function createNoticeRecorder(history: Pick<NoticeHistoryStore, 'getState'>) {
  /** the notices there a moment ago: the object Mantine keeps and what the list took of it */
  let present = new Map<string, { n: NotificationData; words: string }>();
  const take = (state: Pick<NotificationsState, 'notifications' | 'queue'>) => {
    const next = new Map<string, { n: NotificationData; words: string }>();
    for (const n of [...state.notifications, ...state.queue]) {
      if (n.id == null) continue;
      const id = String(n.id);
      const before = present.get(id);
      if (before?.n === n) {
        next.set(id, before);
        continue;
      }
      const input = noticeInput(n);
      if (!input) continue;
      const words = JSON.stringify([input.color, input.title, input.text]);
      next.set(id, { n, words });
      // the same words in a new object (an update of its timer or its loader): nothing new
      if (before?.words === words) continue;
      if (before) history.getState().update(input);
      else history.getState().record(input);
    }
    present = next;
  };
  return (source: NoticeSource) => {
    take(source.getState());
    const stop = source.subscribe(take);
    return () => {
      stop();
    };
  };
}

const installRecorder = createNoticeRecorder(useNoticeHistory);

/**
 * The control window records its notices (pages/Control.tsx, after its other hooks). «Показ»,
 * «Сцена», the phones and the desk don't call it: they keep no list.
 */
export function useNoticeRecorder(): void {
  useEffect(() => installRecorder(notificationsStore), []);
}
