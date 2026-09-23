import React, { useMemo } from 'react';
import { CodeBox } from './CodeBox';
import { QuickSelect, PickOption } from './QuickPick';
import { inputCls, labelCls, rs } from './ui';

export interface PickParty {
  id: string;
  code?: string;
  name: string;
  city?: string;
  phone?: string;
  /** What they owe (customer) / what you owe them (supplier); shown next to the name when above zero. */
  balance?: number;
}

/**
 * Pick a customer or supplier the way the old program did: type the code in the small Code box and press
 * Enter (or Tab), or type a name, code, city or phone in the list. The list shows "code • name (city)".
 */
export const PartyPick: React.FC<{
  id: string;
  label: string;
  parties: PickParty[];
  value: string;
  onPick: (id: string) => void;
  placeholder: string;
  /** Wording for the balance in the list, e.g. "owes" or "you owe". */
  balanceWord?: string;
  hint?: React.ReactNode;
  className?: string;
}> = ({ id, label, parties, value, onPick, placeholder, balanceWord = 'owes', hint, className = '' }) => {
  const options: PickOption[] = useMemo(() => parties.map((p) => ({ value: p.id, name: p.name, code: p.code, extra: `${p.city || ''} ${p.phone || ''}` })), [parties]);
  return (
    <div className={className}>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <CodeBox id={`${id}-code`} label="Code" items={parties} value={value} onPick={onPick} className="w-24 sm:w-28 shrink-0" />
        <div className="flex-1 min-w-0">
          <QuickSelect id={id} value={value} options={options} onPick={onPick} className={inputCls} title="Type a name, code or city to find it">
            <option value="">{placeholder}</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code ? `${p.code} • ` : ''}{p.name}{p.city ? ` (${p.city})` : ''}{(p.balance || 0) > 0.005 ? ` — ${balanceWord} ${rs(p.balance || 0)}` : ''}
              </option>
            ))}
          </QuickSelect>
        </div>
      </div>
      {hint}
    </div>
  );
};

/** Customers as picker rows, the biggest balance first. */
export const customerParties = (customers: { id: string; code?: string; name: string; city?: string; phone?: string; totalDue: number }[]): PickParty[] =>
  [...customers].sort((a, b) => b.totalDue - a.totalDue || a.name.localeCompare(b.name)).map((c) => ({ id: c.id, code: c.code, name: c.name, city: c.city, phone: c.phone, balance: c.totalDue }));

/** Suppliers as picker rows (company name), the biggest balance first. */
export const supplierParties = (suppliers: { id: string; code?: string; name: string; company?: string; city?: string; phone?: string; totalOwed: number }[]): PickParty[] =>
  [...suppliers].sort((a, b) => b.totalOwed - a.totalOwed || (a.company || a.name).localeCompare(b.company || b.name)).map((s) => ({ id: s.id, code: s.code, name: s.company || s.name, city: s.city, phone: s.phone, balance: s.totalOwed }));
