import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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

/** Open panels in z-order, so Escape only dismisses the frontmost one. */
const openStack: symbol[] = [];

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

  const applyPos = useCallback((p: Pos) => {
    posRef.current = p;
    setPos(p);
  }, []);

  // Place the panel on open: stored position, else top-right of the viewport.
  useEffect(() => {
    if (!opened) return;
    const stored = readStoredPos(storageKey);
    const initial = stored ?? { x: window.innerWidth - width - 24, y: 72 };
    applyPos(clampToViewport(initial, width, 420));
  }, [opened, storageKey, width, applyPos]);

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

  // Escape closes only the frontmost panel (last opened wins).
  useEffect(() => {
    if (!opened) return;
    const id = idRef.current!;
    openStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openStack[openStack.length - 1] === id) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = openStack.indexOf(id);
      if (i >= 0) openStack.splice(i, 1);
    };
  }, [opened, onClose]);

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

  return createPortal(
    <Paper
      ref={ref}
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
        zIndex: 1000,
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
