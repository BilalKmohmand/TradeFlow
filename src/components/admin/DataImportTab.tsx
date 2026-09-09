import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';

type Kind = 'customers' | 'suppliers' | 'products';

const TEMPLATES: Record<Kind, { headers: string[]; sample: string[] }> = {
  customers: { headers: ['name', 'company', 'phone', 'email', 'address', 'creditLimit', 'openingDue'], sample: ['Ali Raza', 'Raza Traders', '+92 300 1234567', 'ali@raza.pk', 'Karachi', '500000', '0'] },
  suppliers: { headers: ['name', 'company', 'phone', 'email', 'materialCategory', 'address', 'openingOwed'], sample: ['Ahmed', 'Lucky Cement', '+92 300 7654321', 'orders@lucky.pk', 'Cement & Materials', 'Port Qasim', '0'] },
  products: { headers: ['name', 'category', 'unitPricePerKg', 'stockKg', 'minThresholdKg', 'supplierCompany', 'description'], sample: ['OPC Cement', 'Construction & Cement', '25', '480000', '100000', 'Lucky Cement', 'Grade 53'] },
};

/** Minimal CSV parser that copes with quoted fields, commas and CRLF. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
};

export const DataImportTab: React.FC = () => {
  const { customers, suppliers, products, addCustomer, addSupplier, addProduct, updateCustomer, updateSupplier, logAuditEvent } = useTrading();
  const [kind, setKind] = useState<Kind>('customers');
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][]; problems: string[] } | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const t = TEMPLATES[kind];
    const csv = `${t.headers.join(',')}\n${t.sample.join(',')}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sarmaya-${kind}-template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result || ''));
      if (rows.length < 2) {
        setPreview({ headers: [], rows: [], problems: ['The file needs a header row and at least one data row.'] });
        return;
      }
      const headers = rows[0].map((h) => h.trim());
      const required = TEMPLATES[kind].headers.slice(0, 2);
      const problems = required.filter((h) => !headers.includes(h)).map((h) => `Missing required column "${h}".`);
      setPreview({ headers, rows: rows.slice(1), problems });
      setResult(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const col = (row: string[], name: string) => {
    const i = preview!.headers.indexOf(name);
    return i >= 0 ? (row[i] || '').trim() : '';
  };
  const num = (v: string) => Math.max(0, parseFloat(v.replace(/[^0-9.\-]/g, '')) || 0);
  const digits = (v: string) => v.replace(/[^0-9]/g, '');

  const runImport = () => {
    if (!preview || preview.problems.length > 0) return;
    let added = 0;
    let skipped = 0;
    const errors: string[] = [];
    preview.rows.forEach((row, idx) => {
      const line = idx + 2;
      try {
        if (kind === 'customers') {
          const name = col(row, 'name');
          const company = col(row, 'company') || name;
          const phone = col(row, 'phone');
          if (!name || !phone) {
            skipped++;
            errors.push(`Line ${line}: name and phone are required.`);
            return;
          }
          if (customers.some((c) => digits(c.phone) === digits(phone))) {
            skipped++;
            errors.push(`Line ${line}: ${name} skipped, phone already exists.`);
            return;
          }
          const c = addCustomer({ name, company, phone, email: col(row, 'email'), address: col(row, 'address'), creditLimit: num(col(row, 'creditLimit')) });
          const opening = num(col(row, 'openingDue'));
          if (opening > 0) updateCustomer(c.id, { totalDue: opening });
          added++;
        } else if (kind === 'suppliers') {
          const name = col(row, 'name');
          const company = col(row, 'company') || name;
          const phone = col(row, 'phone');
          if (!name || !phone) {
            skipped++;
            errors.push(`Line ${line}: name and phone are required.`);
            return;
          }
          if (suppliers.some((s) => digits(s.phone) === digits(phone))) {
            skipped++;
            errors.push(`Line ${line}: ${company} skipped, phone already exists.`);
            return;
          }
          const s = addSupplier({ name, company, phone, email: col(row, 'email'), materialCategory: col(row, 'materialCategory') || 'General', address: col(row, 'address') });
          const opening = num(col(row, 'openingOwed'));
          if (opening > 0) updateSupplier(s.id, { totalOwed: opening });
          added++;
        } else {
          const name = col(row, 'name');
          if (!name) {
            skipped++;
            errors.push(`Line ${line}: name is required.`);
            return;
          }
          if (products.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
            skipped++;
            errors.push(`Line ${line}: ${name} skipped, product already exists.`);
            return;
          }
          const supplierCompany = col(row, 'supplierCompany').toLowerCase();
          const supplier = supplierCompany ? suppliers.find((s) => s.company.toLowerCase() === supplierCompany) : undefined;
          addProduct({ name, category: col(row, 'category') || 'General', unitPricePerKg: num(col(row, 'unitPricePerKg')), stockKg: num(col(row, 'stockKg')), minThresholdKg: num(col(row, 'minThresholdKg')), supplierId: supplier?.id, description: col(row, 'description') || undefined });
          added++;
        }
      } catch (err: any) {
        skipped++;
        errors.push(`Line ${line}: ${err?.message || 'could not import'}`);
      }
    });
    logAuditEvent('CSV Import', `${added} ${kind} imported, ${skipped} skipped.`, 'warning');
    setResult({ added, skipped, errors });
    setPreview(null);
  };

  const inputCls = 'bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-[#111827] dark:text-white';

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-xs space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-[#162436] border border-[#E5E5E1] dark:border-[#203248] text-teal-700 dark:text-teal-400"><FileSpreadsheet className="w-5 h-5" /></div>
          <div>
            <h3 className="text-base font-bold text-[#111827] dark:text-white">Import from CSV / Excel</h3>
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-0.5">Bring existing customers, suppliers and products across in one go. Export your sheet as CSV, match the template columns, and upload. Duplicates (same phone or product name) are skipped.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={kind} onChange={(e) => { setKind(e.target.value as Kind); setPreview(null); setResult(null); }} className={inputCls}>
            <option value="customers">Customers</option>
            <option value="suppliers">Suppliers</option>
            <option value="products">Products</option>
          </select>
          <button type="button" onClick={downloadTemplate} className={`${inputCls} flex items-center gap-1.5 hover:bg-[#F4F3EF] dark:hover:bg-[#1E2E40]`}><Download className="w-3.5 h-3.5" /> Download template</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="px-4 py-2.5 rounded-2xl bg-[#111827] dark:bg-white text-white dark:text-[#111827] text-xs font-bold flex items-center gap-1.5"><Upload className="w-3.5 h-3.5 text-teal-400 dark:text-teal-700" /> Choose CSV file</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        </div>
        <p className="text-[11px] text-[#8E9299] font-mono">Columns for {kind}: {TEMPLATES[kind].headers.join(', ')}</p>
      </div>

      {preview && (
        <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[#111827] dark:text-white">Preview: {preview.rows.length} row(s)</h4>
            <button type="button" disabled={preview.problems.length > 0 || preview.rows.length === 0} onClick={runImport} className="px-5 py-2.5 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold disabled:opacity-40">Import {preview.rows.length} {kind}</button>
          </div>
          {preview.problems.map((p) => (
            <div key={p} className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {p}</div>
          ))}
          <div className="overflow-x-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF9F6] dark:bg-[#162436] text-[#8E9299] uppercase tracking-widest font-bold text-[10px]"><tr>{preview.headers.map((h) => <th key={h} className="py-2.5 px-3 whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[#FAF9F6] dark:divide-[#1E2E40]">
                {preview.rows.slice(0, 8).map((r, i) => <tr key={i}>{preview.headers.map((_, j) => <td key={j} className="py-2 px-3 text-[#374151] dark:text-[#CBD5E1] whitespace-nowrap max-w-[200px] truncate">{r[j]}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 8 && <p className="text-[11px] text-[#8E9299]">…and {preview.rows.length - 8} more row(s).</p>}
        </div>
      )}

      {result && (
        <div className="bg-white dark:bg-[#101A26] rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] p-6 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-teal-800 dark:text-teal-300"><CheckCircle2 className="w-4 h-4" /> Imported {result.added}, skipped {result.skipped}.</div>
          {result.errors.slice(0, 20).map((e) => <div key={e} className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] font-mono">{e}</div>)}
        </div>
      )}
    </div>
  );
};
