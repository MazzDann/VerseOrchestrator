import { type ReactNode } from 'react';
import { useSettings } from '../settingsStore';

/**
 * A monitor's slide in the outputs' shape (1.14.0-beta.3, «Співвідношення сторін»): the monitors
 * stay 16:9 boxes, and a 4:3 output's slide stands in the middle of one, as on its screen — the
 * text fits the same way there as here.
 */
export function AspectFrame({ children }: { children: ReactNode }) {
  const aspect = useSettings((s) => s.outputs.aspect);
  if (aspect !== '4:3') return <>{children}</>;
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        aspectRatio: '4 / 3',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}
