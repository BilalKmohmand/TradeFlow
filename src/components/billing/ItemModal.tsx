import React, { useRef, useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice } from './ui';
import { mainLooseQty } from '../../utils/inventory';

export const UNITS = ['pcs', 'kg', 'bag', 'box', 'can', 'tin', 'litre', 'dozen', 'carton', 'ton'];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editId?: string | null;
}

/** Add or edit an item: name, unit, fixed selling price, stock on hand, low-stock alert level. */
export const ItemModal: React.FC<Props> = ({ isOpen, onClose, editId }) => {
  const { products, addProduct, updateProduct, adjustStock, can, stockBatches } = useTrading();
  const editing = editId ? products.find((p) => p.id === editId) : undefined;
  const [name, setName] = useState(editing?.name || '');
  const [unit, setUnit] = useState(editing?.unit || 'pcs');
  const [price, setPrice] = useState(editing ? String(editing.unitPricePerKg) : '');
  const [cost, setCost] = useState(editing?.costPricePerKg != null ? String(editing.costPricePerKg) : '');
  const [stock, setStock] = useState(editing ? String(editing.stockKg) : '');
  const [minStock, setMinStock] = useState(editing ? String(editing.minThresholdKg) : '');
  const [trackBatches, setTrackBatches] = useState(Boolean(editing?.trackBatches));
  const [code, setCode] = useState(editing?.code || '');
  const [packName, setPackName] = useState(editing?.packName || '');
  const [packSize, setPackSize] = useState(editing?.packSize ? String(editing.packSize) : '');
  // Stock held in batches or other godowns (the stock field is the total across all of them).
  const heldElsewhere = editing ? Math.round((editing.stockKg - mainLooseQty(editing, stockBatches)) * 100) / 100 : 0;
  const [error, setError] = useState('');
  const busy = useRef(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setTimeout(() => { busy.current = false; }, 800);
    if (!name.trim()) return setError('Give the item a name.');
    const p = parseFloat(price);
    if (!Number.isFinite(p) || p < 0) return setError('Enter the selling price.');
    const size = parseFloat(packSize);
    if (packName.trim() && !(size > 1)) return setError(`Enter how many ${unit} are in one ${packName.trim()} (more than 1).`);
    if (!packName.trim() && packSize.trim() && size > 0) return setError('Give the pack a name, e.g. carton.');
    const codeT = code.trim();
    if (codeT && products.some((x) => x.id !== editing?.id && (x.code || '').trim().toLowerCase() === codeT.toLowerCase())) return setError(`Item code ${codeT} is already used by another item.`);
    const data = {
      name: name.trim(),
      category: editing?.category || 'General',
      unit,
      unitPricePerKg: can('edit_prices') || !editing ? p : editing.unitPricePerKg,
      costPricePerKg: cost.trim() ? parseFloat(cost) || 0 : undefined,
      stockKg: parseFloat(stock) || 0,
      minThresholdKg: parseFloat(minStock) || 0,
      // Only write the flag when it is (or was) on, so shops that never use batches keep their data shape.
      ...(trackBatches || editing?.trackBatches != null ? { trackBatches } : {}),
      // Pack unit and code: only written when set (or being cleared), so plain items keep their shape.
      ...(packName.trim() ? { packName: packName.trim(), packSize: size } : editing?.packName ? { packName: '', packSize: 0 } : {}),
      ...(codeT ? { code: codeT } : editing?.code ? { code: '' } : {}),
    };
    if (editing) {
      // A changed stock figure is kept as a stock-count record, so the books and history can explain it.
      const { stockKg, ...rest } = data;
      updateProduct(editing.id, rest);
      if (Math.abs(stockKg - editing.stockKg) > 0.0001) adjustStock(editing.id, stockKg, 'count', 'Changed on the item form');
    }
    else if (products.some((x) => x.name.toLowerCase() === data.name.toLowerCase())) return setError('An item with this name already exists.');
    else addProduct({ ...data, supplierId: null });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit item' : 'New item'} subtitle="Each item has one fixed price; you can still change the price on any bill line.">
      <form onSubmit={submit} className="space-y-4" id="item-form">
        {error && <Notice kind="error">{error}</Notice>}
        <div>
          <label className={labelCls} htmlFor="item-name">Item name</label>
          <input id="item-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. 5 kg Can" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="item-unit">Sold per</label>
            <select id="item-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </div>
          <div>
            <label className={labelCls} htmlFor="item-price">Selling price (Rs.)</label>
            <input id="item-price" type="number" inputMode="decimal" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" disabled={Boolean(editing) && !can('edit_prices')} />
          </div>
          <div>
            <label className={labelCls} htmlFor="item-cost">Cost price (optional)</label>
            <input id="item-cost" type="number" inputMode="decimal" min="0" step="any" value={cost} onChange={(e) => setCost(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="for profit reports" />
          </div>
          <div>
            <label className={labelCls} htmlFor="item-stock">Stock on hand</label>
            <input id="item-stock" type="number" inputMode="decimal" min="0" step="any" value={stock} onChange={(e) => setStock(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0" />
            {heldElsewhere > 0 && <p className="text-[11px] text-[#8E9299] mt-1">Total of all godowns; {heldElsewhere} is in batches or other godowns. Use Receive stock to add a batch.</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="item-pack-name">Pack (optional)</label>
            <input id="item-pack-name" value={packName} onChange={(e) => setPackName(e.target.value)} className={inputCls} placeholder="e.g. carton" list="item-pack-names" />
            <datalist id="item-pack-names">{['carton', 'box', 'bag', 'dozen', 'crate', 'bundle', 'packet'].map((n) => <option key={n} value={n} />)}</datalist>
          </div>
          <div>
            <label className={labelCls} htmlFor="item-pack-size">{unit} per pack</label>
            <input id="item-pack-size" type="number" inputMode="decimal" min="0" step="any" value={packSize} onChange={(e) => setPackSize(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="e.g. 6" />
          </div>
          {packName.trim() && parseFloat(packSize) > 1 && (
            <p className="col-span-2 -mt-1 text-[11px] text-[#6B7280] dark:text-[#94A3B8]">1 {packName.trim()} = {parseFloat(packSize)} {unit}. Bills and Receive stock can be typed in either; stock is kept in {unit}{parseFloat(price) > 0 ? ` (pack price Rs. ${(parseFloat(price) * parseFloat(packSize)).toLocaleString('en-PK', { maximumFractionDigits: 2 })})` : ''}.</p>
          )}
          <div>
            <label className={labelCls} htmlFor="item-code">Item code (optional)</label>
            <input id="item-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="e.g. DC5" />
          </div>
          <div>
            <label className={labelCls} htmlFor="item-min">Warn me when stock drops below</label>
            <input id="item-min" type="number" inputMode="decimal" min="0" step="any" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={`${inputCls} tabular-nums`} placeholder="0 = never" />
          </div>
          <label className="col-span-2 flex items-start gap-3 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] px-3.5 py-3 cursor-pointer">
            <input type="checkbox" checked={trackBatches} onChange={(e) => setTrackBatches(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-teal-700" />
            <span>
              <span className="block text-sm font-semibold text-[#111827] dark:text-white">Track batch &amp; expiry</span>
              <span className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8]">Receive stock with a batch number and expiry date. Bills use the batch that expires first and never sell expired stock.</span>
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}>{editing ? 'Save changes' : 'Add item'}</button>
        </div>
      </form>
    </Modal>
  );
};
