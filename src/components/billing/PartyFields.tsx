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
