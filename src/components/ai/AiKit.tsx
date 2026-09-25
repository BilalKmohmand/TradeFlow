import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import type { AiResultFor, AiTask } from '../../../api/ai';
import { AI_NOT_SET_UP, AiFailureKind, callAi } from '../../ai/client';
import { Notice, secondaryBtn } from '../billing/ui';
import { useTrading } from '../../context/TradingContext';
import { ownerSnapshot } from '../../utils/control';
import { todayISO } from '../../utils/stockFlow';
import type { AiFinanceFigures, AiShopData } from '../../ai/context';

export type AiCallState = { status: 'idle' | 'loading' | 'error' | 'not_setup'; message?: string };

/** One AI request at a time per dialog, with Cancel; a newer request or closing the dialog cancels the older one. */
export const useAiCall = <T extends AiTask>(task: T) => {
  const [state, setState] = useState<AiCallState>({ status: 'idle' });
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);
  const run = async (payload: Record<string, unknown>): Promise<AiResultFor<T> | null> => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ status: 'loading' });
    const r = await callAi(task, payload, { signal: c.signal });
    if (ctrl.current !== c) return null; // cancelled or replaced
    ctrl.current = null;
    if (r.ok) {
      setState({ status: 'idle' });
      return r.result;
    }
    const f = r as { ok: false; kind: AiFailureKind; message: string };
    if (f.kind === 'cancelled') setState({ status: 'idle' });
    else setState({ status: f.kind === 'not_setup' ? 'not_setup' : 'error', message: f.message });
    return null;
  };
  const cancel = () => {
    ctrl.current?.abort();
    ctrl.current = null;
    setState({ status: 'idle' });
  };
  const fail = (message: string) => setState({ status: 'error', message });
  return { state, run, cancel, fail, loading: state.status === 'loading' };
};

/** Loading (with Cancel), "AI not set up", or the error. */
export const AiStatus: React.FC<{ state: AiCallState; onCancel: () => void; loadingText?: string }> = ({ state, onCancel, loadingText }) => {
  if (state.status === 'loading')
    return (
      <div role="status" data-testid="ai-loading" className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/40 px-3.5 py-2.5 text-sm text-violet-900 dark:text-violet-200">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">{loadingText || 'Thinking…'} <span className="text-xs opacity-80">This can take up to a minute.</span></span>
        <button type="button" onClick={onCancel} className={`${secondaryBtn} !py-1.5`}><X className="w-4 h-4" /> Cancel</button>
      </div>
    );
  if (state.status === 'not_setup')
    return (
      <div role="status" data-testid="ai-not-setup" className="rounded-2xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-3 text-sm text-amber-900 dark:text-amber-200 space-y-1">
        <p className="font-bold flex items-center gap-2"><Sparkles className="w-4 h-4" aria-hidden="true" /> {AI_NOT_SET_UP}</p>
        <p className="text-xs">The owner adds ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploys. Everything else in the app works as usual.</p>
      </div>
    );
  if (state.status === 'error') return <div data-testid="ai-error"><Notice kind="error">{state.message}</Notice></div>;
  return null;
};

/** A small note under AI dialogs: what is sent, and that nothing is saved by the AI. */
export const AiPrivacyNote: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
    {children} Shop data needed for this is sent to Anthropic (Claude) to answer. AI can make mistakes: check before you rely on it.
  </p>
);

/** The shop's records for the AI context builders, and money / profit figures for users allowed to see them. */
export const useAiShopData = () => {
  const t = useTrading();
  const canFinance = t.can('view_finance') || t.can('finance:view_pnl');
  const data: AiShopData = useMemo(
    () => ({ settings: t.settings, customers: t.customers, suppliers: t.suppliers, products: t.products, invoices: t.invoices, ledger: t.ledger, cheques: t.cheques, returns: t.returns, purchases: t.purchases }),
    [t.settings, t.customers, t.suppliers, t.products, t.invoices, t.ledger, t.cheques, t.returns, t.purchases]
  );
  const finance = (): AiFinanceFigures | undefined => {
    if (!canFinance) return undefined;
    try {
      const snap = ownerSnapshot(
        {
          invoices: t.invoices, ledger: t.ledger, expenses: t.expenses, cashEntries: t.cashEntries, customers: t.customers, suppliers: t.suppliers, products: t.products, purchases: t.purchases, returns: t.returns, cheques: t.cheques, settings: t.settings,
          valuation: { settings: t.settings, ledger: t.ledger, expenses: t.expenses, cashEntries: t.cashEntries, products: t.products, purchases: t.purchases, invoices: t.invoices, returns: t.returns, adjustments: t.adjustments, dispatches: t.dispatches },
        },
        todayISO()
      );
      return { cash: snap.cash, bank: snap.bank, profitToday: snap.profitToday, profitMonth: snap.profitMonth };
    } catch {
      return undefined;
    }
  };
  return { data, canFinance, finance, today: todayISO() };
};
