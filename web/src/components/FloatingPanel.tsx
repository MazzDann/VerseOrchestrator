import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Paper, Group, Text, ActionIcon, ScrollArea } from '@mantine/core';
import { IconX, IconGripVertical } from '@tabler/icons-react';

interface Pos {
  x: number;
  y: number;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Persisted-position key in localStorage; omit for a non-remembered panel. */
  storageKey?: string;
  width?: number;
  /** Optional icon shown left of the title. */
  icon?: ReactNode;
  children: ReactNode;
}

const MARGIN = 8;

/**
 * Open panels in z-order (last = frontmost). Clicking a panel moves it to the end, so
 * Escape dismisses the one the operator is actually working in.
 */
const openStack: symbol[] = [];
const stackListeners = new Set<() => void>();
const notifyStack = () => stackListeners.forEach((l) => l());

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

function clampToViewport(p: Pos, w: number, h: number): Pos {
  const maxX = Math.max(MARGIN, window.innerWidth - w - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - h - MARGIN);
  return {
    x: Math.min(Math.max(MARGIN, p.x), maxX),
    y: Math.min(Math.max(MARGIN, p.y), maxY),
  };
}

function readStoredPos(key: string | undefined): Pos | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * A draggable, floating panel rendered in a body portal — NOT a Mantine `Modal`
 * (overlays don't render their content reliably in this setup). Drag by the
 * header; position is clamped to the viewport and optionally persisted.
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
  const [pos, setPos] = useState<Pos | null>(null);
  // Mirror of `pos` for event handlers, so they stay referentially stable (don't
  // close over `pos`) — otherwise their identity would churn every pointermove and
  // a deps-tracking cleanup would tear the drag listeners down mid-gesture.
  const posRef = useRef<Pos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Active drag: pointer-to-panel-origin offset captured on grab.
  const dragOffset = useRef<Pos | null>(null);
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

  // Set on a default bottom placement; consumed by the layout effect after first paint.
  const snapToBottom = useRef(false);
  const applyPos = useCallback((p: Pos) => {
    posRef.current = p;
    setPos(p);
  }, []);

  // Place the panel on open: its stored position, else the default spot (bottom-right of
  // the centre column, tiled beside other open panels — see defaultPos).
  useEffect(() => {
    if (!opened) return;
    const stored = readStoredPos(storageKey);
    const initial = stored ?? defaultPos(width, openStack.length);
    applyPos(clampToViewport(initial, width, EST_HEIGHT));
    // Default placement guessed the height; snap to the real bottom edge once rendered.
    snapToBottom.current = !stored && !('top' in initial && initial.top);
  }, [opened, storageKey, width, applyPos]);

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
        width,
        h,
      ),
    );
  }, [pos, width, applyPos]);

  // Keep it on screen if the window is resized.
  useEffect(() => {
    if (!opened) return;
    const onResize = () => {
      if (!posRef.current) return;
      const h = ref.current?.offsetHeight ?? 420;
      applyPos(clampToViewport(posRef.current, width, h));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [opened, width, applyPos]);

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
      const w = ref.current?.offsetWidth ?? width;
      const h = ref.current?.offsetHeight ?? 420;
      applyPos(
        clampToViewport(
          { x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y },
          w,
          h,
        ),
      );
    },
    [width, applyPos],
  );

  const endDrag = useCallback(() => {
    dragOffset.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    if (storageKey && posRef.current) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(posRef.current));
      } catch {
        /* ignore */
      }
    }
  }, [onPointerMove, storageKey]);

  const startDrag = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
  };

  // Tidy up if we unmount mid-drag. Handlers are stable, so this runs only on
  // unmount (not on every pointermove).
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
    },
    [onPointerMove, endDrag],
  );

  if (!opened || !pos) return null;
  const depth = openStack.indexOf(idRef.current!);
  const zIndex = Math.min(Z_MAX, Z_BASE + Math.max(0, depth));

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
        width,
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
        }}
      >
        <Group gap={6} wrap="nowrap">
          <IconGripVertical size={15} opacity={0.5} />
          {icon}
          <Text fw={600} size="sm">
            {title}
          </Text>
        </Group>
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose} aria-label="Закрити">
          <IconX size={16} />
        </ActionIcon>
      </Group>
      <ScrollArea.Autosize mah="calc(100vh - 160px)" type="hover">
        {children}
      </ScrollArea.Autosize>
    </Paper>,
    document.body,
  );
}
