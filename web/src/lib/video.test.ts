import { describe, expect, it } from 'vitest';
import type { SlideVideo } from '../presenterBus';
import {
  clockOf,
  pauseVideo,
  positionIn,
  resumeVideo,
  seekVideo,
  syncStep,
  videoEnded,
  videoPosition,
  videoSlide,
} from './video';
import { forAudience, showsSomething, summarize } from './slide';
import { isSlide } from './bus';

const T0 = 1_800_000_000_000;
const v: SlideVideo = {
  src: '/api/videos/x/file',
  poster: '/api/videos/x/poster',
  name: 'Різдво',
  fit: 'contain',
  at: T0,
  from: 0,
  paused: null,
  loop: false,
  phones: 'poster',
};
const style = { font: 'Inter', color: '#fff', background: '#000' } as never;

describe('video on screen: the clock on the slide (1.8.12-beta.3)', () => {
  it('a playing video is where its clock says; paused it stays', () => {
    expect(videoPosition(v, T0 + 2500)).toBe(2.5);
    expect(videoPosition({ ...v, from: 10 }, T0 + 1000)).toBe(11);
    expect(videoPosition(v, T0 - 500)).toBe(0); // a clock a little behind: not before the start
    const p = pauseVideo(v, T0 + 4000);
    expect(p.paused).toBe(4);
    expect(videoPosition(p, T0 + 99_000)).toBe(4);
    expect(pauseVideo(p, T0 + 9000)).toBe(p);
    const r = resumeVideo(p, T0 + 60_000);
    expect(r).toMatchObject({ at: T0 + 60_000, from: 4, paused: null });
    expect(videoPosition(r, T0 + 61_000)).toBe(5);
  });

  it('seeks, playing or paused; a loop starts over; the end is the end', () => {
    expect(videoPosition(seekVideo(v, 30, T0 + 5000), T0 + 6000)).toBe(31);
    expect(seekVideo(pauseVideo(v, T0), 12, T0 + 1).paused).toBe(12);
    expect(seekVideo(v, -3, T0).from).toBe(0);
    expect(positionIn(v, 10, T0 + 25_000)).toBe(10);
    expect(positionIn({ ...v, loop: true }, 10, T0 + 25_000)).toBe(5);
    expect(videoEnded(v, 10, T0 + 9_999)).toBe(false);
    expect(videoEnded(v, 10, T0 + 10_000)).toBe(true);
    expect(videoEnded({ ...v, loop: true }, 10, T0 + 99_000)).toBe(false);
    expect(videoEnded(pauseVideo(v, T0 + 11_000), 10, T0 + 99_000)).toBe(false);
    expect(videoEnded(v, 0, T0 + 99_000)).toBe(false); // the length not known yet
  });

  it('keeps an element to the clock: a jump when far off, a nudge when near, nothing when on time', () => {
    expect(syncStep(10, 10.01)).toEqual({ seek: null, rate: 1 });
    expect(syncStep(10, 10.2).rate).toBeCloseTo(1.1);
    expect(syncStep(10.2, 10).rate).toBeCloseTo(0.9);
    expect(syncStep(10, 12)).toEqual({ seek: 12, rate: 1 });
    // a loop of 10 s: 9.95 against 0.05 is 0.1 s off, not 9.9
    expect(syncStep(0.05, 9.95, 10).seek).toBeNull();
    expect(syncStep(9.95, 0.05, 10).seek).toBeNull();
  });

  it('a video slide: shown, named, checked by the bus; the phones never get the file', () => {
    const s = videoSlide(
      { src: v.src, poster: v.poster, name: v.name, fit: 'cover', loop: false, phones: 'text' },
      'x',
      style,
      T0,
    );
    expect(s.video).toMatchObject({ at: T0, from: 0, paused: null, fit: 'cover', phones: 'text' });
    expect(s.source).toEqual({ kind: 'video', videoId: 'x' });
    expect(showsSomething(s)).toBe(true);
    expect(summarize(s)).toMatchObject({ status: 'live', text: 'Різдво', kind: 'video' });
    expect(isSlide(s)).toBe(true);
    expect(isSlide({ ...s, video: { ...s.video, at: 'x' } })).toBe(false);
    expect(isSlide({ ...s, video: { ...s.video, src: 3 } })).toBe(false);
    expect(isSlide({ ...s, video: { ...s.video!, paused: NaN } })).toBe(false);
    const phone = forAudience(s);
    expect(phone.video?.src).toBe('');
    expect(phone.video?.poster).toBe(v.poster);
    expect(s.video?.src).toBe(v.src);
  });

  it('writes the time as the controls show it', () => {
    expect(clockOf(0)).toBe('0:00');
    expect(clockOf(65.9)).toBe('1:05');
    expect(clockOf(3725)).toBe('1:02:05');
  });
});
