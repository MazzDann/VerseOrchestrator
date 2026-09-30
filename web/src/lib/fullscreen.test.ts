import { describe, expect, it } from 'vitest';
import {
  FULLSCREEN_MSG,
  handleFullscreenMessage,
  isFullscreenWire,
  onFullscreenRefused,
} from './fullscreen';

describe('fullscreen requests between windows', () => {
  it('recognises only its own message shape', () => {
    expect(isFullscreenWire({ t: FULLSCREEN_MSG, on: true })).toBe(true);
    expect(isFullscreenWire({ t: FULLSCREEN_MSG, on: 'yes' })).toBe(false);
    expect(isFullscreenWire({ t: 'win', on: true })).toBe(false);
    expect(isFullscreenWire('vo-fullscreen')).toBe(false);
    expect(isFullscreenWire(null)).toBe(false);
  });

  it('carries out a request from its own origin only', async () => {
    const asked: boolean[] = [];
    const apply = async (on: boolean) => {
      asked.push(on);
    };
    const origin = 'http://localhost:4747';
    await handleFullscreenMessage({ origin, data: { t: FULLSCREEN_MSG, on: true } }, origin, apply);
    expect(
      handleFullscreenMessage(
        { origin: 'http://example.com', data: { t: FULLSCREEN_MSG, on: true } },
        origin,
        apply,
      ),
    ).toBeUndefined();
    expect(handleFullscreenMessage({ origin, data: 'hello' }, origin, apply)).toBeUndefined();
    expect(asked).toEqual([true]);
  });

  it('reports a refusal, so the control window can tell the operator (1.2.1)', async () => {
    const heard: string[] = [];
    const off = onFullscreenRefused((m) => heard.push(m));
    const origin = 'http://localhost:4747';
    const refuse = () => Promise.reject(new TypeError('Permissions check failed'));
    await handleFullscreenMessage(
      { origin, data: { t: FULLSCREEN_MSG, on: true } },
      origin,
      refuse,
    );
    off();
    await handleFullscreenMessage(
      { origin, data: { t: FULLSCREEN_MSG, on: true } },
      origin,
      refuse,
    );
    expect(heard).toEqual(['Permissions check failed']);
  });
});
