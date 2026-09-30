import { describe, expect, it } from 'vitest';
import { screenBox } from './screens';

describe('a box of the page on the screen (1.1.0)', () => {
  it('adds the window’s place and the browser’s frame', () => {
    // a window at (100, 50): 8 px borders, 92 px of tabs and toolbar above the page
    const w = {
      screenX: 100,
      screenY: 50,
      outerWidth: 1296,
      innerWidth: 1280,
      outerHeight: 800,
      innerHeight: 700,
    };
    expect(screenBox({ left: 20, top: 30, width: 400.4, height: 500.6 }, w)).toEqual({
      left: 128,
      top: 172,
      width: 400,
      height: 501,
    });
    // an app window without a frame, on a second screen to the left
    const bare = { ...w, screenX: -1920, outerWidth: 1280, outerHeight: 700 };
    expect(screenBox({ left: 0, top: 0, width: 10, height: 10 }, bare)).toMatchObject({
      left: -1920,
      top: 50,
    });
  });
});
