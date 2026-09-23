export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    currencyDisplay: 'symbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

const AMOUNT_WHOLE = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
const AMOUNT_PAISA = new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/**
 * A money figure without "Rs." for printed bills: "1,192,150" when whole, otherwise always two decimals
 * ("12,339,691.50", never "12,339,691.5"). The same rule as `rs` on screen.
 */
export const formatAmount = (n: number): string => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return (Number.isInteger(v) ? AMOUNT_WHOLE : AMOUNT_PAISA).format(v);
};

export const formatKg =(kg: number): string => {
  return `${new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kg)} kg`;
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-PK').format(num);
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-PK', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};
