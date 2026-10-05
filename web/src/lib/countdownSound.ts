/**
 * The last seconds of «Відлік» counted aloud (1.8.5; the users after real use: «в останні 5 с
 * щоб був 5. 4. 3. 2. 1. 0. а не сигнал»): a short tone at 5, 4, 3, 2 and 1 seconds left and a
 * longer, higher one at zero, as sports and kitchen timers do. Made with Web Audio, no files.
 * The control window that leads plays them — the hall's speakers hang on that computer, and one
 * window means never twice.
 */

/** How many seconds before zero the count starts. */
export const LAST_SECONDS = 5;

/** A tone that sounds `at` ms from now; `zero` — the last, longer one. */
export interface Beep {
  at: number;
  zero: boolean;
}

/**
 * The tones still ahead of a countdown `left` ms from its end. One a moment late (the timer
 * fired a little after the second, or the count started inside it) still sounds; one long gone
 * doesn't — «+1 хв» in the last seconds starts the count afresh.
 */
export function beepPlan(left: number, lateMs = 150): Beep[] {
  const plan: Beep[] = [];
  for (let k = LAST_SECONDS; k >= 0; k--) {
    const at = left - k * 1000;
    if (at >= -lateMs) plan.push({ at: Math.max(0, at), zero: k === 0 });
  }
  return plan;
}

let ctx: AudioContext | null = null;

/**
 * The page's audio, made or woken while the operator acts (a click or a key): a browser lets a
 * page sound only after that, so the count, which comes minutes later, is allowed to play.
 */
export function warmAudio(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One tone: 784 Hz for 0.15 s, or at zero 1047 Hz for 0.7 s, with soft edges (no click). */
export function playBeep(zero: boolean): void {
  const audio = warmAudio();
  if (!audio) return;
  const t = audio.currentTime;
  const length = zero ? 0.7 : 0.15;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.value = zero ? 1047 : 784;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}
