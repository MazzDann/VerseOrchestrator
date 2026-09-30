import { tr } from '../i18n';

/**
 * Read an image File and return a downscaled data URL — JPEG, or PNG where transparency
 * matters (a logo, 1.4.0). Keeps localStorage (where appearance is persisted) from blowing
 * past its ~5MB quota.
 */
export async function fileToDownscaledDataUrl(
  file: File,
  maxDim = 1920,
  type: 'image/jpeg' | 'image/png' = 'image/jpeg',
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(tr('Не вдалося прочитати зображення')));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale === 1 && dataUrl.length < 1_500_000) return dataUrl;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL(type, 0.85);
}
