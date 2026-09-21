/**
 * Cheque printing: amount in words (Pakistani style, lakh / crore) and the default cheque-leaf layout.
 * Every position is in mm from the top-left corner of the cheque leaf, adjustable in Money → Cheques →
 * Cheque layout and saved in settings.chequeLayout.
 */
import { AppSettings, ChequeLayout } from '../types';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0–99 in words. */
const twoDigits = (n: number): string => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`);
/** 0–999 in words. */
const threeDigits = (n: number): string => {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
};

/**
 * Whole number in words with the Pakistani / Indian grouping: 1,25,50,000 → "One Crore Twenty-Five Lakh
 * Fifty Thousand". Arab (100 crore) and Kharab are used for the rare very large amounts.
 */
export const numberToWordsPK = (value: number): string => {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const units: [number, string][] = [
    [1e11, 'Kharab'],
    [1e9, 'Arab'],
    [1e7, 'Crore'],
    [1e5, 'Lakh'],
    [1e3, 'Thousand'],
  ];
  units.forEach(([size, name]) => {
    const q = Math.floor(n / size);
    if (q > 0) {
      parts.push(`${q >= 100 ? threeDigits(q) : twoDigits(q)} ${name}`);
      n -= q * size;
    }
  });
  if (n > 0) parts.push(threeDigits(n));
  return parts.join(' ');
};

/** "Rupees One Lakh Twenty-Five Thousand Only" / "Rupees Five Hundred and Fifty Paisa Only". */
export const amountInWordsPK = (amount: number): string => {
  const rounded = Math.round((Math.abs(Number(amount) || 0) + Number.EPSILON) * 100) / 100;
  const rupees = Math.floor(rounded);
  const paisa = Math.round((rounded - rupees) * 100);
  return `Rupees ${numberToWordsPK(rupees)}${paisa ? ` and ${numberToWordsPK(paisa)} Paisa` : ''} Only`;
};

/** Figures as printed in the amount box: "1,25,000/-" (lakh grouping), paisa when there are any. */
export const amountFiguresPK = (amount: number): string => {
  const v = Math.round((Math.abs(Number(amount) || 0) + Number.EPSILON) * 100) / 100;
  const whole = Math.floor(v);
  const paisa = Math.round((v - whole) * 100);
  const s = String(whole);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest ? `${rest},` : ''}${last3}${paisa ? `.${String(paisa).padStart(2, '0')}` : '/-'}`;
};

/** A typical Pakistani bank cheque leaf (about 203 × 89 mm). */
export const DEFAULT_CHEQUE_LAYOUT: ChequeLayout = {
  widthMm: 203,
  heightMm: 89,
  fontSizePt: 11,
  date: { x: 152, y: 10 },
  dateDigitGapMm: 0,
  payee: { x: 22, y: 25 },
  words: { x: 30, y: 34 },
  wordsWidthMm: 120,
  figures: { x: 158, y: 40 },
  acPayee: true,
};

export const chequeLayoutOf = (settings: Pick<AppSettings, 'chequeLayout'>): ChequeLayout => {
  const saved = settings.chequeLayout || ({} as Partial<ChequeLayout>);
  return {
    ...DEFAULT_CHEQUE_LAYOUT,
    ...saved,
    date: { ...DEFAULT_CHEQUE_LAYOUT.date, ...(saved.date || {}) },
    payee: { ...DEFAULT_CHEQUE_LAYOUT.payee, ...(saved.payee || {}) },
    words: { ...DEFAULT_CHEQUE_LAYOUT.words, ...(saved.words || {}) },
    figures: { ...DEFAULT_CHEQUE_LAYOUT.figures, ...(saved.figures || {}) },
  };
};

/** Date as written on the cheque: "21-09-2026", or the 8 digits "21092026" when the cheque has boxes. */
export const chequeDateText = (iso: string, boxes: boolean) => {
  const [y, m, d] = iso.split('-');
  return boxes ? `${d}${m}${y}` : `${d}-${m}-${y}`;
};
