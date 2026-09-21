import React from 'react';
import { Users, Gift, BarChart3, ClipboardList, BadgePercent, HandCoins, Percent, ChevronRight } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Modal } from './ui';
import { SalesTeamModal } from './SalesTeam';
import { SchemesModal } from './Schemes';
import { SalesReportsModal } from './SalesReports';
import { ReceiveManyModal, InterestRunModal } from './SalesMoney';

export type SalesView = 'hub' | 'team' | 'schemes' | 'sales' | 'recovery' | 'commission' | 'receive_many' | 'interest';

/** One place for the sales team, schemes, recovery and commission (opened from Customers / Money / Items). */
const SalesHubModal: React.FC<{ isOpen: boolean; onClose: () => void; onView: (v: SalesView) => void }> = ({ isOpen, onClose, onView }) => {
  const { salesmen, areas, schemes, customers, can } = useTrading();
  const owing = customers.filter((c) => c.totalDue > 0).length;
  const items: { view: SalesView; label: string; hint: string; icon: React.ReactNode; show?: boolean }[] = [
    { view: 'team', label: 'Salesmen & areas', hint: `${salesmen.filter((s) => s.active).length} salesmen • ${areas.filter((a) => a.active).length} areas`, icon: <Users className="w-5 h-5" /> },
    { view: 'schemes', label: 'Schemes (free goods)', hint: `${schemes.filter((s) => s.active).length} on`, icon: <Gift className="w-5 h-5" /> },
    { view: 'sales', label: 'Sales by salesman / area', hint: 'Bills, returns and freight for any dates', icon: <BarChart3 className="w-5 h-5" />, show: can('reports:view') },
    { view: 'recovery', label: 'Recovery list', hint: `${owing} customer(s) owe money • print for the recovery man`, icon: <ClipboardList className="w-5 h-5" />, show: can('reports:view') },
    { view: 'receive_many', label: 'Receive from many', hint: 'Several customers pay at once', icon: <HandCoins className="w-5 h-5" />, show: can('finance:record_payment') },
    { view: 'commission', label: 'Commission', hint: 'What each salesman earned, and pay it', icon: <BadgePercent className="w-5 h-5" />, show: can('reports:view') },
    { view: 'interest', label: 'Charge interest', hint: 'Late-payment charge on overdue money (off unless set on a customer)', icon: <Percent className="w-5 h-5" />, show: can('finance:view_pnl') },
  ];
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sales & recovery" subtitle="Salesmen, areas, schemes, collections and commission.">
      <ul className="space-y-2" data-testid="sales-hub">
        {items.filter((i) => i.show !== false).map((i) => (
          <li key={i.view}>
            <button type="button" onClick={() => onView(i.view)} className="w-full flex items-center gap-3 rounded-2xl border border-[#E5E5E1] dark:border-[#203248] px-3 py-3 min-h-14 text-left hover:border-teal-500/50 hover:bg-[#FAF9F6] dark:hover:bg-[#162436] transition">
              <span className="w-10 h-10 rounded-2xl bg-[#F4F3EF] dark:bg-[#162436] text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">{i.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-[#111827] dark:text-white">{i.label}</span>
                <span className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8] truncate">{i.hint}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-[#9CA3AF] shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
};

/** Hosts every sales-extras dialog; `view` picks the one showing (null = none). */
export const SalesExtrasModals: React.FC<{ view: SalesView | null; onView: (v: SalesView | null) => void }> = ({ view, onView }) => {
  const close = () => onView(null);
  return (
    <>
      <SalesHubModal isOpen={view === 'hub'} onClose={close} onView={onView} />
      <SalesTeamModal isOpen={view === 'team'} onClose={close} />
      <SchemesModal isOpen={view === 'schemes'} onClose={close} />
      {(view === 'sales' || view === 'recovery' || view === 'commission') && <SalesReportsModal isOpen onClose={close} initialTab={view} />}
      <ReceiveManyModal isOpen={view === 'receive_many'} onClose={close} />
      <InterestRunModal isOpen={view === 'interest'} onClose={close} />
    </>
  );
};
