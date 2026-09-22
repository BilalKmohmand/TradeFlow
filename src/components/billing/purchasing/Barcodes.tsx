import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ScanLine, Printer, X, Camera, Search } from 'lucide-react';
import { useTrading } from '../../../context/TradingContext';
import { Modal, Notice, inputCls, labelCls, primaryBtn, secondaryBtn, rs, cardCls } from '../ui';
import { code128Bars, isEncodable } from '../../../utils/barcode';
import { findByBarcode, itemBrands, itemGroup, itemGroups } from '../../../utils/purchasing';
import { useEscape } from '../../../hooks/useEscape';
import { Product } from '../../../types';
import { cameraScanSupported, startCameraScan, StopScan } from '../../../lib/barcodeScan';

/** A Code 128 barcode as inline SVG (drawn in the app, prints sharp at any size). */
export const BarcodeSvg: React.FC<{ value: string; height?: number; className?: string; showText?: boolean }> = ({ value, height = 40, className, showText = true }) => {
  const drawn = useMemo(() => (isEncodable(value) ? code128Bars(value) : null), [value]);
  if (!drawn) return <span className="text-[10px] text-rose-700">Barcode can't be drawn</span>;
  return (
    <span className={`inline-flex flex-col items-center ${className || ''}`} data-testid="barcode" data-value={value}>
      <svg viewBox={`0 0 ${drawn.width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={`Barcode ${value}`}>
        <rect width={drawn.width} height={height} fill="#fff" />
        {drawn.bars.map(([x, w]) => <rect key={x} x={x} y={0} width={w} height={height} fill="#000" />)}
      </svg>
      {showText && <span className="font-mono text-[9px] tracking-widest leading-none mt-0.5 text-black">{value}</span>}
    </span>
  );
};

/**
 * Find an item by scanning. With a phone camera the code is read automatically (the browser's own
 * BarcodeDetector where there is one, else a bundled decoder that loads on first use, so iPhone Safari
 * works too); with a USB scanner, which types the code and presses Enter, or by hand, type it in the
 * box. The item's barcode or its item code both work.
 */
export const ScanDialog: React.FC<{ isOpen: boolean; onClose: () => void; onPick: (p: Product) => void; title?: string; keepOpen?: boolean }> = ({ isOpen, onClose, onPick, title = 'Scan barcode', keepOpen }) => {
  const { products } = useTrading();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [camera, setCamera] = useState<'off' | 'starting' | 'on' | 'failed'>('off');
  const video = useRef<HTMLVideoElement>(null);
  const stopScan = useRef<StopScan | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lastHit = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  useEscape(isOpen, onClose, 1);

  const stop = () => {
    stopScan.current?.();
    stopScan.current = null;
  };
  useEffect(() => () => stop(), []);
  useEffect(() => {
    if (!isOpen) { stop(); setCamera('off'); return; }
    setTimeout(() => input.current?.focus(), 30);
  }, [isOpen]);

  const pick = (raw: string): boolean => {
    const text = raw.trim();
    if (!text) return false;
    const p = findByBarcode(products, text);
    if (!p) {
      setMsg({ kind: 'error', text: `No item has the code ${text}. Add it on the item (Items → Edit → Barcode).` });
      return false;
    }
    onPick(p);
    setCode('');
    if (keepOpen) setMsg({ kind: 'ok', text: `${p.name} added.` });
    else onClose();
    return true;
  };
  // The camera loop runs across renders: it always calls the latest pick (fresh products / lines).
  const pickRef = useRef(pick);
  pickRef.current = pick;

  const startCamera = async () => {
    if (!cameraScanSupported() || !video.current) return;
    setCamera('starting');
    try {
      let done = false;
      const stopNow = await startCameraScan(video.current, (hit) => {
        if (done) return;
        const now = Date.now();
        // The same code read twice in a row within 2 s is one scan.
        if (hit === lastHit.current.code && now - lastHit.current.at < 2000) return;
        lastHit.current = { code: hit, at: now };
        if (pickRef.current(hit) && !keepOpen) {
          done = true;
          stop();
        }
      });
      // Closed while the camera was starting: let it go at once.
      if (!video.current || done) { stopNow(); return; }
      stopScan.current = stopNow;
      setCamera('on');
    } catch {
      setCamera('failed');
    }
  };

  if (!isOpen) return null;
  return createPortal(
    // React events from a portal still bubble to the dialog that opened it (e.g. the New bill form):
    // keep keys, clicks and the submit of this box to itself.
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onSubmit={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-[#101A26] rounded-t-[28px] sm:rounded-[28px] border border-[#E5E5E1] dark:border-[#203248] shadow-2xl p-5 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#111827] dark:text-white">{title}</h2>
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Point the camera at the barcode, or scan with a USB scanner / type the code below.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close scanner" className="p-2 rounded-xl text-[#6B7280] hover:bg-[#F4F3EF] dark:hover:bg-[#162436]"><X className="w-5 h-5" /></button>
        </div>
        {cameraScanSupported() ? (
          <div className="space-y-2">
            <video ref={video} playsInline muted className={`w-full rounded-2xl bg-black aspect-video object-cover ${camera === 'on' || camera === 'starting' ? '' : 'hidden'}`} />
            {camera === 'starting' && <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]" role="status">Opening the camera…</p>}
            {camera === 'off' && <button type="button" onClick={() => void startCamera()} className={`${secondaryBtn} w-full`}><Camera className="w-4 h-4" /> Use the camera</button>}
            {camera === 'failed' && <p className="text-xs text-rose-700 dark:text-rose-300">The camera could not be opened (permission denied or no camera). Type or scan the code instead.</p>}
          </div>
        ) : (
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">This browser can't open the camera. A USB barcode scanner works: click in the box and scan.</p>
        )}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); pick(code); }} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className={labelCls} htmlFor="scan-code">Barcode or item code</label>
            <input ref={input} id="scan-code" value={code} onChange={(e) => { setCode(e.target.value); setMsg(null); }} className={`${inputCls} font-mono`} autoComplete="off" inputMode="text" placeholder="Scan or type, then Enter" />
          </div>
          <button type="submit" className={primaryBtn}><Search className="w-4 h-4" /> Find</button>
        </form>
      </div>
    </div>,
    document.body
  );
};

/** "Scan" button that opens the scanner and hands back the item found. */
export const ScanButton: React.FC<{ onPick: (p: Product) => void; label?: string; className?: string; keepOpen?: boolean }> = ({ onPick, label = 'Scan', className, keepOpen }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || secondaryBtn} aria-label={label === 'Scan' ? 'Scan barcode' : label}>
        <ScanLine className="w-4 h-4 text-teal-700 dark:text-teal-300" /> {label}
      </button>
      <ScanDialog isOpen={open} onClose={() => setOpen(false)} onPick={onPick} keepOpen={keepOpen} />
    </>
  );
};

// ---------------------------------------------------------------------------
// Barcode labels on an A4 sheet
// ---------------------------------------------------------------------------
/** Standard A4 label sheets (mm). */
export const LABEL_SHEETS = [
  { id: '3x8', label: '24 per sheet (3 × 8, 70 × 37 mm)', cols: 3, rows: 8, w: 70, h: 37 },
  { id: '4x10', label: '40 per sheet (4 × 10, 52.5 × 29.7 mm)', cols: 4, rows: 10, w: 52.5, h: 29.7 },
  { id: '2x7', label: '14 per sheet (2 × 7, 99 × 38 mm)', cols: 2, rows: 7, w: 99, h: 38 },
] as const;

/** Pick items and how many labels each, then print them on an A4 label sheet. */
export const BarcodeLabelsModal: React.FC<{ isOpen: boolean; onClose: () => void; productIds?: string[] }> = ({ isOpen, onClose, productIds }) => {
  const { products, settings } = useTrading();
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries((productIds || []).map((id) => [id, '1'])));
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [brand, setBrand] = useState('');
  const [sheet, setSheet] = useState<(typeof LABEL_SHEETS)[number]['id']>('3x8');
  const [showPrice, setShowPrice] = useState(true);
  const [skip, setSkip] = useState('0');
  const [preview, setPreview] = useState(false);
  const groups = useMemo(() => itemGroups(products), [products]);
  const brands = useMemo(() => itemBrands(products), [products]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...products]
      .filter((p) => (!q || p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q) || (p.barcode || '').includes(q)) && (!group || itemGroup(p) === group) && (!brand || (p.brand || '') === brand))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, query, group, brand]);
  const codeOf = (p: Product) => (p.barcode || '').trim() || (p.code || '').trim();
  const chosen = products.filter((p) => (parseInt(counts[p.id] || '0', 10) || 0) > 0);
  const labels: Product[] = chosen.flatMap((p) => (codeOf(p) && isEncodable(codeOf(p)) ? Array.from({ length: Math.min(500, parseInt(counts[p.id], 10) || 0) }, () => p) : []));
  const noCode = chosen.filter((p) => !codeOf(p) || !isEncodable(codeOf(p)));
  const fmt = LABEL_SHEETS.find((s) => s.id === sheet)!;
  const blanks = Math.max(0, Math.min(fmt.cols * fmt.rows - 1, parseInt(skip, 10) || 0));

  return (
    <>
      <Modal isOpen={isOpen && !preview} onClose={onClose} title="Print barcode labels" subtitle="Choose items and how many labels of each. Prints on an A4 label sheet." wide
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-sm text-[#6B7280] dark:text-[#94A3B8]">{labels.length} label{labels.length === 1 ? '' : 's'}{labels.length ? ` • ${Math.ceil((labels.length + blanks) / (fmt.cols * fmt.rows))} sheet${Math.ceil((labels.length + blanks) / (fmt.cols * fmt.rows)) === 1 ? '' : 's'}` : ''}</span>
            <button type="button" onClick={onClose} className={secondaryBtn}>Close</button>
            <button type="button" onClick={() => setPreview(true)} disabled={labels.length === 0} className={primaryBtn}><Printer className="w-4 h-4" /> Preview labels</button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="col-span-2"><label className={labelCls} htmlFor="lbl-search">Find item</label><input id="lbl-search" value={query} onChange={(e) => setQuery(e.target.value)} className={inputCls} placeholder="Name, code or barcode" /></div>
            <div><label className={labelCls} htmlFor="lbl-group">Group</label><select id="lbl-group" value={group} onChange={(e) => setGroup(e.target.value)} className={inputCls}><option value="">All</option>{groups.map((g) => <option key={g}>{g}</option>)}</select></div>
            <div><label className={labelCls} htmlFor="lbl-brand">Brand</label><select id="lbl-brand" value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls}><option value="">All</option>{brands.map((g) => <option key={g}>{g}</option>)}</select></div>
            <div className="col-span-2"><label className={labelCls} htmlFor="lbl-sheet">Label sheet</label><select id="lbl-sheet" value={sheet} onChange={(e) => setSheet(e.target.value as typeof sheet)} className={inputCls}>{LABEL_SHEETS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
            <div><label className={labelCls} htmlFor="lbl-skip">Skip used labels</label><input id="lbl-skip" type="number" min="0" inputMode="numeric" value={skip} onChange={(e) => setSkip(e.target.value)} className={`${inputCls} tabular-nums`} /></div>
            <label className="flex items-center gap-2 text-sm font-semibold text-[#374151] dark:text-[#CBD5E1] pt-5"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} className="w-5 h-5 accent-teal-700" /> Show price</label>
          </div>
          {noCode.length > 0 && <Notice kind="error">{noCode.map((p) => p.name).join(', ')} {noCode.length === 1 ? 'has' : 'have'} no barcode or item code. Edit the item to add one.</Notice>}
          <ul className={`${cardCls} divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] max-h-[45vh] overflow-y-auto`} aria-label="Items for labels">
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#111827] dark:text-white truncate">{p.name}</div>
                  <div className="text-[11px] text-[#8E9299] font-mono truncate">{codeOf(p) || 'no barcode'}{p.brand ? <span className="font-sans"> • {p.brand}</span> : ''}</div>
                </div>
                <input aria-label={`Labels for ${p.name}`} type="number" min="0" inputMode="numeric" value={counts[p.id] || ''} onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))} placeholder="0" className={`${inputCls} !w-20 shrink-0 tabular-nums text-right`} />
              </li>
            ))}
            {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-[#8E9299]">No items match.</li>}
          </ul>
        </div>
      </Modal>
      {isOpen && preview && createPortal(
        <LabelSheet labels={labels} blanks={blanks} fmt={fmt} showPrice={showPrice} shop={settings.companyName || ''} codeOf={codeOf} onClose={() => setPreview(false)} />,
        document.body
      )}
    </>
  );
};

const LabelSheet: React.FC<{ labels: Product[]; blanks: number; fmt: (typeof LABEL_SHEETS)[number]; showPrice: boolean; shop: string; codeOf: (p: Product) => string; onClose: () => void }> = ({ labels, blanks, fmt, showPrice, shop, codeOf, onClose }) => {
  useEscape(true, onClose, 1);
  const perSheet = fmt.cols * fmt.rows;
  const cells: (Product | null)[] = [...Array.from({ length: blanks }, () => null), ...labels];
  const sheets: (Product | null)[][] = [];
  for (let i = 0; i < cells.length; i += perSheet) sheets.push(cells.slice(i, i + perSheet));
  // A4 is 210 × 297 mm; the grid is centred with equal margins.
  const mx = Math.max(0, (210 - fmt.cols * fmt.w) / 2);
  const my = Math.max(0, (297 - fmt.rows * fmt.h) / 2);
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/70 p-4 print:static print:p-0 print:bg-white" data-testid="label-preview">
      <style>{`@media print { @page { size: A4; margin: 0; } #print-root { padding: 0 !important; } .label-sheet { page-break-after: always; } .label-sheet:last-child { page-break-after: auto; } }`}</style>
      <div className="flex items-center justify-between max-w-[210mm] mx-auto mb-3 print:hidden">
        <span className="text-xs text-white/80">{labels.length} label{labels.length === 1 ? '' : 's'} on {sheets.length} A4 sheet{sheets.length === 1 ? '' : 's'}. Print at 100% (no scaling).</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="px-4 py-2 bg-white text-[#111827] text-xs font-bold rounded-2xl flex items-center gap-1.5"><Printer className="w-3.5 h-3.5 text-teal-700" /> Print</button>
          <button type="button" onClick={onClose} aria-label="Close label preview" className="p-2 rounded-2xl bg-white/10 text-white"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div id="print-root" className="mx-auto w-[210mm] max-w-full bg-white text-black">
        {sheets.map((cellsOnSheet, si) => (
          <div key={si} className="label-sheet relative bg-white" style={{ width: '210mm', height: '297mm', paddingLeft: `${mx}mm`, paddingTop: `${my}mm`, boxSizing: 'border-box' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fmt.cols}, ${fmt.w}mm)`, gridAutoRows: `${fmt.h}mm` }}>
              {cellsOnSheet.map((p, i) => (
                <div key={i} className="overflow-hidden flex flex-col items-center justify-center text-center px-[2mm] outline outline-1 outline-dashed outline-gray-200 print:outline-none" data-testid={p ? 'label' : 'label-blank'}>
                  {p && (
                    <>
                      {shop && fmt.h >= 35 && <div className="text-[7pt] text-gray-600 leading-tight truncate w-full">{shop}</div>}
                      <div className="text-[8pt] font-bold leading-tight line-clamp-2 w-full">{p.name}</div>
                      <BarcodeSvg value={codeOf(p)} height={fmt.h >= 35 ? 34 : 26} className="w-[90%]" />
                      {showPrice && <div className="text-[9pt] font-extrabold leading-none mt-0.5">{rs(p.unitPricePerKg)}{p.unit ? <span className="text-[7pt] font-normal"> / {p.unit}</span> : null}</div>}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
