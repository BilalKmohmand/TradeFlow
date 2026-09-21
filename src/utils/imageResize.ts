/**
 * Shrink a photo on the device before it is saved with an item: longest side at most `maxSide`
 * pixels, JPEG, quality lowered step by step until the data URL is under `maxBytes` (about 60 KB).
 * Nothing is uploaded anywhere; the result is stored on the item like the shop logo.
 */
export const MAX_PHOTO_BYTES = 60 * 1024;

/** Approximate decoded size of a base64 data URL in bytes. */
export const dataUrlBytes = (dataUrl: string): number => {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
};

/** New width/height so the longest side is at most maxSide (never enlarged). */
export const fitWithin = (w: number, h: number, maxSide: number): { width: number; height: number } => {
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
};

const loadImage = (file: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not a picture the browser can open.'));
    };
    img.src = url;
  });

export const resizePhoto = async (file: Blob, opts: { maxSide?: number; maxBytes?: number } = {}): Promise<string> => {
  const maxBytes = opts.maxBytes ?? MAX_PHOTO_BYTES;
  if (!file.type.startsWith('image/')) throw new Error('Pick a photo (JPG or PNG).');
  const img = await loadImage(file);
  let side = opts.maxSide ?? 320;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, side);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot resize photos.');
    // White behind transparent PNGs (JPEG has no transparency).
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    for (const q of [0.82, 0.7, 0.58, 0.46, 0.35]) {
      const url = canvas.toDataURL('image/jpeg', q);
      if (dataUrlBytes(url) <= maxBytes) return url;
    }
    side = Math.round(side * 0.7);
  }
  throw new Error('That photo is too detailed to store. Try a simpler picture.');
};
