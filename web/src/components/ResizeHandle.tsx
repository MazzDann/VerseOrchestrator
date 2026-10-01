import { useRef, type CSSProperties } from 'react';
import { tr, useLang } from '../i18n';
import { resizeKeyStep } from '../lib/keyScroll';

interface Props {
  /** 'x' = drag horizontally (panel width), 'y' = vertically (section height). */
  axis: 'x' | 'y';
  /** Where the handle sits on its (position: relative) parent. */
  edge: 'left' | 'right' | 'top';
  /**
   * Live drag feedback with the total pointer delta since pointerdown. Callers apply it
   * directly to the DOM (a CSS variable / style) so a drag doesn't re-render the page.
   */
  onDrag: (delta: number) => void;
  /** Drag finished — persist the final size (the one re-render). */
  onCommit: (delta: number) => void;
  /** Double-click restores the default size. */
  onReset: () => void;
  label: string;
}

/**
 * A thin drag strip on a panel edge: invisible until hovered, then a brand-coloured
 * rule. Pointer capture keeps the drag alive over iframes/other panels; arrow keys
 * resize by 16px for keyboard users.
 */
export function ResizeHandle({ axis, edge, onDrag, onCommit, onReset, label }: Props) {
  useLang();
  const start = useRef<number | null>(null);
  const last = useRef(0);

  const pos = (e: React.PointerEvent) => (axis === 'x' ? e.clientX : e.clientY);
  // Dragging toward the panel's inside shrinks it: a handle on the LEFT/TOP edge grows
  // the panel when moved left/up, so flip the sign for those edges.
  const sign = edge === 'right' ? 1 : -1;

  const style: CSSProperties =
    axis === 'x'
      ? { top: 0, bottom: 0, width: 7, [edge]: -4, cursor: 'col-resize' }
      : { left: 0, right: 0, height: 7, top: -4, cursor: 'row-resize' };

  return (
    // A <button> (not a div role=separator) so it's focusable and keyboard-operable
    // without fighting jsx-a11y; `data-axis` drives the CSS.
    <button
      type="button"
      className="vo-resize-handle"
      data-axis={axis}
      aria-label={label}
      title={tr('{handle}: тягніть; подвійний клік скидає', { handle: label })}
      style={style}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = pos(e);
        last.current = 0;
        document.body.dataset.resizing = axis;
      }}
      onPointerMove={(e) => {
        if (start.current == null) return;
        last.current = (pos(e) - start.current) * sign;
        onDrag(last.current);
      }}
      onPointerUp={(e) => {
        if (start.current == null) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        start.current = null;
        delete document.body.dataset.resizing;
        onCommit(last.current);
      }}
      onDoubleClick={onReset}
      data-resize-keys={axis}
      onKeyDown={(e) => {
        const step = resizeKeyStep(axis, e);
        if (!step) return;
        e.preventDefault();
        // the arrows are also «Далі» / «Назад» (document-level hotkeys): not while they resize
        e.stopPropagation();
        onCommit((axis === 'x' ? step.dx : step.dy) * sign);
      }}
    />
  );
}
