import { useRef, useState, type MutableRefObject } from 'react';
import { api } from '../../api';
import { useServer } from '../../serverStore';
import { publishSlide, readSlide, type Slide, type SlideCountdown } from '../../presenterBus';
import { freshTimer, type StageTimer } from '../../lib/countdown';
import { type LiveConnection } from '../../lib/liveSocket';
import { forAudience, sameSlide } from '../../lib/slide';

/**
 * The slide on screen and the one push pipeline (vo-sync): `pushLive` is the only way a slide
 * reaches the screen — the standby guard, the speaker's timer and the corner countdown riding
 * along, the dedupe against `lastPushed`, the bus, the «На екрані» monitor and the phones. The
 * standby sync of the two timer refs runs during render, right after the slide. No effects.
 */
export function useLivePipeline({
  isLeader,
  leaderRef,
  followAlong,
}: {
  isLeader: boolean;
  leaderRef: MutableRefObject<boolean>;
  followAlong: boolean;
}) {
  // The slide actually published to the output window (for the in-app live monitor).
  const [liveSlide, setLiveSlide] = useState<Slide>(() => readSlide());
  // «Таймер доповідача» (1.8.4): the leader sets it and every slide it pushes carries it
  // (`pushLive`); a window that waits follows the leader's, so taking over keeps it running
  const stageTimerRef = useRef<StageTimer | null>(freshTimer(liveSlide.stageTimer));
  if (!isLeader) stageTimerRef.current = freshTimer(liveSlide.stageTimer);
  // «Відлік» in a corner (1.8.7): the same way — over whatever is on screen, so it rides along
  const cornerRef = useRef<SlideCountdown | null>(freshTimer(liveSlide.cornerCountdown));
  if (!isLeader) cornerRef.current = freshTimer(liveSlide.cornerCountdown);
  // read by handlers and effects only, never during render (moved up beside the slide)
  const liveSlideRef = useRef(liveSlide);
  liveSlideRef.current = liveSlide;
  // Publish to the output window AND record it as the live slide (the bus doesn't
  // echo to the sender, so we track it here for the in-app "what's on screen" monitor).
  // When follow-along is on, also mirror a background-stripped copy to the server.
  // Read followAlong through a ref so handlers with frozen deps (the clear/black
  // hotkeys, whose react-hotkeys-hook dep arrays exclude followAlong) still see the
  // current value rather than the one captured when the hotkey was last memoized.
  const followAlongRef = useRef(followAlong);
  followAlongRef.current = followAlong;
  /** The hub's control socket (opened further down); preferred path for publishing. */
  const controlConn = useRef<LiveConnection | null>(null);
  // Audience follow-along goes over the control socket when it's up, HTTP otherwise.
  const publishAudience = (slide: Slide) => {
    if (!leaderRef.current) return; // standby: the leader feeds the phones
    // Only with a confirmed server: at startup (probe pending) the control socket's welcome
    // re-publishes anyway; without a server there is no audience relay at all.
    if (useServer.getState().available !== true) return;
    const s = forAudience(slide);
    if (!controlConn.current?.send({ type: 'publish', slide: s })) void api.livePost(s);
  };
  const pauseAudience = () => {
    if (!leaderRef.current) return;
    if (useServer.getState().available !== true) return; // the relay starts paused anyway
    if (!controlConn.current?.send({ type: 'publish', paused: true })) void api.livePause();
  };
  // What was pushed last. Live-follow re-sends whenever slideLines gets a new identity —
  // every render (useQueries) — which re-published the SAME slide 7–10× per step (0.4.1,
  // measured): each copy re-rendered this window, went to every output window, the
  // remotes' «screen» frame and the phones. An identical slide is now a no-op.
  const lastPushed = useRef<Slide | null>(null);
  /** The slide «Очистити» removed, until something else is shown (0.13.2). */
  const clearedRef = useRef<Slide | null>(null);
  const pushLive = (pushed: Slide, opts?: { audience?: boolean }) => {
    if (!leaderRef.current) return; // standby: never overrides the leader's screen
    // the speaker's timer rides on every slide (1.8.4) — the one now, not one a slide kept
    // from before (a cleared or covered slide coming back)
    const slide: Slide = {
      ...pushed,
      // one countdown for the viewers (1.8.7): a corner one takes the time off «Заставка» —
      // whatever brings a cover countdown back (review of 1.8.7)
      countdown: cornerRef.current && pushed.countdown ? null : pushed.countdown,
      stageTimer: stageTimerRef.current ?? undefined,
      cornerCountdown: cornerRef.current ?? undefined,
    };
    if (lastPushed.current && sameSlide(slide, lastPushed.current)) return;
    lastPushed.current = slide;
    if (slide.visible) clearedRef.current = null; // something else is on screen: nothing to take back
    publishSlide(slide);
    setLiveSlide(slide);
    // the QR slide stays off the phones: they are already reading (0.6.16)
    if (followAlongRef.current && opts?.audience !== false) publishAudience(slide);
  };
  return {
    liveSlide,
    setLiveSlide,
    stageTimerRef,
    cornerRef,
    liveSlideRef,
    followAlongRef,
    controlConn,
    publishAudience,
    pauseAudience,
    lastPushed,
    clearedRef,
    pushLive,
  };
}
