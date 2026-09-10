import React, { useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn, Notice } from './ui';

export const UNITS = ['pcs', 'kg', 'bag', 'box', 'can', 'tin', 'litre', 'dozen', 'carton', 'ton'];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editId?: string | null;
}

/** Add or edit an item: name, unit, fixed selling price, stock on hand, low-stock alert level. */
export const ItemModal: React.FC<Props> = ({ isOpen, onClose, editId }) => {
  const { products, addProduct, updateProduct, can } = useTrading();
  const editing = editId ? products.find((p) => p.id === editId) : undefined;
  const [name, setName] = useState(editing?.name || '');
  const [unit, setUnit] = useState(editing?.unit || 'pcs');
  const [price, setPrice] = useState(editing ? String(editing.unitPricePerKg) : '');
  const [cost, setCost] = useState(editing?.costPricePerKg != null ? String(editing.costPricePerKg) : '');
  const [stock, setStock] = useState(editing ? String(editing.stockKg) : '');
  const [minStock, setMinStock] = useState(editing ? String(editing.minThresholdKg) : '');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
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
    };
    if (editing) updateProduct(editing.id, data);
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
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="item-min">Warn me when stock drops below</label>
            <input id="item-min" type="number" inputMode="decimal" min="0" step="any" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={`${inputCls} font-mono`} placeholder="0 = never" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}>{editing ? 'Save changes' : 'Add item'}</button>
        </div>
      </form>
    </Modal>
  );
};
