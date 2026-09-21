import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { ChequeFieldPos, ChequeLayout } from '../../types';
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from '../billing/ui';
import { DEFAULT_CHEQUE_LAYOUT, chequeLayoutOf } from '../../utils/chequePrint';
import { todayISO } from '../../utils/stockFlow';
import { ChequeLeaf } from './FinancePrint';

type PosKey = 'date' | 'payee' | 'words' | 'figures';
const FIELDS: { key: PosKey; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'payee', label: 'Pay (name)' },
  { key: 'words', label: 'Rupees (in words)' },
  { key: 'figures', label: 'Amount box (figures)' },
];

/**
 * Where each field prints on the shop's cheque leaf, in mm from the top-left corner. Print a test on
 * a spare leaf (or plain paper held over one) and nudge the numbers until it lines up.
 */
export const ChequeLayoutModal: React.FC<{ onClose: () => void; onSaved: (msg: string) => void }> = ({ onClose, onSaved }) => {
  const { settings, updateSettings } = useTrading();
  const [l, setL] = useState<ChequeLayout>(() => chequeLayoutOf(settings));
  const n = (v: string) => Math.round((parseFloat(v) || 0) * 10) / 10;
  const setPos = (key: PosKey, axis: keyof ChequeFieldPos, v: string) => setL((p) => ({ ...p, [key]: { ...p[key], [axis]: n(v) } }));
  const field = (id: string, label: string, value: number, on: (v: string) => void) => (
    <div className="min-w-0"><label className={labelCls} htmlFor={id}>{label}</label><input id={id} type="number" inputMode="decimal" step="0.5" value={value} onChange={(e) => on(e.target.value)} className={`${inputCls} tabular-nums`} /></div>
  );
  return (
    <Modal isOpen onClose={onClose} title="Cheque layout" subtitle="Positions in mm from the top-left corner of your bank's cheque leaf." wide
      footer={<div className="flex flex-wrap justify-between gap-2"><button type="button" onClick={() => setL(DEFAULT_CHEQUE_LAYOUT)} className={secondaryBtn}><RotateCcw className="w-4 h-4" /> Default</button><div className="flex gap-2"><button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button><button type="button" onClick={() => { updateSettings({ chequeLayout: l }); onSaved('Cheque layout saved.'); onClose(); }} className={primaryBtn}>Save layout</button></div></div>}>
      <div className="space-y-4">
        <div className="overflow-x-auto rounded-2xl border border-[#E5E5E1] dark:border-[#203248] p-2 bg-[#FAF9F6] dark:bg-[#0D1520]">
          <ChequeLeaf cheque={{ partyName: 'Dalda Foods (Pvt) Ltd', amount: 125000, chequeDate: todayISO() }} layout={l} outline />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {field('cl-w', 'Leaf width', l.widthMm, (v) => setL({ ...l, widthMm: n(v) }))}
          {field('cl-h', 'Leaf height', l.heightMm, (v) => setL({ ...l, heightMm: n(v) }))}
          {field('cl-font', 'Text size (pt)', l.fontSizePt, (v) => setL({ ...l, fontSizePt: n(v) }))}
        </div>
        {FIELDS.map((f) => (
          <div key={f.key} className="grid grid-cols-3 gap-3 items-end">
            <div className="text-sm font-semibold pb-3">{f.label}</div>
            {field(`cl-${f.key}-x`, 'From left', l[f.key].x, (v) => setPos(f.key, 'x', v))}
            {field(`cl-${f.key}-y`, 'From top', l[f.key].y, (v) => setPos(f.key, 'y', v))}
          </div>
        ))}
        <div className="grid grid-cols-3 gap-3 items-end">
          {field('cl-words-w', 'Words line width', l.wordsWidthMm, (v) => setL({ ...l, wordsWidthMm: n(v) }))}
          {field('cl-gap', 'Date box width (0 = no boxes)', l.dateDigitGapMm, (v) => setL({ ...l, dateDigitGapMm: n(v) }))}
          <label className="flex items-center gap-2 text-sm font-semibold pb-3"><input type="checkbox" checked={l.acPayee} onChange={(e) => setL({ ...l, acPayee: e.target.checked })} className="w-4 h-4" /> A/C Payee only</label>
        </div>
      </div>
    </Modal>
  );
};
