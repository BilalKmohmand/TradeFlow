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
            <input id="item-price" type="number" inputMode="decimal" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputCls} font-mono`} placeholder="0" disabled={Boolean(editing) && !can('edit_prices')} />
          </div>
          <div>
            <label className={labelCls} htmlFor="item-cost">Cost price (optional)</label>
            <input id="item-cost" type="number" inputMode="decimal" min="0" step="any" value={cost} onChange={(e) => setCost(e.target.value)} className={`${inputCls} font-mono`} placeholder="for profit reports" />
          </div>
          <div>
            <label className={labelCls} htmlFor="item-stock">Stock on hand</label>
            <input id="item-stock" type="number" inputMode="decimal" min="0" step="any" value={stock} onChange={(e) => setStock(e.target.value)} className={`${inputCls} font-mono`} placeholder="0" />
            {heldElsewhere > 0 && <p className="text-[11px] text-[#8E9299] mt-1">Total of all godowns; {heldElsewhere} is in batches or other godowns. Use Receive stock to add a batch.</p>}
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="item-min">Warn me when stock drops below</label>
            <input id="item-min" type="number" inputMode="decimal" min="0" step="any" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={`${inputCls} font-mono`} placeholder="0 = never" />
          </div>
          <label className="col-span-2 flex items-start gap-3 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] px-3.5 py-3 cursor-pointer">
            <input type="checkbox" checked={trackBatches} onChange={(e) => setTrackBatches(e.target.checked)} className="mt-0.5 w-4 h-4 accent-teal-700" />
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
