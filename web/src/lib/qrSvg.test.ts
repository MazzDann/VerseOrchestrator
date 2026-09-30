import { describe, expect, it } from 'vitest';
import { qrSvgMarkup } from './qrSvg';

const URL = 'http://192.168.0.80:4747/follow';

describe('the QR as an image (1.0.1)', () => {
  it('carries its own white quiet zone, so a recoloured card can’t swallow it', () => {
    for (const look of ['square', 'rounded', 'dots'] as const) {
      const svg = qrSvgMarkup(URL, look);
      expect(svg).toMatch(
        /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="-2 -2 (\d+) \1"/,
      );
      expect(svg).toContain('fill="#fff"/>');
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it('square: one path of modules; rounded and dots: three eyes as a ring and a centre', () => {
    expect(qrSvgMarkup(URL, 'square').match(/<path /g)).toHaveLength(1);
    for (const look of ['rounded', 'dots'] as const) {
      const svg = qrSvgMarkup(URL, look);
      expect(svg.match(/fill="none" stroke=/g)).toHaveLength(3);
      expect(svg).toContain(look === 'dots' ? '<circle ' : 'rx="0.3"');
    }
  });
});
