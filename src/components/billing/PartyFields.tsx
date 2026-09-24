import React, { useMemo, useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import { inputCls, labelCls } from './ui';
import { allCities } from '../../utils/vouchers';

export interface PartyExtra {
  city: string;
  contactPerson: string;
  salesTaxNo: string;
  fax: string;
}

export const partyExtraOf = (p?: { city?: string; contactPerson?: string; salesTaxNo?: string; fax?: string }): PartyExtra => ({
  city: p?.city || '',
  contactPerson: p?.contactPerson || '',
  salesTaxNo: p?.salesTaxNo || '',
  fax: p?.fax || '',
});

/** Trimmed values for saving (empty fields are cleared). */
export const cleanPartyExtra = (x: PartyExtra) => ({
  city: x.city.trim().replace(/\s+/g, ' ') || undefined,
  contactPerson: x.contactPerson.trim() || undefined,
  salesTaxNo: x.salesTaxNo.trim() || undefined,
  fax: x.fax.trim() || undefined,
});

export const usePartyExtra = (p?: Parameters<typeof partyExtraOf>[0]) => useState<PartyExtra>(() => partyExtraOf(p));

/** City / town (the managed list, or any other typed in), contact person, sales tax # and fax. */
export const PartyExtraFields: React.FC<{ idPrefix: string; value: PartyExtra; onChange: (v: PartyExtra) => void }> = ({ idPrefix, value, onChange }) => {
  const { settings, customers, suppliers } = useTrading();
  const cities = useMemo(() => allCities(settings, customers, suppliers), [settings, customers, suppliers]);
  const set = (k: keyof PartyExtra) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-city`}>City / town (optional)</label>
        <input id={`${idPrefix}-city`} list={`${idPrefix}-cities`} value={value.city} onChange={set('city')} className={inputCls} placeholder="e.g. Mardan" autoComplete="off" />
        <datalist id={`${idPrefix}-cities`}>{cities.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-contact`}>Contact person (optional)</label>
        <input id={`${idPrefix}-contact`} value={value.contactPerson} onChange={set('contactPerson')} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-stn`}>Sales tax # (optional)</label>
        <input id={`${idPrefix}-stn`} value={value.salesTaxNo} onChange={set('salesTaxNo')} className={`${inputCls} tabular-nums`} placeholder="STRN" />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-fax`}>Fax (optional)</label>
        <input id={`${idPrefix}-fax`} value={value.fax} onChange={set('fax')} className={`${inputCls} tabular-nums`} />
      </div>
    </>
  );
};

export interface OpeningValue {
  amount: string;
  date: string;
  /** What is on the books now (to save only when it changed). */
  was: number;
  wasDate: string;
}

/** The party's current opening (old khata) balance row, for the form. */
export const useOpeningBalance = (entityType: 'customer' | 'supplier', id?: string) => {
  const { ledger } = useTrading();
  return useState<OpeningValue>(() => {
    const row = id ? ledger.find((l) => l.entityType === entityType && l.entityId === id && l.type === 'opening_balance') : undefined;
    const amt = row ? Math.round(((Number(row.debit) || 0) - (Number(row.credit) || 0)) * 100) / 100 : 0;
    const today = new Date().toISOString().slice(0, 10);
    return { amount: amt ? String(amt) : '', date: row?.date || today, was: amt, wasDate: row?.date || today };
  });
};

/** Parsed opening amount, or an error message. */
export const parseOpening = (v: OpeningValue): { amount: number } | { error: string } => {
  const raw = v.amount.replace(/,/g, '').trim();
  if (!raw) return { amount: 0 };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: 'The opening balance must be a number (use a minus sign for an advance).' };
  if (n !== 0 && !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return { error: 'Enter the "as of" date of the opening balance.' };
  return { amount: Math.round(n * 100) / 100 };
};

/** Opening balance (Rs.) and its as-of date. Customer: they owe us. Supplier: we owe them. Negative = advance. */
export const OpeningBalanceFields: React.FC<{ idPrefix: string; entityType: 'customer' | 'supplier'; value: OpeningValue; onChange: (v: OpeningValue) => void }> = ({ idPrefix, entityType, value, onChange }) => (
  <>
    <div>
      <label className={labelCls} htmlFor={`${idPrefix}-opening`}>Opening balance (Rs.)</label>
      <input id={`${idPrefix}-opening`} type="text" inputMode="decimal" value={value.amount} onChange={(e) => onChange({ ...value, amount: e.target.value })} className={`${inputCls} tabular-nums`} placeholder="0" />
      <p className="text-[11px] text-[#8E9299] mt-1">{entityType === 'customer' ? 'Old khata: what they owed you' : 'Old khata: what you owed them'} when you moved over. Minus = advance.</p>
    </div>
    <div>
      <label className={labelCls} htmlFor={`${idPrefix}-opening-date`}>Opening balance as of</label>
      <input id={`${idPrefix}-opening-date`} type="date" value={value.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => onChange({ ...value, date: e.target.value })} className={inputCls} />
    </div>
  </>
);
