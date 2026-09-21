import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { BILL_PRINT_SIZES, BillPrintSize } from '../../types';
import { cardCls, inputCls, labelCls, secondaryBtn } from './ui';

/**
 * Shop settings for bills: paper size (A4 / A5 / 80 mm thermal), footer / terms text, whether the
 * previous balance is printed, and whether bills may take stock below zero. Toggles save at once.
 */
export const BillSettingsCard: React.FC = () => {
  const { settings, updateSettings, can } = useTrading();
  const canEdit = can('system:company_settings') || can('admin_screen');
  const [footer, setFooter] = useState(settings.billFooter || '');
  const [saved, setSaved] = useState(false);
  const toggle = (key: 'showPrevBalanceOnBill' | 'allowNegativeStock', label: string, help: string, id: string) => (
    <label htmlFor={id} className="flex items-start gap-3 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] px-3.5 py-3 cursor-pointer">
      <input id={id} type="checkbox" disabled={!canEdit} checked={Boolean(settings[key])} onChange={(e) => updateSettings({ [key]: e.target.checked })} className="mt-0.5 w-5 h-5 shrink-0 accent-teal-700" />
      <span>
        <span className="block text-sm font-semibold text-[#111827] dark:text-white">{label}</span>
        <span className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8]">{help}</span>
      </span>
    </label>
  );
  return (
    <div className={`${cardCls} p-5 space-y-4`} data-testid="bill-settings">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-900"><Printer className="w-5 h-5" /></div>
        <div>
          <h3 className="text-base font-bold text-[#111827] dark:text-white">Bills &amp; stock</h3>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Paper size, footer text and stock rules for every bill.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="bill-print-size">Print bills and receipts on</label>
          <select id="bill-print-size" disabled={!canEdit} value={settings.billPrintSize || 'a4'} onChange={(e) => updateSettings({ billPrintSize: e.target.value as BillPrintSize })} className={inputCls}>
            {BILL_PRINT_SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-[#8E9299]">Thermal prints a narrow one-column receipt. In the print dialog pick the same paper.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="bill-footer">Footer / terms on bills</label>
          <textarea id="bill-footer" rows={3} disabled={!canEdit} value={footer} onChange={(e) => setFooter(e.target.value)} className={inputCls} placeholder="e.g. Goods once sold will not be taken back. Cheques subject to clearing." />
          <button type="button" disabled={!canEdit || footer === (settings.billFooter || '')} onClick={() => { updateSettings({ billFooter: footer.trim() }); setSaved(true); setTimeout(() => setSaved(false), 1500); }} className={`${secondaryBtn} mt-2`}>{saved ? 'Saved' : 'Save footer'}</button>
        </div>
        {toggle('showPrevBalanceOnBill', 'Show previous balance on bill', 'Prints what the customer owed before this bill and the total balance with it.', 'bill-prev-balance')}
        {toggle('allowNegativeStock', 'Allow bills when stock is short', 'Off: a bill that needs more than you have is refused. On: it saves with a warning and the stock goes below zero (shown in red).', 'bill-allow-negative')}
      </div>
    </div>
  );
};
