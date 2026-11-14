import { type CSSProperties } from 'react';
import { create } from 'zustand';
import { type OutputAspect } from '../settingsStore';
import { type OutputInfo } from './outputs';

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

/** The first presentation window's page shape, width / height (rounded) — null: none open (F1107-12). */
export function presenterRatio(list: readonly OutputInfo[]): number | null {
  const o = list.find((x) => x.kind === 'presenter');
  const v = o ? (o.view ?? { w: o.bounds.w, h: o.bounds.h }) : null;
  return v && v.w > 0 && v.h > 0 ? Math.round((v.w / v.h) * 1000) / 1000 : null;
}

/**
 * The open presentation window's shape, width / height, as the control window sees it (F1107-12):
 * null — none open. Only the control window fills it (AspectFrame's `PresenterShape`); elsewhere null.
 */
export const usePresenterShape = create<{ ratio: number | null }>(() => ({ ratio: null }));
