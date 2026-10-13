import { describe, expect, it } from 'vitest';
import { displayAt, featureRect, outputPage, placeOutput, type Display } from './displays.js';

const O = 'http://localhost:4747';
const BENQ: Display = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
const ASUS: Display = { id: 2, bounds: { x: 1920, y: 0, width: 1600, height: 900 } };

describe('the desktop shell places output windows', () => {
  it('knows the output pages of its own origin only', () => {
    expect(outputPage(`${O}/presenter`, O)).toBe('presenter');
    expect(outputPage(`${O}/stage/`, O)).toBe('stage');
    expect(outputPage(`${O}/key`, O)).toBe('key');
    expect(outputPage(`${O}/bench`, O)).toBeNull();
    expect(outputPage('https://example.com/presenter', O)).toBeNull();
    expect(outputPage('not a url', O)).toBeNull();
  });

  it('reads the place from window.open’s features', () => {
    expect(featureRect('popup,left=1920,top=0,width=1600,height=900')).toEqual({
      x: 1920,
      y: 0,
      width: 1600,
      height: 900,
    });
    expect(featureRect('popup,width=960,height=540')).toEqual({ width: 960, height: 540 });
  });

  it('a point past every edge goes to the nearest display', () => {
    expect(displayAt([BENQ, ASUS], 2000, 100)?.id).toBe(2);
    expect(displayAt([BENQ, ASUS], 5000, 100)?.id).toBe(2);
    expect(displayAt([], 0, 0)).toBeNull();
  });

  it('the projector: fullscreen at once over the whole screen', () => {
    const p = placeOutput(
      'presenter',
      'popup,left=1920,top=0,width=1600,height=900',
      [BENQ, ASUS],
      BENQ,
    );
    expect(p).toMatchObject({ fullscreen: true, bounds: ASUS.bounds, display: ASUS });
  });

  it('the control window’s own screen: a window, never over the operator', () => {
    const p = placeOutput(
      'presenter',
      'popup,left=0,top=0,width=1920,height=1080',
      [BENQ, ASUS],
      BENQ,
    );
    expect(p.fullscreen).toBe(false);
    expect(p.display?.id).toBe(1);
  });

  it('no place given: the other screen; one screen only: a window', () => {
    expect(placeOutput('stage', 'popup,width=960,height=540', [BENQ, ASUS], BENQ)).toMatchObject({
      fullscreen: true,
      display: ASUS,
    });
    expect(placeOutput('stage', 'popup,width=960,height=540', [BENQ], BENQ)).toMatchObject({
      fullscreen: false,
      display: BENQ,
    });
  });

  it('the key for OBS stays a window, even on another screen', () => {
    expect(
      placeOutput('key', 'popup,left=1920,top=0,width=960,height=540', [BENQ, ASUS], BENQ)
        .fullscreen,
    ).toBe(false);
  });
});
