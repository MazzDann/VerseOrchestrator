/** A worker that answers each `ms` it is sent with `postMessage(0)`: every `ms`, or once after it. */
function clockWorker(repeat: boolean): Worker {
  const timer = repeat ? 'setInterval' : 'setTimeout';
  const clear = repeat ? 'clearInterval' : 'clearTimeout';
  // an interval needs a length (0 would be a busy loop); a timeout may be due now
  const arm = repeat ? 'e.data > 0' : 'e.data >= 0';
  const src = `let t; onmessage = (e) => { ${clear}(t); if (${arm}) t = ${timer}(() => postMessage(0), e.data); };`;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const w = new Worker(url);
  URL.revokeObjectURL(url);
  return w;
}

/**
 * A tick every `ms` from a worker (1.10.0-beta.4, the Mac's round: a covered or hidden control window
 * gets its own timers 1/s, then 1/min after five minutes — a slideshow stalled; a worker's timer is
 * not held back so). Falls back to the page's own interval where a worker can't start.
 */
export function everyMs(ms: number, tick: () => void): () => void {
  try {
    const w = clockWorker(true);
    w.onmessage = () => tick();
    w.postMessage(ms);
    return () => w.terminate();
  } catch {
    const t = window.setInterval(tick, ms);
    return () => window.clearInterval(t);
  }
}

/** Once after `ms`, from a worker (1.10.8: a «Відлік» item's zero in a covered window). */
export function afterMs(ms: number, fire: () => void): () => void {
  try {
    const w = clockWorker(false);
    // a message already on its way when cancelled is dropped (review: clearTimeout has no such window)
    let cancelled = false;
    w.onmessage = () => {
      w.terminate();
      if (!cancelled) fire();
    };
    w.postMessage(Math.max(0, ms));
    return () => {
      cancelled = true;
      w.terminate();
    };
  } catch {
    const t = window.setTimeout(fire, ms);
    return () => window.clearTimeout(t);
  }
}
