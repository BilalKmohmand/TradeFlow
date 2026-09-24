import { downloadCsvText, toCsv } from '../../utils/listTools';
import { importNumber, importSignedNumber, mapColumns, planImport } from '../../utils/masterImport';
import { foldText } from '../../utils/search';
import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';

type Kind = 'customers' | 'suppliers' | 'products';

const TEMPLATES: Record<Kind, { headers: string[]; sample: string[] }> = {
  customers: { headers: ['code', 'name', 'company', 'phone', 'city', 'contactPerson', 'salesTaxNo', 'fax', 'email', 'address', 'creditLimit', 'openingDue'], sample: ['C-0215', 'Ali Raza', 'Raza Traders', '0300 1234567', 'Batkhela', 'Ali Raza', '32-77-8761-123-45', '0932-412345', '', 'Main Bazar', '500000', '0'] },
  suppliers: { headers: ['code', 'name', 'company', 'phone', 'city', 'contactPerson', 'salesTaxNo', 'fax', 'email', 'materialCategory', 'address', 'openingOwed'], sample: ['S-0104', 'Iftikhar', 'Tajj Mill', '0300 7654321', 'Peshawar', 'Iftikhar', '', '', '', 'Ghee & oil', 'Hayatabad', '0'] },
  products: { headers: ['code', 'name', 'category', 'brand', 'unit', 'unitPricePerKg', 'costPricePerKg', 'stockKg', 'minThresholdKg', 'barcode', 'packName', 'packSize', 'supplierCompany'], sample: ['DT16', 'Dalda 16 kg tin', 'Ghee', 'Dalda', 'tin', '7200', '6900', '40', '10', '', 'carton', '1', 'Dalda Foods'] },
};

/**
 * The separator a file uses: comma, semicolon (common in bank exports and European Excel) or tab,
 * judged from the first line outside quotes.
 */
export const detectDelimiter = (text: string): ',' | ';' | '\t' => {
  const firstLine = (text.split(/\r?\n/).find((l) => l.trim() !== '') || '').replace(/"[^"]*"/g, '');
  const count = (c: string) => firstLine.split(c).length - 1;
  const best = ([',', ';', '\t'] as const).map((c) => [c, count(c)] as const).sort((x, y) => y[1] - x[1])[0];
  return best[1] > 0 ? best[0] : ',';
};

/** Minimal CSV parser that copes with quoted fields, CRLF, and comma / semicolon / tab separators. */
export const parseCsv = (text: string, delimiter: ',' | ';' | '\t' = detectDelimiter(text)): string[][] => {
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
    else if (ch === delimiter) {
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
  const { customers, suppliers, products, addCustomer, addSupplier, addProduct, setOpeningBalance, logAuditEvent } = useTrading();
  const [kind, setKind] = useState<Kind>('customers');
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][]; problems: string[] } | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const t = TEMPLATES[kind];
    const csv = `${toCsv(t.headers, [t.sample])}\n`;
    downloadCsvText(`sarmaya-${kind}-template.csv`, csv);
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
      const headers = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
      const problems = mapColumns(kind, headers).missing.map(() => 'The file needs a Name column (name, Name, Party Name or Item name).');
      setPreview({ headers, rows: rows.slice(1), problems });
      setResult(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const runImport = () => {
    if (!preview || preview.problems.length > 0) return;
    const existing = kind === 'customers' ? customers : kind === 'suppliers' ? suppliers : products;
    const plan = planImport(kind, preview.headers, preview.rows, existing as { name: string; phone?: string; code?: string; barcode?: string }[]);
    const errors = plan.skipped.map((x) => `Line ${x.line}: ${x.reason}`);
    let added = 0;
    plan.add.forEach(({ line, values: v }) => {
      try {
        const extra = Object.fromEntries(Object.entries({ city: v.city, contactPerson: v.contactPerson, salesTaxNo: v.salesTaxNo, fax: v.fax }).filter(([, x]) => x)) as { city?: string; contactPerson?: string; salesTaxNo?: string; fax?: string };
        if (kind === 'customers') {
          const c = addCustomer({ name: v.name!, company: v.company || v.name!, phone: v.phone || '', email: v.email || '', address: v.address || '', creditLimit: importNumber(v.creditLimit), code: v.code || undefined, ...extra });
          // Old khata balance: a proper "Opening balance" ledger row (negative = advance).
          const opening = importSignedNumber(v.openingDue);
          if (opening !== 0) setOpeningBalance('customer', c.id, opening, c.createdAt);
        } else if (kind === 'suppliers') {
          const x = addSupplier({ name: v.name!, company: v.company || v.name!, phone: v.phone || '', email: v.email || '', materialCategory: v.materialCategory || 'General', address: v.address || '', code: v.code || undefined, ...extra });
          const opening = importSignedNumber(v.openingOwed);
          if (opening !== 0) setOpeningBalance('supplier', x.id, opening, x.createdAt);
        } else {
          const supplierCompany = foldText(v.supplierCompany);
          const supplier = supplierCompany ? suppliers.find((s) => foldText(s.company) === supplierCompany || foldText(s.name) === supplierCompany) : undefined;
          const packSize = importNumber(v.packSize);
          addProduct({
            name: v.name!,
            category: v.category || 'General',
            unit: v.unit || 'pcs',
            unitPricePerKg: importNumber(v.unitPricePerKg),
            ...(v.costPricePerKg ? { costPricePerKg: importNumber(v.costPricePerKg) } : {}),
            stockKg: importNumber(v.stockKg),
            minThresholdKg: importNumber(v.minThresholdKg),
            supplierId: supplier?.id ?? null,
            ...(v.description ? { description: v.description } : {}),
            ...(v.code ? { code: v.code } : {}),
            ...(v.brand ? { brand: v.brand } : {}),
            ...(v.barcode ? { barcode: v.barcode } : {}),
            ...(v.packName && packSize > 1 ? { packName: v.packName, packSize } : {}),
          });
        }
        added++;
      } catch (err: any) {
        errors.push(`Line ${line}: ${err?.message || 'could not import'}`);
      }
    });
    const skipped = errors.length;
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
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-0.5">Bring existing customers, suppliers and products across in one go. Export your sheet as CSV, match the template columns, and upload. A file downloaded from the Customers or Suppliers screen can be imported as it is; Urdu names are kept (save from Excel as “CSV UTF-8”). Only the name is required. Rows whose phone, ID / item code, barcode or item name is already used are skipped and listed.</p>
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
