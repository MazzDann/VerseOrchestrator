import { useEffect, type ReactNode } from 'react';
import { useSettings } from '../settingsStore';
import { onOutputsChange } from '../lib/outputs';
import { presenterRatio, usePresenterShape } from '../lib/aspect';

const WIDE = 16 / 9;

/** For the control window: keeps `usePresenterShape` in step with the open presentation window. */
export function PresenterShape() {
  useEffect(
    () => onOutputsChange((list) => usePresenterShape.setState({ ratio: presenterRatio(list) })),
    [],
  );
  return null;
}

/**
 * A monitor's slide in the outputs' shape (1.14.0-beta.3, «Співвідношення сторін»): the monitors
 * stay 16:9 boxes, and a 4:3 output's slide stands in the middle of one, as on its screen — the
 * text fits the same way there as here. «Як екран» takes the open presentation window's own shape
 * (F1107-12: a 16:10 projector or a window not on the whole screen broke the lines elsewhere than
 * the preview did); with none open, the whole 16:9 box.
 */
export function AspectFrame({ children }: { children: ReactNode }) {
  const aspect = useSettings((s) => s.outputs.aspect);
  const live = usePresenterShape((s) => s.ratio);
  const ratio = aspect === '4:3' ? 4 / 3 : aspect === '16:9' ? WIDE : live;
  if (!ratio || Math.abs(ratio - WIDE) < 0.02) return <>{children}</>;
  // narrower than the box: full height, in the middle; wider: full width, in the middle
  const tall = ratio < WIDE;
  return (
    <div
      style={{
        position: 'absolute',
        ...(tall
          ? { top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)' }
          : { left: 0, right: 0, top: '50%', transform: 'translateY(-50%)' }),
        aspectRatio: String(ratio),
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}
