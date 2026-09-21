/** Small helpers shared by the list screens: sorting and CSV export (the one CSV helper for the app). */
export type CsvCell = string | number | null | undefined;

/** Rows → CSV text. Every cell is quoted; quotes inside are doubled. */
export const toCsv = (headers: string[], rows: CsvCell[][]): string => {
  const q = (v: CsvCell) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\n');
};

/** Save CSV text as a file. A byte-order mark lets Excel read Urdu / accented names correctly. */
export const downloadCsvText = (name: string, csv: string) => {
  const body = csv.startsWith('﻿') ? csv : `﻿${csv}`;
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const downloadCsvFile = (name: string, headers: string[], rows: CsvCell[][]) => downloadCsvText(name, toCsv(headers, rows));

export function sortBy<T>(list: T[], key: (item: T) => string | number, dir: 'asc' | 'desc'): T[] {
  return [...list].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const cmp = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb));
    return dir === 'asc' ? cmp : -cmp;
  });
}
