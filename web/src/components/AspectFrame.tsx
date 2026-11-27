import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSettings } from '../settingsStore';
import { onOutputsChange } from '../lib/outputs';
import { presenterRatio, presenterWidth, usePresenterShape } from '../lib/aspect';

const WIDE = 16 / 9;
/** with no presentation window open, a monitor draws as on a Full HD screen */
const BASE_WIDTH = 1920;

/** For the control window: keeps `usePresenterShape` in step with the open presentation window. */
export function PresenterShape() {
  useEffect(
    () =>
      onOutputsChange((list) =>
        usePresenterShape.setState({ ratio: presenterRatio(list), width: presenterWidth(list) }),
      ),
    [],
  );
  return null;
}

/**
 * A monitor's slide in the outputs' shape (1.14.0-beta.3, «Співвідношення сторін»): the monitors
 * stay 16:9 boxes, and a 4:3 output's slide stands in the middle of one, as on its screen. «Як екран»
 * takes the open presentation window's own shape (F1107-12); with none open, the whole 16:9 box.
 *
 * The slide is drawn at the presentation window's own size and scaled down (1.26.0, the author: the
 * preview broke the lines elsewhere than the screen — the text fit in whole pixels, 22 px here against
 * 74 there, so «believed in the / name» here was «believed in / the name» there): the same fit, the
 * same lines.
 */
export function AspectFrame({ children }: { children: ReactNode }) {
  const aspect = useSettings((s) => s.outputs.aspect);
  const live = usePresenterShape((s) => s.ratio);
  const liveWidth = usePresenterShape((s) => s.width);
  const ratio = (aspect === '4:3' ? 4 / 3 : aspect === '16:9' ? WIDE : live) ?? WIDE;
  // a 16:9 / 4:3 box on the window keeps the window's height when the window is wider (aspectBox)
  const width =
    aspect !== 'screen' && live && liveWidth && live > ratio
      ? (liveWidth / live) * ratio
      : (liveWidth ?? BASE_WIDTH);
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setShown(el.clientWidth));
    ro.observe(el);
    setShown(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = shown > 0 ? shown / width : 0;
  // narrower than the box: full height, in the middle; wider: full width, in the middle
  const flat = Math.abs(ratio - WIDE) < 0.02;
  const tall = ratio < WIDE;
  return (
    <div
      ref={box}
      style={{
        position: 'absolute',
        ...(flat
          ? { inset: 0 }
          : tall
            ? { top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)' }
            : { left: 0, right: 0, top: '50%', transform: 'translateY(-50%)' }),
        aspectRatio: String(ratio),
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width,
          height: width / ratio,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          visibility: scale > 0 ? undefined : 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
