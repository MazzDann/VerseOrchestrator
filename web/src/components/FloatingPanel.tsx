import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Paper, Group, Text, ActionIcon, ScrollArea } from '@mantine/core';
import { IconX, IconGripVertical } from '@tabler/icons-react';
import { notifyStack, openStack, stackListeners } from '../lib/panelStack';
import {
  PANEL_MARGIN as MARGIN,
  fitInView,
  growBox,
  placeInView,
  resizeBox,
  type PanelBox,
  type PanelEdge,
} from '../lib/panelBox';
import { resizeKeyStep } from '../lib/keyScroll';
import { tr, useLang } from '../i18n';

interface Pos {
  x: number;
  y: number;
}

/** Panel size chosen by the operator; `h` null = natural height (capped by the viewport). */
interface Size {
  w: number;
  h: number | null;
}

/** The edges and corners besides the grip ('se'), pulled by the pointer only (1.4.6). */
const EDGES: PanelEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'sw'];

interface Props {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Persisted position + size key in localStorage; omit for a non-remembered panel. */
  storageKey?: string;
  /** Default width, in px at the browser's default 16 px root font (scales with it). */
  width?: number;
  /** Optional icon shown left of the title. */
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * Floating panels sit ABOVE the AppShell (header/navbar/aside ≈ 100–110) but BELOW
 * Mantine's portalled overlays (popover/combobox/tooltip 300, notifications 400) — so a
 * Select or ColorInput dropdown opened inside a panel renders on top of it, not behind.
 */
const Z_BASE = 200;
const Z_MAX = 299;

/** Height assumed for placement before the panel has rendered. */
const EST_HEIGHT = 440;

/**
 * Mantine sizes are in rem: with a larger browser font (Chrome «Large», 20 px) every
 * button and gap grows by a quarter, so a panel fixed at 380 px overflowed (Mac test,
 * 0.5.8). Default widths scale with the root font; a size the operator dragged is kept
 * in px as dragged.
 */
function rootScale(): number {
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return px > 0 ? px / 16 : 1;
}

/**
 * Default spot for a newly opened panel. Zones stay free: the right-hand monitor column
 * (preview must stay visible) and the top of the centre column (where the inline search /
 * songs / text tools open) — so panels anchor to the BOTTOM-right of the centre column.
 * Further panels tile leftwards beside the ones already open; only when there's no room
 * do they cascade.
 */
function defaultPos(width: number, cascade: number): Pos & { top?: boolean } {
  const aside = document.querySelector('.mantine-AppShell-aside');
  const asideLeft = aside ? aside.getBoundingClientRect().left : window.innerWidth;
  const navbar = document.querySelector('.mantine-AppShell-navbar');
  const navRight = navbar ? Math.max(0, navbar.getBoundingClientRect().right) : 0;
  // Only dodge the aside when it's actually on screen and leaves room for the panel.
  const right0 =
    asideLeft > width + 2 * MARGIN && asideLeft < window.innerWidth ? asideLeft : window.innerWidth;
  let right = right0;
  const y = Math.max(72, window.innerHeight - EST_HEIGHT - 16);
  for (const el of document.querySelectorAll('[data-floating-panel]')) {
    right = Math.min(right, el.getBoundingClientRect().left);
  }
  const x = right - width - 12;
  if (x >= navRight + MARGIN) return { x, y };
  // The bottom strip is full: use the top of the centre column instead (cascading), so a
  // third panel doesn't bury the ones already open at the bottom.
  return { x: right0 - width - 16 - cascade * 28, y: 72 + cascade * 28, top: true };
}

const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

function clampToViewport(p: Pos, w: number, h: number): Pos {
  return placeInView(p, w, h, viewport());
}

/** A size that fits the viewport from position `p` (never smaller than the minimums). */
function clampSize(s: Size, p: Pos): Size {
  return fitInView(s, p, viewport());
}

function readStored(key: string | undefined): { pos: Pos | null; size: Size | null } {
  if (!key) return { pos: null, size: null };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { pos: null, size: null };
    const p = JSON.parse(raw);
    const pos = typeof p?.x === 'number' && typeof p?.y === 'number' ? { x: p.x, y: p.y } : null;
    const size =
      typeof p?.w === 'number' ? { w: p.w, h: typeof p?.h === 'number' ? p.h : null } : null;
    return { pos, size };
  } catch {
    return { pos: null, size: null };
  }
}

function writeStored(key: string | undefined, pos: Pos | null, size: Size | null): void {
  if (!key || !pos) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify(size ? { ...pos, w: size.w, ...(size.h === null ? {} : { h: size.h }) } : pos),
    );
  } catch {
    /* ignore */
  }
}

/**
 * A draggable, resizable floating panel rendered in a body portal — NOT a Mantine
 * `Modal` (overlays don't render their content reliably in this setup). Drag by the
 * header, resize by any edge or corner like a window (the bottom-right grip also by the
 * arrow keys; double-click: default size); position and size are clamped to the viewport
 * and optionally persisted. Content never scrolls sideways: it wraps or truncates to the
 * panel's width.
 */
export function FloatingPanel({
  opened,
  onClose,
  title,
  storageKey,
  width = 380,
  icon,
  children,
}: Props) {
  useLang();
  const [pos, setPos] = useState<Pos | null>(null);
  // Mirror of `pos` for event handlers, so they stay referentially stable (don't
  // close over `pos`) — otherwise their identity would churn every pointermove and
  // a deps-tracking cleanup would tear the drag listeners down mid-gesture.
  const posRef = useRef<Pos | null>(null);
  // null = the default size (width scaled to the root font, natural height)
  const [size, setSize] = useState<Size | null>(null);
  const sizeRef = useRef<Size | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Active drag: pointer-to-panel-origin offset captured on grab.
  const dragOffset = useRef<Pos | null>(null);
  // Active resize: the pulled edge, the pointer at the start and the panel's box then.
  const resizeStart = useRef<{ edge: PanelEdge; px: number; py: number; box: PanelBox } | null>(
    null,
  );
  // Stable identity for this panel instance in the Escape z-stack.
  const idRef = useRef<symbol>();
  if (!idRef.current) idRef.current = Symbol('floating-panel');
  // z-index follows this panel's place in openStack; re-render when the stack changes.
  const [, setStackTick] = useState(0);
  useEffect(() => {
    const l = () => setStackTick((t) => t + 1);
    stackListeners.add(l);
    return () => {
      stackListeners.delete(l);
    };
  }, []);
  const bringToFront = () => {
    const id = idRef.current!;
    const i = openStack.indexOf(id);
    if (i < 0 || i === openStack.length - 1) return;
    openStack.splice(i, 1);
    openStack.push(id);
    notifyStack();
  };

  const defaultSize = useCallback(
    (): Size => ({ w: Math.round(width * rootScale()), h: null }),
    [width],
  );
  const currentW = () => (sizeRef.current ?? defaultSize()).w;

  // Set on a default bottom placement; consumed by the layout effect after first paint.
  const snapToBottom = useRef(false);
  const applyPos = useCallback((p: Pos) => {
    posRef.current = p;
    setPos(p);
  }, []);
  const applySize = useCallback((s: Size | null) => {
    sizeRef.current = s;
    setSize(s);
  }, []);

  // Place the panel on open: its stored position and size, else the default spot
  // (bottom-right of the centre column, tiled beside other open panels — see defaultPos).
  useEffect(() => {
    if (!opened) return;
    const stored = readStored(storageKey);
    const s = stored.size ?? defaultSize();
    const initial = stored.pos ?? defaultPos(s.w, openStack.length);
    const p = clampToViewport(initial, s.w, s.h ?? EST_HEIGHT);
    applyPos(p);
    applySize(stored.size ? clampSize(stored.size, p) : null);
    // Default placement guessed the height; snap to the real bottom edge once rendered.
    snapToBottom.current = !stored.pos && !('top' in initial && initial.top);
  }, [opened, storageKey, defaultSize, applyPos, applySize]);

  useLayoutEffect(() => {
    if (!snapToBottom.current || !ref.current || !posRef.current) return;
    snapToBottom.current = false;
    // Measure the NATURAL height: the first spot's max-height may already be clipping a tall
    // panel (settings), and snapping by the clipped height would keep it short. Lifting the
    // cap inside a layout effect is synchronous, so nothing flashes.
    const el = ref.current;
    const cap = el.style.maxHeight;
    el.style.maxHeight = 'none';
    const h = Math.min(el.offsetHeight, window.innerHeight - 72 - 16);
    el.style.maxHeight = cap;
    applyPos(
      clampToViewport(
        { x: posRef.current.x, y: Math.max(72, window.innerHeight - h - 16) },
        currentW(),
        h,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, applyPos]);

  // Keep it on screen if the window is resized.
  useEffect(() => {
    if (!opened) return;
    const onResize = () => {
      if (!posRef.current) return;
      const h = ref.current?.offsetHeight ?? 420;
      const p = clampToViewport(posRef.current, currentW(), h);
      applyPos(p);
      if (sizeRef.current) applySize(clampSize(sizeRef.current, p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, applyPos, applySize]);

  // Callers pass inline `onClose` arrows (new identity every render). Keep it in a ref so
  // the stack effect below depends on `opened` only — otherwise every parent re-render
  // re-pushed this panel to the top of openStack, scrambling z-order and Escape.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape closes only the frontmost panel (last opened / last clicked wins).
  useEffect(() => {
    if (!opened) return;
    const id = idRef.current!;
    openStack.push(id);
    notifyStack();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openStack[openStack.length - 1] === id) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = openStack.indexOf(id);
      if (i >= 0) openStack.splice(i, 1);
      notifyStack();
    };
  }, [opened]);

  // Stable handlers (no `pos` in their closures — they read/write posRef), so the
  // unmount cleanup below never tears down an in-flight drag.
  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragOffset.current) return;
      const w = ref.current?.offsetWidth ?? currentW();
      const h = ref.current?.offsetHeight ?? 420;
      applyPos(
        clampToViewport(
          { x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y },
          w,
          h,
        ),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyPos],
  );

  const endDrag = useCallback(() => {
    dragOffset.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    writeStored(storageKey, posRef.current, sizeRef.current);
  }, [onPointerMove, storageKey]);

  const startDrag = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
  };

  // Resizing writes the DOM directly while the pointer moves (no re-render per move) and
  // commits the box once on release — the panel's own ResizeHandle convention.
  const onResizeMove = useCallback((e: PointerEvent) => {
    const st = resizeStart.current;
    const el = ref.current;
    if (!st || !el) return;
    const b = resizeBox(st.box, st.edge, e.clientX - st.px, e.clientY - st.py, viewport());
    el.style.left = `${b.x}px`;
    el.style.top = `${b.y}px`;
    el.style.width = `${b.w}px`;
    el.style.maxHeight = `calc(100vh - ${b.y + MARGIN}px)`;
    // a side edge leaves a natural height alone
    if (st.edge !== 'e' && st.edge !== 'w') el.style.height = `${b.h}px`;
  }, []);

  const endResize = useCallback(() => {
    const st = resizeStart.current;
    resizeStart.current = null;
    document.body.removeAttribute('data-resizing');
    window.removeEventListener('pointermove', onResizeMove);
    window.removeEventListener('pointerup', endResize);
    const el = ref.current;
    if (!st || !el) return;
    const r = el.getBoundingClientRect();
    const p = { x: Math.round(r.left), y: Math.round(r.top) };
    const sideOnly = st.edge === 'e' || st.edge === 'w';
    const s = clampSize(
      { w: Math.round(r.width), h: sideOnly ? (sizeRef.current?.h ?? null) : Math.round(r.height) },
      p,
    );
    applyPos(p);
    applySize(s);
    writeStored(storageKey, p, s);
  }, [onResizeMove, storageKey, applyPos, applySize]);

  const startResize = (edge: PanelEdge) => (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    resizeStart.current = {
      edge,
      px: e.clientX,
      py: e.clientY,
      box: { x: r.left, y: r.top, w: r.width, h: r.height },
    };
    document.body.setAttribute(
      'data-resizing',
      edge === 'e' || edge === 'w'
        ? 'x'
        : edge === 'n' || edge === 's'
          ? 'y'
          : edge === 'ne' || edge === 'sw'
            ? 'nesw'
            : 'xy',
    );
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', endResize);
  };

  const resetSize = () => {
    applySize(null);
    const el = ref.current;
    if (el) {
      // The re-render sets these too; doing it now avoids a flash at the natural width.
      el.style.width = `${defaultSize().w}px`;
      el.style.height = '';
    }
    // narrowed at the window's right edge, the panel would stick out at its default width
    const p =
      posRef.current &&
      clampToViewport(posRef.current, defaultSize().w, el?.offsetHeight ?? EST_HEIGHT);
    if (p) applyPos(p);
    writeStored(storageKey, p, null);
  };

  /**
   * Arrow keys on the focused grip resize by 16 px; at the window's right or bottom edge the
   * panel moves left / up to make the room (it sits there by default — 1.4.6).
   */
  const onGripKey = (e: React.KeyboardEvent) => {
    const el = ref.current;
    const step = resizeKeyStep('xy', e);
    if (!el || !posRef.current || !step) return;
    e.preventDefault();
    // the arrows are also «Далі» / «Назад» (document-level hotkeys): not while they resize
    e.stopPropagation();
    const b = growBox(
      { ...posRef.current, w: el.offsetWidth, h: el.offsetHeight },
      step.dx,
      step.dy,
      viewport(),
    );
    const p = { x: b.x, y: b.y };
    const s = { w: b.w, h: b.h };
    applyPos(p);
    applySize(s);
    writeStored(storageKey, p, s);
  };

  // Tidy up if we unmount mid-drag. Handlers are stable, so this runs only on
  // unmount (not on every pointermove).
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointermove', onResizeMove);
      window.removeEventListener('pointerup', endResize);
      document.body.removeAttribute('data-resizing');
    },
    [onPointerMove, endDrag, onResizeMove, endResize],
  );

  if (!opened || !pos) return null;
  const depth = openStack.indexOf(idRef.current!);
  const zIndex = Math.min(Z_MAX, Z_BASE + Math.max(0, depth));
  const w = size?.w ?? defaultSize().w;

  return createPortal(
    <Paper
      ref={ref}
      onPointerDownCapture={bringToFront}
      data-floating-panel
      role="dialog"
      aria-label={typeof title === 'string' ? title : undefined}
      shadow="xl"
      withBorder
      radius="md"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: w,
        height: size?.h ?? undefined,
        maxHeight: `calc(100vh - ${pos.y + MARGIN}px)`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex,
      }}
    >
      <Group
        justify="space-between"
        wrap="nowrap"
        px="sm"
        py={6}
        onPointerDown={startDrag}
        style={{
          cursor: 'grab',
          borderBottom: '1px solid var(--mantine-color-default-border)',
          userSelect: 'none',
          touchAction: 'none',
          flexShrink: 0,
        }}
      >
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <IconGripVertical size={15} opacity={0.5} style={{ flexShrink: 0 }} />
          {icon}
          <Text fw={600} size="sm" truncate>
            {title}
          </Text>
        </Group>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={onClose}
          aria-label={tr('Закрити')}
        >
          <IconX size={16} />
        </ActionIcon>
      </Group>
      {/* scrollbars="y": content is laid out at the panel's width (never a sideways scroll) */}
      <ScrollArea.Autosize
        className="vo-panel-body"
        classNames={{ scrollbar: 'vo-panel-scrollbar' }}
        mah={size?.h ? undefined : 'calc(100vh - 160px)'}
        type="hover"
        scrollbars="y"
        style={{ flex: 1, minHeight: 0 }}
      >
        {children}
      </ScrollArea.Autosize>
      {/* the edges and the other corners: pointer only — the grip is the keyboard's way */}
      {EDGES.map((edge) => (
        <div
          key={edge}
          className="vo-panel-edge"
          data-edge={edge}
          aria-hidden
          onPointerDown={startResize(edge)}
          onDoubleClick={resetSize}
        />
      ))}
      <button
        type="button"
        className="vo-panel-resize"
        aria-label={tr('Змінити розмір панелі (стрілки; подвійний клік — типовий розмір)')}
        title={tr('Змінити розмір')}
        onPointerDown={startResize('se')}
        onDoubleClick={resetSize}
        data-resize-keys="xy"
        onKeyDown={onGripKey}
      />
    </Paper>,
    document.body,
  );
}
