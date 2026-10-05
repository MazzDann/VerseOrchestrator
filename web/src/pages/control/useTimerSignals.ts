import { useEffect, useRef, type MutableRefObject } from 'react';
import { notifications } from '@mantine/notifications';
import { type Slide } from '../../presenterBus';
import { type Appearance } from '../../settingsStore';
import { scheduleBeeps, warmAudio } from '../../lib/countdownSound';
import { afterZeroOf, isPaused } from '../../lib/countdown';
import { tr } from '../../i18n';

/**
 * The viewers' countdown on screen (on «Заставка» or in a corner) and what it signals: its last
 * 5 seconds aloud, the wake of a window that may not sound yet, the end notice (E31–E33).
 */
export function useTimerSignals({
  liveSlide,
  coverOn,
  appearance,
  isLeader,
  quietEnd,
}: {
  liveSlide: Slide;
  coverOn: boolean;
  appearance: Appearance;
  isLeader: boolean;
  quietEnd: MutableRefObject<number | null>;
}) {
  // «Відлік» (1.5.0) on screen comes to its end: said once here, as «Після нуля» has it (1.8.0)
  // (also when «−1 хв» brings it to now; not for one that ended long before this window took over)
  // (paused, 1.8.1: no end until it goes on)
  // (in a corner, 1.8.7: over any slide but «Чорний екран»)
  const cornerOn = !!liveSlide.cornerCountdown && !liveSlide.forceBlack;
  const viewersTimer = cornerOn
    ? liveSlide.cornerCountdown
    : coverOn
      ? liveSlide.countdown
      : undefined;
  const countdownEnd = viewersTimer && !isPaused(viewersTimer) ? viewersTimer.until : undefined;
  // its last 5 seconds aloud (1.8.5), when chosen: from the window that leads, and only while the
  // hall sees the time (the user: «звуки … тільки як що то на екрані таймер») — not paused, not
  // under «Чорний екран» or «Сховати текст»; the speaker's timer never sounds. «±1 хв» or going
  // on plans the count afresh
  const beepUntil =
    countdownEnd != null &&
    appearance.countdownBeeps &&
    (cornerOn || (liveSlide.visible && !liveSlide.blank))
      ? countdownEnd
      : undefined;
  useEffect(() => {
    if (beepUntil == null || !isLeader) return;
    // going on from zero or past it: that zero was heard already (review of 1.8.5)
    if (quietEnd.current === beepUntil) return;
    return scheduleBeeps(beepUntil);
    // deps as they were in Control, where the rule knew quietEnd (a ref) as stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beepUntil, isLeader]);
  // a reloaded window, or one that took over, may not sound until the operator acts there: any
  // click or key wakes it, and the tones still ahead play (review of 1.8.5)
  useEffect(() => {
    if (!appearance.countdownBeeps) return;
    const wake = () => void warmAudio();
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
    return () => {
      window.removeEventListener('pointerdown', wake, true);
      window.removeEventListener('keydown', wake, true);
    };
  }, [appearance.countdownBeeps]);
  const countdownAfter = useRef(afterZeroOf(viewersTimer));
  countdownAfter.current = afterZeroOf(viewersTimer);
  const countdownInCorner = useRef(cornerOn);
  countdownInCorner.current = cornerOn;
  useEffect(() => {
    if (countdownEnd == null || !isLeader) return;
    const t = window.setTimeout(
      () => {
        if (Date.now() - countdownEnd > 5000 || quietEnd.current === countdownEnd) return;
        notifications.show({
          message:
            countdownAfter.current === 'overtime'
              ? tr('Відлік дійшов до нуля: далі йде перевищення.')
              : countdownAfter.current === 'stop'
                ? tr('Відлік дійшов до 0:00: час лишається на екрані.')
                : countdownInCorner.current
                  ? tr('Відлік у кутку скінчився.')
                  : tr('Відлік скінчився: заставка лишається на екрані.'),
          color: 'gray',
          autoClose: 5000,
        });
      },
      Math.max(0, countdownEnd - Date.now()),
    );
    return () => window.clearTimeout(t);
    // deps as they were in Control, where the rule knew quietEnd (a ref) as stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdownEnd, isLeader]);
  return { viewersTimer, cornerOn };
}
