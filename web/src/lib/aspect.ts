import { type CSSProperties } from 'react';
import { type OutputAspect } from '../settingsStore';

const RATIO: Record<Exclude<OutputAspect, 'screen'>, [number, number]> = {
  '16:9': [16, 9],
  '4:3': [4, 3],
};

/**
 * The box a slide is drawn in on an output page (1.14.0-beta.3, «Співвідношення сторін»): the
 * whole window for «Як екран», else the largest 16:9 or 4:3 box in its middle — the rest stays
 * black, as on a projector that takes that shape.
 */
export function aspectBox(aspect: OutputAspect): CSSProperties {
  if (aspect === 'screen') return { position: 'absolute', inset: 0 };
  const [w, h] = RATIO[aspect];
  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: `min(100vw, calc(100vh * ${w} / ${h}))`,
    height: `min(100vh, calc(100vw * ${h} / ${w}))`,
    overflow: 'hidden',
  };
}

/** The monitors' shape in the control window: the outputs' when it is set, else 16:9. */
export const monitorRatio = (aspect: OutputAspect) => (aspect === '4:3' ? '4 / 3' : '16 / 9');
