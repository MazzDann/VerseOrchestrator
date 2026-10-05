import { useRef } from 'react';
import { DEFAULT_LAYOUT, LAYOUT_LIMITS, type PanelLayout } from '../../settingsStore';
import { setAppShellWidth } from '../../lib/appShell';
import { bottomHeightAfter } from '../../lib/panelBox';

export function usePanelResize({
  layout,
  setLayout,
}: {
  layout: PanelLayout;
  setLayout: (patch: Partial<PanelLayout>) => void;
}) {
  const recentBoxRef = useRef<HTMLDivElement>(null);
  const clampTo = (k: keyof PanelLayout, v: number) =>
    Math.min(LAYOUT_LIMITS[k][1], Math.max(LAYOUT_LIMITS[k][0], v));
  // Panel resize: drags write CSS directly (no re-render of this big page per move);
  // the final size is committed to the persisted store once, on release.
  const panelResize = (panel: 'navbar' | 'aside') => {
    const key = panel === 'navbar' ? 'navWidth' : 'asideWidth';
    return {
      onDrag: (d: number) => setAppShellWidth(panel, clampTo(key, layout[key] + d)),
      onCommit: (d: number) => {
        setLayout({ [key]: layout[key] + d });
        requestAnimationFrame(() => setAppShellWidth(panel, null));
      },
      onReset: () => setLayout({ [key]: DEFAULT_LAYOUT[key] }),
    };
  };
  const recentResize = {
    onDrag: (d: number) => {
      if (recentBoxRef.current)
        recentBoxRef.current.style.height = `${clampTo('recentHeight', layout.recentHeight + d)}px`;
    },
    onCommit: (d: number) => {
      setLayout({ recentHeight: layout.recentHeight + d });
      if (recentBoxRef.current) recentBoxRef.current.style.height = '';
    },
    onReset: () => setLayout({ recentHeight: DEFAULT_LAYOUT.recentHeight }),
  };
  // The display panel below the centre (1.4.6): it had a fixed 340 px and no handle — in a
  // short window it hid the verse list and its own «На екрані» monitor. Its height is the
  // operator's (layout.bottomHeight) as far as the column has room: it gives way first, down
  // to BOTTOM_PANEL_MIN, the verse list keeps BOTTOM_VERSES_MIN. A drag starts from what is
  // shown and, once released, stores what is shown — unless that is a squeezed height the
  // operator did not ask for (bottomHeightAfter).
  const bottomBoxRef = useRef<HTMLDivElement>(null);
  const bottomFrom = useRef<number | null>(null);
  const bottomResize = {
    onDrag: (d: number) => {
      const el = bottomBoxRef.current;
      if (!el) return;
      bottomFrom.current ??= el.offsetHeight;
      el.style.flexBasis = `${clampTo('bottomHeight', bottomFrom.current + d)}px`;
    },
    onCommit: (d: number) => {
      const el = bottomBoxRef.current;
      if (!el) return;
      const from = bottomFrom.current ?? el.offsetHeight;
      bottomFrom.current = null;
      let shown = from;
      if (d !== 0) {
        el.style.flexBasis = `${clampTo('bottomHeight', from + d)}px`;
        // what the column lets it have (a drag past its room would leave a dead stretch)
        shown = clampTo('bottomHeight', el.offsetHeight);
      }
      // a squeezed height never replaces the operator's (a click, ↑ / ↓ with no room)
      const next = bottomHeightAfter(layout.bottomHeight, from, shown, d);
      // React re-renders `flex` only when the height changes: put back what it rendered
      el.style.flexBasis = `${next}px`;
      if (next !== layout.bottomHeight) setLayout({ bottomHeight: next });
    },
    onReset: () => {
      if (bottomBoxRef.current)
        bottomBoxRef.current.style.flexBasis = `${DEFAULT_LAYOUT.bottomHeight}px`;
      setLayout({ bottomHeight: DEFAULT_LAYOUT.bottomHeight });
    },
  };
  return { recentBoxRef, panelResize, recentResize, bottomBoxRef, bottomResize };
}
