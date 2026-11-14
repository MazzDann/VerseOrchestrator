import { describe, expect, it } from 'vitest';
import { presenterRatio } from './aspect';
import { type OutputInfo } from './outputs';

const out = (kind: OutputInfo['kind'], w: number, h: number, view?: { w: number; h: number }) =>
  ({
    id: kind + w,
    name: 'vo-' + kind,
    kind,
    bounds: { x: 0, y: 0, w, h },
    ...(view ? { view } : {}),
    fullscreen: false,
    visible: true,
    openedAt: 0,
  }) as OutputInfo;

describe('the monitors take the presentation window’s shape (F1107-12)', () => {
  it('reads the first presentation window — its page size, else its outer size', () => {
    expect(presenterRatio([])).toBeNull();
    expect(presenterRatio([out('stage', 1920, 1080)])).toBeNull();
    expect(presenterRatio([out('presenter', 1920, 1200)])).toBe(1.6);
    // a window not on the whole screen: the page, not the frame with its title bar
    expect(presenterRatio([out('presenter', 1280, 760, { w: 1264, h: 685 })])).toBe(1.845);
    expect(presenterRatio([out('stage', 800, 600), out('presenter', 1024, 768)])).toBe(1.333);
    expect(presenterRatio([out('presenter', 0, 0)])).toBeNull();
  });
});
