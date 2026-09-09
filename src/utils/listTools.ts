/** Small helpers shared by the list screens: sorting and CSV export. */
export const downloadCsvFile = (name: string, headers: string[], rows: (string | number)[][]) => {
  const q = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export function sortBy<T>(list: T[], key: (item: T) => string | number, dir: 'asc' | 'desc'): T[] {
  return [...list].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const cmp = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb));
    return dir === 'asc' ? cmp : -cmp;
  });
}
