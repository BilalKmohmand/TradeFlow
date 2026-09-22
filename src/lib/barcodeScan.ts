/**
 * Camera barcode reading.
 *  - Browsers with the built-in BarcodeDetector (Chrome on Android) use it.
 *  - Others (iPhone Safari, Firefox) use the bundled ZXing decoder. It is a separate file that is only
 *    downloaded the first time someone taps "Use the camera", so it never slows down opening the app.
 */

/** Stops the camera and the reading loop. */
export type StopScan = () => void;

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export const hasNativeDetector = (): boolean => typeof window !== 'undefined' && 'BarcodeDetector' in window;

/** The device can open a camera at all (with either reader). */
export const cameraScanSupported = (): boolean => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

/** Which reader the camera will use (for tests and the help text). */
export const scanEngine = (): 'native' | 'zxing' | 'none' => (!cameraScanSupported() ? 'none' : hasNativeDetector() ? 'native' : 'zxing');

/** Formats printed on the goods a shop sells (EAN / UPC on packs, Code 128 / 39 on our own labels, QR). */
const loadZxing = async () => {
  const [{ BrowserMultiFormatReader }, lib] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
  const hints = new Map();
  hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [
    lib.BarcodeFormat.EAN_13,
    lib.BarcodeFormat.EAN_8,
    lib.BarcodeFormat.UPC_A,
    lib.BarcodeFormat.UPC_E,
    lib.BarcodeFormat.CODE_128,
    lib.BarcodeFormat.CODE_39,
    lib.BarcodeFormat.ITF,
    lib.BarcodeFormat.QR_CODE,
  ]);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 200 });
};

/**
 * Open the back camera into `video` and call `onCode` for every code read (the caller removes repeats).
 * Resolves with a stop function once the camera is showing; rejects when the camera can't be opened.
 */
export const startCameraScan = async (video: HTMLVideoElement, onCode: (code: string) => void): Promise<StopScan> => {
  const constraints: MediaStreamConstraints = { video: { facingMode: 'environment' }, audio: false };
  if (hasNativeDetector()) {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play().catch(() => {});
    const Ctor = (window as unknown as { BarcodeDetector: new (o?: unknown) => Detector }).BarcodeDetector;
    const detector = new Ctor();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      try {
        const found = await detector.detect(video);
        const hit = found[0]?.rawValue;
        if (hit) onCode(hit);
      } catch {
        /* frame not ready */
      }
      if (!stopped) timer = setTimeout(tick, 250);
    };
    timer = setTimeout(tick, 300);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
    };
  }
  const reader = await loadZxing();
  const controls = await reader.decodeFromConstraints(constraints, video, (result) => {
    const text = result?.getText();
    if (text) onCode(text);
  });
  return () => controls.stop();
};
