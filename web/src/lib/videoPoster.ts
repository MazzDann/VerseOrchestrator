/**
 * A video's poster for the phones (1.8.12-beta.3): the control window opens the file in a hidden,
 * muted <video>, takes a frame a second in (a tenth of a short one — a fade from black opens
 * many videos) and draws it at most 1280 px as a JPEG, as album photos' small copies are.
 */
export const POSTER_SIDE = 1280;
const POSTER_TIMEOUT_MS = 20_000;

function once(el: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => done(new Error('timed out')), POSTER_TIMEOUT_MS);
    const ok = () => done();
    const bad = () => done(new Error('cannot play'));
    function done(err?: Error) {
      window.clearTimeout(t);
      el.removeEventListener(event, ok);
      el.removeEventListener('error', bad);
      if (err) reject(err);
      else resolve();
    }
    el.addEventListener(event, ok);
    el.addEventListener('error', bad);
  });
}

export async function drawPoster(src: string): Promise<Blob> {
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.playsInline = true;
  try {
    const meta = once(v, 'loadedmetadata');
    v.src = src;
    await meta;
    const at = Math.min(1, (Number.isFinite(v.duration) ? v.duration : 0) * 0.1);
    const seeked = once(v, 'seeked');
    v.currentTime = at;
    await seeked;
    const k = Math.min(1, POSTER_SIDE / Math.max(v.videoWidth || 1, v.videoHeight || 1));
    const w = Math.max(1, Math.round(v.videoWidth * k));
    const h = Math.max(1, Math.round(v.videoHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('no 2d context');
    g.drawImage(v, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no poster'))), 'image/jpeg', 0.85),
    );
  } finally {
    v.removeAttribute('src');
    v.load();
  }
}
