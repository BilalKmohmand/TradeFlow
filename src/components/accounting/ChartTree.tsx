import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, Notice, cardCls, inputCls, labelCls, primaryBtn, secondaryBtn } from '../billing/ui';
import { Account, drCr } from '../../utils/accounting';
import { ChartNode, chartTree, suggestSubCode } from '../../utils/vouchers';

type Flash = (r: { success: boolean; message: string }) => void;

/**
 * Chart of accounts as a tree: Assets / Liabilities / Equity / Income / Expenses. Customers sit under
 * Receivable, suppliers under Payable and the shop's banks under Bank. Every row shows its code and
 * balance; "Add" makes a sub-account under a group.
 */
export const ChartTree: React.FC<{ accounts: Account[]; balances: Map<string, { net: number }>; canPost: boolean; canRemove: boolean; flash: Flash; onOpen: (ref: string) => void; onDelete: (code: string) => void }> = ({ accounts, balances, canPost, canRemove, flash, onOpen, onDelete }) => {
  const { customers, suppliers, addAccount } = useTrading();
  const tree = useMemo(() => chartTree(accounts, balances, customers, suppliers), [accounts, balances, customers, suppliers]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(['root-asset', 'root-liability', 'root-equity', 'root-income', 'root-expense', '1010']));
  const [adding, setAdding] = useState<ChartNode | null>(null);
  const toggle = (key: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const PARTY_LIMIT = 200;

  const row = (n: ChartNode, depth: number): React.ReactNode => {
    const hasKids = n.children.length > 0;
    const isOpen = open.has(n.key);
    const custom = n.kind === 'account' && !n.system;
    const accs = n.children.filter((c) => c.kind !== 'party');
    const shown = [...accs, ...n.children.filter((c) => c.kind === 'party').slice(0, PARTY_LIMIT)];
    const hidden = n.children.length - shown.length;
    return (
      <React.Fragment key={n.key}>
        <tr className={`border-b border-[#F1F0EC] dark:border-[#1E2E40] ${n.kind === 'group' ? 'bg-[#FAF9F6] dark:bg-[#0D1520]' : ''}`} data-testid={`coa-${n.kind}-${n.code || n.key}`}><td className="p-0"><div className="flex items-center gap-1.5 pr-2 py-1.5" style={{ paddingLeft: `${8 + depth * 18}px` }}>
          {hasKids ? (
            <button type="button" onClick={() => toggle(n.key)} aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${n.name}`} className="p-1.5 rounded-lg text-[#6B7280] hover:bg-[#F4F3EF] dark:hover:bg-[#162436]">
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : <span className="w-7 shrink-0" />}
          <button type="button" disabled={n.kind === 'group'} onClick={() => n.ref && onOpen(n.ref)} className="flex-1 min-w-0 text-left py-0.5 disabled:cursor-default">
            <span className={`tabular-nums text-xs mr-2 ${n.kind === 'party' ? 'text-teal-700 dark:text-teal-300' : 'text-[#8E9299]'}`}>{n.kind === 'group' ? '' : n.code}</span>
            <span className={`${n.kind === 'group' ? 'font-bold uppercase tracking-wider text-xs' : n.kind === 'party' ? 'text-sm' : 'text-sm font-semibold'} text-[#111827] dark:text-white`}>{n.name}</span>
            {n.isBank && n.code !== '1010' && <span className="ml-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">bank</span>}
            {hasKids && !isOpen && n.kind !== 'group' && <span className="ml-1.5 text-[11px] text-[#8E9299]">({n.children.length})</span>}
          </button>
          <span className="tabular-nums whitespace-nowrap text-sm text-right font-semibold" title={hasKids && n.kind !== 'group' && n.total !== n.balance ? `Own ${drCr(n.balance)}` : undefined}>{drCr(hasKids ? n.total : n.balance)}</span>
          {canPost && n.kind !== 'party' && n.code !== '1100' && n.code !== '2000' && n.code !== '1010' && (
            <button type="button" onClick={() => setAdding(n)} aria-label={`Add sub-account under ${n.name}`} title="Add a sub-account" className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-teal-700"><Plus className="w-4 h-4" /></button>
          )}
          {canRemove && custom && !n.isBank && n.children.length === 0 && (
            <button type="button" onClick={() => onDelete(n.code)} aria-label={`Delete account ${n.code}`} className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
          )}
        </div></td></tr>
        {isOpen && shown.map((c) => row(c, depth + 1))}
        {isOpen && hidden > 0 && <tr><td className="px-4 py-2 text-[11px] text-[#8E9299]" style={{ paddingLeft: `${8 + (depth + 1) * 18}px` }}>+ {hidden} more (use the Account ledger to find one)</td></tr>}
      </React.Fragment>
    );
  };

  return (
    <>
      <div className={`${cardCls} overflow-hidden`}><table className="w-full" aria-label="Chart of accounts" data-testid="coa-tree"><tbody>{tree.map((n) => row(n, 0))}</tbody></table></div>
      {adding && <SubAccountModal parent={adding} accounts={accounts} onClose={() => setAdding(null)} onSave={(acc) => { const r = addAccount(acc); flash(r); if (r.success) { setAdding(null); setOpen((p) => new Set([...p, adding.key])); } return r; }} />}
    </>
  );
};

const SubAccountModal: React.FC<{ parent: ChartNode; accounts: Account[]; onClose: () => void; onSave: (acc: { code: string; name: string; type: Account['type']; parent?: string; description?: string }) => { success: boolean; message: string } }> = ({ parent, accounts, onClose, onSave }) => {
  const isGroup = parent.kind === 'group';
  // A top group suggests the first free code of its range (expenses: 6001…); an account, the codes after it.
  const base = isGroup ? (parent.type === 'expense' ? '6000' : `${parent.code}000`) : parent.code;
  const [code, setCode] = useState(() => suggestSubCode(base, accounts.map((a) => a.code)) || '');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal isOpen onClose={onClose} title={`Add under ${parent.name}`} subtitle={`A ${parent.type} account${isGroup ? '' : ` inside ${parent.code} ${parent.name}`}.`}>
      <form onSubmit={(e) => { e.preventDefault(); const r = onSave({ code, name, type: parent.type!, ...(isGroup ? {} : { parent: parent.code }) }); if (!r.success) setError(r.message); }} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-3 gap-3">
          <div><label className={labelCls} htmlFor="sub-code">Code</label><input id="sub-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputCls} tabular-nums`} /></div>
          <div className="col-span-2"><label className={labelCls} htmlFor="sub-name">Name</label><input id="sub-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Tea & refreshments" /></div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button type="submit" className={primaryBtn}>Add account</button>
        </div>
      </form>
    </Modal>
  );
};
