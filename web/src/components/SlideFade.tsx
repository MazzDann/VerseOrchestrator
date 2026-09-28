import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { SlideTransition } from '../presenterBus';
import { fadeTiming, planSlideChange } from '../lib/slideFade';

/**
 * The slide change on every output (1.5.10, Mac test): the shown slide fades out, then the
 * latest one fades in — the 1.5.7 modes (lib/slideFade.ts).
 *
 * Replaces framer-motion's AnimatePresence, which flashed at both ends of every fade: its
 * opacity runs as a Web Animation, and when that ends it cancels the animation at once but
 * writes the end value only on its next frame — for one frame the element shows its old
 * inline style. Measured in the Mac presenter while the operator clicked verses (the control
 * window shares its process): every one of 30+ changes had the faded-out slide back at full
 * brightness for a frame, then a black frame at the end of the fade-in. Here the inline
 * style is set to the END value before a Web Animation runs from the current value — when it
 * ends there is nothing to snap back to. It still runs on the compositor, so a busy control
 * window can delay the swap (a slightly longer dark gap) but not stutter or flash the fade.
 */
export function SlideFade({
  slideKey,
  mode,
  style,
  layerRef,
  children,
}: {
  /** the slide to show (null: nothing — blank or cleared) */
  slideKey: string | null;
  mode: SlideTransition | undefined;
  style: CSSProperties;
  /** also gets the layer element (useAutoFit's content ref in the centred layout) */
  layerRef?: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const [shown, setShown] = useState<string | null>(slideKey);
  const el = useRef<HTMLDivElement | null>(null);
  const fading = useRef<Animation | null>(null);
  const latest = useRef({ key: slideKey, mode });
  latest.current = { key: slideKey, mode };

  // The props already carry the next slide while the shown one fades out: keep rendering
  // what the shown layer last rendered — its content AND its style (a faithful pptx song
  // brings its own font: the leaving title switched from Arial Black to Calibri mid-fade).
  const lastNode = useRef<ReactNode>(children);
  const lastStyle = useRef<CSSProperties>(style);
  const current = shown === slideKey;
  const node = current ? children : lastNode.current;
  const layerStyle = current ? style : lastStyle.current;
  useLayoutEffect(() => {
    lastNode.current = node;
    lastStyle.current = layerStyle;
  });

  const setLayer = useCallback(
    (e: HTMLDivElement | null) => {
      el.current = e;
      layerRef?.(e);
    },
    [layerRef],
  );

  // A new layer fades in (before its first paint: layout effects run ahead of it).
  useLayoutEffect(() => {
    const e = el.current;
    const t = fadeTiming(latest.current.mode, 'in');
    if (!e || shown === null || !t) return;
    const a = e.animate([{ opacity: 0 }, { opacity: 1 }], t);
    return () => a.cancel();
  }, [shown]);

  useLayoutEffect(() => {
    const step = planSlideChange(shown, !!fading.current, slideKey, mode);
    const e = el.current;
    if (step.do === 'show') {
      fading.current?.cancel();
      fading.current = null;
      setShown(step.key);
    } else if (step.do === 'fadeBack' && e && fading.current) {
      const from = Number(getComputedStyle(e).opacity);
      fading.current.cancel();
      fading.current = null;
      e.style.opacity = '';
      delete e.dataset.leaving;
      const t = fadeTiming(mode, 'in') ?? { duration: 0, easing: 'linear' };
      e.animate([{ opacity: from }, { opacity: 1 }], { ...t, duration: t.duration * (1 - from) });
    } else if (step.do === 'fadeOut') {
      const t = fadeTiming(mode, 'out');
      if (!e || !t) {
        setShown(slideKey);
        return;
      }
      // from wherever it is (a slide still fading in leaves from part-way)
      const from = Number(getComputedStyle(e).opacity);
      for (const a of e.getAnimations()) a.cancel();
      e.style.opacity = '0';
      e.dataset.leaving = ''; // useAutoFit leaves it alone
      const a = e.animate([{ opacity: from }, { opacity: 0 }], {
        ...t,
        duration: t.duration * from,
      });
      fading.current = a;
      a.finished.then(
        () => {
          if (fading.current !== a) return;
          fading.current = null;
          setShown(latest.current.key);
        },
        () => undefined, // cancelled: someone else decided
      );
    }
  }, [slideKey, mode, shown]);

  if (shown === null) return null;
  return (
    <div key={shown} ref={setLayer} data-slide-layer style={layerStyle}>
      {node}
    </div>
  );
}
