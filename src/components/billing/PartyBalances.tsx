import React, { useMemo, useState } from 'react';
import { Printer, MapPin, Plus, X } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal, Notice, cardCls, inputCls, labelCls, secondaryBtn, rs, pillCls } from './ui';
import { CsvButton } from './CsvButton';
import { PartyReportKind, allCities, partyBalanceReport, partyReportCsv, partyReportTitle } from '../../utils/vouchers';

const KINDS: { id: PartyReportKind; label: string }[] = [
  { id: 'both', label: 'Receivable and payable' },
  { id: 'receivable', label: 'Receivable only' },
  { id: 'payable', label: 'Payable only' },
];

const bal = (n: number) => `${rs(Math.abs(n))} ${n > 0 ? 'Dr' : n < 0 ? 'Cr' : ''}`.trim();

/** Receivable and payable, receivable only, payable only; any of them city-wise with subtotals. */
export const PartyBalancesView: React.FC<{ initialKind?: PartyReportKind }> = ({ initialKind = 'both' }) => {
  const { customers, suppliers, settings, setPrintRequest } = useTrading();
  const [kind, setKind] = useState<PartyReportKind>(initialKind);
  const [cityWise, setCityWise] = useState(true);
  const [city, setCity] = useState('');
  const cities = useMemo(() => allCities(settings, customers, suppliers), [settings, customers, suppliers]);
  const rep = useMemo(() => partyBalanceReport(customers, suppliers, { kind, cityWise, city }), [customers, suppliers, kind, cityWise, city]);
  const title = partyReportTitle(kind, cityWise);
  return (
    <div className={`${cardCls} overflow-hidden`} data-testid="party-balances">
      <div className="px-4 sm:px-5 py-4 border-b border-[#E5E5E1] dark:border-[#203248] space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Report">
          {KINDS.map((k) => <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} className={pillCls(kind === k.id)}>{k.label}</button>)}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold min-h-11 cursor-pointer" htmlFor="pb-citywise">
            <input id="pb-citywise" type="checkbox" checked={cityWise} onChange={(e) => setCityWise(e.target.checked)} className="w-5 h-5 accent-teal-700" /> City-wise
          </label>
          <div className="min-w-[10rem]">
            <label className={labelCls} htmlFor="pb-city">City</label>
            <select id="pb-city" value={city} onChange={(e) => setCity(e.target.value)} className={inputCls}>
              <option value="">All cities</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <span className="ml-auto flex gap-2">
            <CsvButton fileName={`${title.toLowerCase().replace(/\s+/g, '-')}.csv`} table={() => partyReportCsv(rep)} label={`Download ${title} CSV`} />
            <button type="button" onClick={() => setPrintRequest({ type: 'party_balances', kind, cityWise, ...(city ? { city } : {}) })} className={secondaryBtn} aria-label={`Print ${title}`}><Printer className="w-4 h-4" /> Print</button>
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]" aria-label={title}>
          <thead><tr className="border-b border-[#E5E5E1] dark:border-[#203248] text-left text-[10px] font-bold uppercase tracking-wider text-[#6B7280]"><th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">City</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
          <tbody>
            {rep.count === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-[#8E9299]">No balances to show.</td></tr>}
            {rep.groups.map((g) => (
              <React.Fragment key={g.city || 'all'}>
                {rep.cityWise && <tr className="bg-[#FAF9F6] dark:bg-[#0D1520]"><td colSpan={5} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"><MapPin className="w-3 h-3 inline -mt-0.5 mr-1" />{g.city}</td></tr>}
                {g.rows.map((r) => (
                  <tr key={r.ref} className="border-b border-[#F1F0EC] dark:border-[#1E2E40] text-sm" data-testid="party-balance-row">
                    <td className="px-3 py-1.5 tabular-nums text-xs text-[#8E9299]">{r.code}</td>
                    <td className="px-3 py-1.5">{r.name}<span className="ml-1.5 text-[10px] text-[#8E9299]">{r.type}</span></td>
                    <td className="px-3 py-1.5 text-xs">{r.city}</td>
                    <td className="px-3 py-1.5 text-xs tabular-nums">{r.phone}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold ${r.balance > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'}`}>{bal(r.balance)}</td>
                  </tr>
                ))}
                {rep.cityWise && (
                  <tr className="border-b border-[#E5E5E1] dark:border-[#203248] text-xs font-bold" data-testid="city-subtotal">
                    <td colSpan={4} className="px-3 py-1.5">Subtotal {g.city}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{kind !== 'payable' ? `${rs(g.receivable)} Dr` : ''}{kind === 'both' ? ' / ' : ''}{kind !== 'receivable' ? `${rs(g.payable)} Cr` : ''}</td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            {kind !== 'payable' && <tr className="font-bold border-t-2 border-[#111827] dark:border-white"><td colSpan={4} className="px-3 py-2">Grand total receivable</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" data-testid="grand-receivable">{rs(rep.receivable)} Dr</td></tr>}
            {kind !== 'receivable' && <tr className="font-bold"><td colSpan={4} className="px-3 py-2">Grand total payable</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" data-testid="grand-payable">{rs(rep.payable)} Cr</td></tr>}
          </tfoot>
        </table>
      </div>
    </div>
  );
};

/** The managed city list (free text is always allowed on the forms too). */
export const CitiesModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { cities, addCity, removeCity } = useTrading();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cities / towns" subtitle="Offered when adding a customer or supplier. You can still type any other city there.">
      <div className="space-y-3">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <form onSubmit={(e) => { e.preventDefault(); const r = addCity(name); setMsg({ kind: r.success ? 'ok' : 'error', text: r.message }); if (r.success) setName(''); }} className="flex gap-2">
          <input aria-label="New city" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Mardan" />
          <button type="submit" className={secondaryBtn}><Plus className="w-4 h-4" /> Add</button>
        </form>
        <ul className="flex flex-wrap gap-1.5">
          {cities.length === 0 && <li className="text-sm text-[#8E9299]">No cities in the list yet.</li>}
          {cities.map((c) => (
            <li key={c} className="inline-flex items-center gap-1 rounded-full border border-[#E5E5E1] dark:border-[#203248] pl-3 pr-1 py-1 text-sm">
              {c}
              <button type="button" onClick={() => setMsg({ kind: 'ok', text: removeCity(c).message })} aria-label={`Remove ${c}`} className="p-1 rounded-full text-[#9CA3AF] hover:text-rose-600"><X className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
};

/** City filter for the customer / supplier lists ("Search party by city"). */
export const CityFilter: React.FC<{ value: string; onChange: (v: string) => void; id: string }> = ({ value, onChange, id }) => {
  const { settings, customers, suppliers } = useTrading();
  const cities = useMemo(() => allCities(settings, customers, suppliers), [settings, customers, suppliers]);
  return (
    <select id={id} aria-label="Filter by city" value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} sm:!w-44`} data-testid={id}>
      <option value="">All cities</option>
      {cities.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
};
