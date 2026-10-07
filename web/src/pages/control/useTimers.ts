import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { notifications } from '@mantine/notifications';
import { type Appearance } from '../../settingsStore';
import {
  STAGE_MESSAGE_MAX,
  type Slide,
  type SlideCountdown,
  type SlideStyle,
  type StageMessage,
} from '../../presenterBus';
import { warmAudio } from '../../lib/countdownSound';
import {
  afterZeroOf,
  hasLook,
  isPaused,
  savedLength,
  shiftCountdown,
  showsTime,
  stageTimerLook,
  timerLook,
  togglePause,
  untilFor,
  type AfterZero,
  type CountdownPlace,
  type StageTimer,
} from '../../lib/countdown';
import { countdownOver } from '../../lib/slide';
import { type Outcome, type RemoteCountdown } from '../../lib/commands';
import { tr } from '../../i18n';
import { standbyNotice } from './standby';

/**
 * The viewers' «Відлік» (on «Заставка» or in a corner) and «Таймер доповідача» (vo-timer): their
 * switches, the pushes that carry them, and E19 — a new look from the settings taken at once.
 */
export function useTimers({
  leaderRef,
  isLeader,
  appearance,
  cornerRef,
  stageTimerRef,
  stageMessageRef,
  liveSlideRef,
  lastPushed,
  slideStyle,
  pushLive,
  setPreviewOverride,
  setLive,
  takeCoverOff,
}: {
  leaderRef: MutableRefObject<boolean>;
  isLeader: boolean;
  appearance: Appearance;
  cornerRef: MutableRefObject<SlideCountdown | null>;
  stageTimerRef: MutableRefObject<StageTimer | null>;
  stageMessageRef: MutableRefObject<StageMessage | null>;
  liveSlideRef: MutableRefObject<Slide>;
  lastPushed: MutableRefObject<Slide | null>;
  slideStyle: SlideStyle;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
  setLive: (live: boolean) => void;
  /** «Заставка» off (useScreenSwitches): a cover countdown goes with it */
  takeCoverOff: () => void;
}) {
  // «Відлік» (1.5.0, components/CountdownTool): «Заставка» with the time left under it, over
  // whatever is on screen; L or «Прибрати відлік» gives that back, as from «Заставка».
  const countdownStart = (
    countdown: SlideCountdown,
    place: CountdownPlace = appearance.countdownPlace,
  ) => {
    if (!leaderRef.current) return standbyNotice();
    // a click or a key starts it: the moment a browser lets the page sound later (1.8.5)
    if (appearance.countdownBeeps) warmAudio();
    const cover = { text: appearance.coverText, image: appearance.coverImage };
    // the time's look from the settings (1.8.2 colours, 1.8.3 the rest)
    const timed = { ...countdown, ...timerLook(appearance) };
    // in a corner (1.8.7): over what is on screen, which stays as it is
    if (place === 'corner') {
      cornerRef.current = timed;
      pushCorner();
      return;
    }
    // one countdown for the viewers at a time
    cornerRef.current = null;
    const slide = countdownOver(liveSlideRef.current, cover, timed, slideStyle, tr('Відлік'));
    pushLive(slide);
    setPreviewOverride(slide);
    setLive(true);
  };
  /** The viewers' countdown now (1.8.7): in a corner, or on «Заставка». */
  const viewersCountdown = (): { corner: boolean; c: SlideCountdown } | null => {
    if (cornerRef.current) return { corner: true, c: cornerRef.current };
    const s = liveSlideRef.current;
    return s.cover && s.countdown ? { corner: false, c: s.countdown } : null;
  };
  /**
   * The same countdown with a new end: what it covers and the cover stay. In a corner (1.8.7)
   * it goes out with the slide on screen now — the one pushed last.
   */
  const countdownChange = (countdown: SlideCountdown | null, corner = !!cornerRef.current) => {
    if (!leaderRef.current) return standbyNotice();
    if (corner) {
      cornerRef.current = countdown;
      pushCorner();
      return;
    }
    const now = liveSlideRef.current;
    if (!now.cover || !now.countdown) return;
    const slide: Slide = countdown
      ? { ...now, countdown }
      : { ...now, countdown: null, reference: tr('Заставка') };
    pushLive(slide);
    // the preview follows only while it shows the cover: a passage the operator got ready
    // meanwhile stays there for «На екран» and the stage display (review of #45)
    setPreviewOverride((p) => (p?.cover ? slide : p));
  };
  /** A new countdown of what «Відлік» last chose: the palette's line and the key (1.8.1). */
  const countdownStartSaved = () =>
    countdownStart({
      until: untilFor(savedLength(appearance.countdownMinutes), Date.now()),
      caption: appearance.countdownCaption.trim() || tr('Починаємо за'),
      afterZero: appearance.countdownAfterZero,
    });
  const countdownShift = (minutes: number) => {
    const v = viewersCountdown();
    if (v) countdownChange(shiftCountdown(v.c, minutes, Date.now()), v.corner);
  };
  // going on from zero or past it (1.8.1): that zero was said already — the end notice keeps quiet
  const quietEnd = useRef<number | null>(null);
  /** «Пауза» / «Продовжити» (1.8.1): the time on screen stands still, then goes on from there. */
  const countdownPause = () => {
    const v = viewersCountdown();
    if (!v) return;
    if (appearance.countdownBeeps) warmAudio();
    const now = Date.now();
    const next = togglePause(v.c, now);
    if (!isPaused(next) && next.until <= now) quietEnd.current = next.until;
    countdownChange(next, v.corner);
    return next;
  };
  /**
   * The key «Відлік: пауза / далі» (1.8.1, T): the countdown on screen stops or goes on; with
   * none showing its time, a new one starts. Under «Чорний екран» it pauses the countdown there
   * and the screen stays black — never a new one over it (review of 1.8.1).
   */
  const countdownKey = () => {
    if (!leaderRef.current) return standbyNotice();
    const v = viewersCountdown();
    if (v && showsTime(v.c, Date.now())) {
      const next = countdownPause();
      notifications.show({
        message: next && isPaused(next) ? tr('Відлік: пауза') : tr('Відлік іде далі'),
        color: 'gray',
        autoClose: 1500,
      });
      return;
    }
    countdownStartSaved();
  };
  /**
   * «Відлік» from a remote (1.9.0-beta.10: a control window on another computer): a new one — of
   * its length or the saved one, in the operator's look and place —, pause / go on, or off, as
   * «Прибрати відлік» does. What happened goes back to it.
   */
  const countdownRemote = (c: RemoteCountdown): Outcome => {
    if (!leaderRef.current) return { ok: false, reason: tr('Показом керує інше вікно керування') };
    if (c.op === 'start') {
      countdownStart({
        until: untilFor(
          c.seconds ? c.seconds * 1000 : savedLength(appearance.countdownMinutes),
          Date.now(),
        ),
        caption: appearance.countdownCaption.trim() || tr('Починаємо за'),
        afterZero: appearance.countdownAfterZero,
      });
      return { ok: true };
    }
    const v = viewersCountdown();
    if (!v) return { ok: false, reason: tr('Відліку на екрані немає') };
    if (c.op === 'pause') countdownPause();
    else if (v.corner) countdownChange(null, true);
    else takeCoverOff();
    return { ok: true };
  };
  // The time's look changed (1.8.2 colours, 1.8.3 size, font, format, words; Налаштування
  // вигляду → Відлік, maybe from the settings window): the countdown on screen takes it at once —
  // its time and its end stay
  const look = timerLook(appearance);
  // the speaker's timer has its own (1.8.6, Налаштування вигляду → Таймер доповідача)
  const stageLook = stageTimerLook(appearance);
  const lookKey = JSON.stringify([look, stageLook]);
  useEffect(() => {
    if (!leaderRef.current) return;
    const t = stageTimerRef.current;
    const timerChanged = !!t && !hasLook(t, stageLook);
    if (t && timerChanged) stageTimerRef.current = { ...t, ...stageLook };
    const k = cornerRef.current;
    const cornerChanged = !!k && !hasLook(k, look);
    if (k && cornerChanged) cornerRef.current = { ...k, ...look };
    const s = liveSlideRef.current;
    const c = s.countdown;
    // one push carries them all: the countdown's change takes the timers along
    if (s.cover && c && !hasLook(c, look)) countdownChange({ ...c, ...look }, false);
    else if (cornerChanged) pushCorner();
    else if (timerChanged) pushTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey, isLeader]);
  /**
   * «Таймер доповідача» (1.8.4): a new state of the speaker's timer goes out with the slide on
   * screen now — the one pushed last (the render's copy may be a push behind; review of 1.8.4) —
   * and never to the phones: they have nothing new, and over the QR slide they would go blank.
   */
  const pushTimer = () =>
    pushLive({ ...(lastPushed.current ?? liveSlideRef.current) }, { audience: false });
  /**
   * The corner countdown's new state (1.8.7) goes out with the slide on screen now — to the phones
   * too, but not over the QR slide: they would go blank (the 1.8.4 lesson; review of 1.8.7). They
   * get it with the next slide.
   */
  const pushCorner = () => {
    const s = lastPushed.current ?? liveSlideRef.current;
    pushLive({ ...s }, { audience: !s.qr });
  };
  const stageTimerSet = (timer: StageTimer | null) => {
    if (!leaderRef.current) return standbyNotice();
    stageTimerRef.current = timer;
    pushTimer();
  };
  /**
   * «Повідомлення на сцену» (1.9.0-beta.11): a line for the speaker, or none — it goes out with
   * the slide on screen now, never to the phones (as the speaker's timer).
   */
  const stageMessageSet = (text: string | null) => {
    if (!leaderRef.current) return standbyNotice();
    const words = text?.trim().slice(0, STAGE_MESSAGE_MAX) ?? '';
    stageMessageRef.current = words ? { text: words, at: Date.now() } : null;
    pushTimer();
  };
  const stageTimerStart = (ms: number, afterZero: AfterZero) =>
    stageTimerSet({ until: untilFor(ms, Date.now()), afterZero, ...stageTimerLook(appearance) });
  const stageTimerPause = () => {
    const t = stageTimerRef.current;
    if (t) stageTimerSet(togglePause(t, Date.now()));
  };
  const stageTimerShift = (minutes: number) => {
    const t = stageTimerRef.current;
    if (t) stageTimerSet(shiftCountdown(t, minutes, Date.now()));
  };
  const stageTimerAfterZero = (afterZero: AfterZero) => {
    const t = stageTimerRef.current;
    if (t && afterZeroOf(t) !== afterZero) stageTimerSet({ ...t, afterZero });
  };
  /** «Після нуля» (1.8.0) for the countdown on screen: its time, the end and the cover stay. */
  const countdownAfterZero = (afterZero: AfterZero) => {
    const v = viewersCountdown();
    if (v && afterZeroOf(v.c) !== afterZero) countdownChange({ ...v.c, afterZero }, v.corner);
  };
  return {
    countdownStart,
    countdownChange,
    countdownStartSaved,
    countdownShift,
    quietEnd,
    countdownPause,
    countdownKey,
    countdownRemote,
    stageTimerSet,
    stageMessageSet,
    stageTimerStart,
    stageTimerPause,
    stageTimerShift,
    stageTimerAfterZero,
    countdownAfterZero,
  };
}
