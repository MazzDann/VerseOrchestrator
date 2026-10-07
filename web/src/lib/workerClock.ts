/**
 * A tick every `ms` from a worker (1.10.0-beta.4, the Mac's round: a covered or hidden control window
 * gets its own timers 1/s, then 1/min after five minutes — a slideshow stalled; a worker's timer is
 * not held back so). Falls back to the page's own interval where a worker can't start.
 */
export function everyMs(ms: number, tick: () => void): () => void {
  try {
    const src =
      'let t; onmessage = (e) => { clearInterval(t); if (e.data > 0) t = setInterval(() => postMessage(0), e.data); };';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = () => tick();
    w.postMessage(ms);
    return () => w.terminate();
  } catch {
    const t = window.setInterval(tick, ms);
    return () => window.clearInterval(t);
  }
}
