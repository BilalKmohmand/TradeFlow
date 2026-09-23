import React, { useState } from 'react';
import { Printer, Truck } from 'lucide-react';
import { useTrading } from '../../../context/TradingContext';
import { Modal, Notice, inputCls, labelCls, primaryBtn, secondaryBtn, rs, bidi } from '../ui';
import { todayISO } from '../../../utils/stockFlow';
import { formatDate } from '../../../utils/formatters';

/**
 * Delivery order → delivered: the date, who delivered and the vehicle. Saving can print the delivery
 * challan at once (the same challan as Bill → Delivery challan, filled with the driver and vehicle).
 */
export const MarkDeliveredModal: React.FC<{ invoiceId: string | null; onClose: () => void }> = ({ invoiceId, onClose }) => {
  const { invoices, markBillDelivered, setPrintRequest } = useTrading();
  const inv = invoices.find((i) => i.id === invoiceId) || null;
  const [date, setDate] = useState(todayISO());
  const [by, setBy] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const save = (print: boolean) => {
    if (!inv) return;
    const r = markBillDelivered(inv.id, { date, by, vehicle, note });
    if (!r.success) return setError(r.message);
    onClose();
    if (print) setPrintRequest({ type: 'bill_challan', invoiceId: inv.id, driver: by.trim() || undefined, vehicle: vehicle.trim().toUpperCase() || undefined });
  };

  return (
    <Modal
      isOpen={Boolean(inv)}
      onClose={onClose}
      title={inv ? `Mark delivered: ${inv.invoiceNumber}` : 'Mark delivered'}
      subtitle={inv ? `${bidi(inv.customerName)} • bill of ${formatDate(inv.issueDate)} • ${rs(inv.totalAmount)}` : undefined}
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button type="button" onClick={() => save(false)} className={secondaryBtn}><Truck className="w-4 h-4 text-indigo-600" /> Mark delivered</button>
          <button type="button" onClick={() => save(true)} className={primaryBtn}><Printer className="w-4 h-4 text-teal-400 dark:text-teal-700" /> Delivered &amp; print challan</button>
        </div>
      }
    >
      {inv && (
        <div className="space-y-3" data-testid="mark-delivered">
          {error && <Notice kind="error">{error}</Notice>}
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{inv.items.map((it) => `${it.productName} × ${it.qty ?? it.kg} ${it.unit || ''}`.trim()).join(', ')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="dlv-date">Delivered on</label>
              <input id="dlv-date" type="date" value={date} min={inv.issueDate} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="dlv-by">Delivered by</label>
              <input id="dlv-by" value={by} onChange={(e) => setBy(e.target.value)} className={inputCls} placeholder="e.g. Rashid (driver)" />
            </div>
            <div>
              <label className={labelCls} htmlFor="dlv-vehicle">Vehicle no.</label>
              <input id="dlv-vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className={inputCls} placeholder="e.g. LES-1234" />
            </div>
            <div>
              <label className={labelCls} htmlFor="dlv-note">Note (optional)</label>
              <input id="dlv-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="e.g. received by Haji sahib" />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
