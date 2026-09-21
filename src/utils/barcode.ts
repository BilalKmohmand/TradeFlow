/**
 * Code 128 barcodes drawn in the app (no external service). Code set C packs pairs of digits
 * (shorter bars for all-digit codes); code set B covers printable ASCII.
 */

// Bar/space widths of the 107 Code 128 symbols (values 0–105 and the stop pattern 106).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const START_C = 105;
const STOP = 106;

/** True when every character can be encoded (printable ASCII, space to ~). */
export const isEncodable = (text: string) => text.length > 0 && /^[\x20-\x7E]+$/.test(text);

/** Symbol values including start, check and stop. Throws for text that cannot be encoded. */
export const code128Values = (text: string): number[] => {
  if (!isEncodable(text)) throw new Error('Barcode text must be letters, digits or symbols (no Urdu or emoji).');
  const values: number[] = [];
  if (/^\d+$/.test(text) && text.length % 2 === 0 && text.length >= 2) {
    values.push(START_C);
    for (let i = 0; i < text.length; i += 2) values.push(parseInt(text.slice(i, i + 2), 10));
  } else {
    values.push(START_B);
    for (const ch of text) values.push(ch.charCodeAt(0) - 32);
  }
  const check = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
  values.push(check, STOP);
  return values;
};

/** Module widths, alternating bar/space starting with a bar. */
export const code128Widths = (text: string): number[] =>
  code128Values(text)
    .map((v) => PATTERNS[v])
    .join('')
    .split('')
    .map(Number);

/** Bars as [x, width] in modules, plus the total width (quiet zones of 10 modules each side). */
export const code128Bars = (text: string): { bars: [number, number][]; width: number } => {
  const widths = code128Widths(text);
  const bars: [number, number][] = [];
  let x = 10;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push([x, w]);
    x += w;
  });
  return { bars, width: x + 10 };
};

/** Standalone SVG markup (for tests or saving). Height in modules. */
export const code128Svg = (text: string, height = 50): string => {
  const { bars, width } = code128Bars(text);
  const rects = bars.map(([x, w]) => `<rect x="${x}" y="0" width="${w}" height="${height}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><rect width="${width}" height="${height}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
};
