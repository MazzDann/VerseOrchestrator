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
 * The tones still ahead of a countdown `left` ms from its end. One a moment late (the count
 * started inside its second) still sounds; one long gone doesn't — «+1 хв» in the last seconds
 * starts the count afresh.
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

function audio(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * The page's audio, made or woken while the operator acts (a click or a key): a browser lets a
 * page sound only after that, so the count, which comes minutes later, is allowed to play.
 */
export function warmAudio(): AudioContext | null {
  const a = audio();
  if (a?.state === 'suspended') a.resume().catch(() => {});
  return a;
}

/** One tone at audio time `t`: 784 Hz for 0.15 s, or at zero 1047 Hz for 0.7 s, soft edges. */
function tone(a: AudioContext, t: number, zero: boolean): AudioNode[] {
  const length = zero ? 0.7 : 0.15;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = 'sine';
  osc.frequency.value = zero ? 1047 : 784;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
  return [osc, gain];
}

/**
 * The tones of a countdown that ends at `until` (ms since the epoch), put on the audio clock at
 * once — not on timers, which a covered or hidden control window slows to once a second, or once
 * a minute (review of 1.8.5). If the page may not sound yet (reloaded, or it took over), they wait
 * until it may — the next click or key wakes it — and those still ahead play. Returns a cancel.
 */
export function scheduleBeeps(until: number): () => void {
  const a = audio();
  if (!a) return () => {};
  let nodes: AudioNode[] = [];
  let done = false;
  const schedule = () => {
    if (done || nodes.length || a.state !== 'running') return;
    for (const b of beepPlan(until - Date.now()))
      nodes.push(...tone(a, a.currentTime + b.at / 1000, b.zero));
  };
  a.addEventListener('statechange', schedule);
  schedule();
  return () => {
    done = true;
    a.removeEventListener('statechange', schedule);
    for (const n of nodes) {
      // a tone not yet begun never plays; one sounding stops
      if (n instanceof OscillatorNode)
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      n.disconnect();
    }
    nodes = [];
  };
}
