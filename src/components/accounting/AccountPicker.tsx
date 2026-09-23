import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal, inputCls } from '../billing/ui';
import { QuickSelect, PickOption } from '../billing/QuickPick';
import { CodeBox } from '../billing/CodeBox';
import { AccountOption, searchAccounts } from '../../utils/vouchers';

const GROUP_ORDER: AccountOption['group'][] = ['Customer', 'Supplier', 'Cash', 'Bank', 'Expense', 'Income', 'Asset', 'Liability', 'Equity'];
const GROUP_LABEL: Record<AccountOption['group'], string> = {
  Customer: 'Customers', Supplier: 'Suppliers', Cash: 'Cash', Bank: 'Banks', Expense: 'Expenses', Income: 'Income', Asset: 'Other assets', Liability: 'Liabilities', Equity: 'Capital / equity',
};

export const optionText = (o: AccountOption) => `${o.code ? `${o.code} • ` : ''}${o.name}${o.city ? ` (${o.city})` : ''}`;

/**
 * Pick any account: a customer, a supplier, a bank, cash, an expense, income… Type its code in the Code box
 * and press Enter, type a code or a name in the list to jump to it, or press F1 (or the search button) to
 * search by code, name or city, as in the old program.
 */
export const AccountPicker: React.FC<{
  id: string;
  value: string;
  options: AccountOption[];
  onPick: (ref: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}> = ({ id, value, options, onPick, placeholder = 'Pick an account…', className, ...rest }) => {
  const [searching, setSearching] = useState(false);
  const pickOptions: PickOption[] = useMemo(() => options.map((o) => ({ value: o.ref, name: o.name, code: o.code, extra: `${o.city || ''} ${o.group}` })), [options]);
  const groups = useMemo(() => GROUP_ORDER.map((g) => ({ g, rows: options.filter((o) => o.group === g) })).filter((x) => x.rows.length), [options]);
  const codeItems = useMemo(() => options.map((o) => ({ id: o.ref, code: o.code })), [options]);
  return (
    <div className={`flex gap-1 min-w-0 ${className || ''}`}>
      {/* The old program's code box: type 141454 or 6000 and press Enter. */}
      <CodeBox id={`${id}-code`} label={`Code for ${rest['aria-label'] || id}`} items={codeItems} value={value} onPick={onPick} className="w-[5.5rem] shrink-0" />
      <div className="flex-1 min-w-0">
        <QuickSelect
          id={id}
          value={value}
          options={pickOptions}
          onPick={onPick}
          className={inputCls}
          aria-label={rest['aria-label']}
          title="Type a code or name to find the account. F1: search."
          onKeyDown={(e) => {
            if (e.key === 'F1') {
              e.preventDefault();
              setSearching(true);
            }
          }}
        >
          <option value="">{placeholder}</option>
          {groups.map(({ g, rows }) => (
            <optgroup key={g} label={GROUP_LABEL[g]}>
              {rows.map((o) => <option key={o.ref} value={o.ref}>{optionText(o)}</option>)}
            </optgroup>
          ))}
        </QuickSelect>
      </div>
      <button type="button" onClick={() => setSearching(true)} className="shrink-0 px-2.5 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] text-[#6B7280] hover:text-teal-700" aria-label={`Search accounts for ${rest['aria-label'] || id}`} title="Search by code, name or city (F1)">
        <Search className="w-4 h-4" />
      </button>
      {searching && <AccountSearch options={options} onClose={() => setSearching(false)} onPick={(ref) => { onPick(ref); setSearching(false); }} />}
    </div>
  );
};

/** F1 search: type part of a code, a name or a city; Enter takes the first match. */
export const AccountSearch: React.FC<{ options: AccountOption[]; onPick: (ref: string) => void; onClose: () => void }> = ({ options, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const hits = useMemo(() => searchAccounts(options, q, 40), [options, q]);
  return (
    <Modal isOpen onClose={onClose} title="Find account" subtitle="Search by code, name or city.">
      <div className="space-y-3">
        <input
          autoFocus
          aria-label="Search accounts"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) {
              e.preventDefault();
              onPick(hits[0].ref);
            }
          }}
          className={inputCls}
          placeholder="e.g. 141454, Zaman, Peshawar"
        />
        <ul className="divide-y divide-[#F1F0EC] dark:divide-[#1E2E40] rounded-2xl border border-[#E5E5E1] dark:border-[#203248] max-h-80 overflow-y-auto" role="listbox" aria-label="Matching accounts">
          {hits.length === 0 && <li className="px-3 py-3 text-sm text-[#8E9299]">Nothing matches.</li>}
          {hits.map((o) => (
            <li key={o.ref}>
              <button type="button" role="option" aria-selected="false" onClick={() => onPick(o.ref)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[#FAF9F6] dark:hover:bg-[#162436]">
                <span className="min-w-0"><span className="tabular-nums text-xs text-[#8E9299] mr-2">{o.code || '—'}</span><span className="text-sm font-semibold text-[#111827] dark:text-white">{o.name}</span>{o.city && <span className="text-[11px] text-[#8E9299]"> • {o.city}</span>}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase text-[#6B7280]">{o.group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
};
