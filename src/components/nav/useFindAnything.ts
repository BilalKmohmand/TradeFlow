import { useMemo } from 'react';
import { useTrading } from '../../context/TradingContext';
import { useBillingUI } from '../billing/BillingUI';
import { useStockUI } from '../billing/StockUI';
import { formatCurrency } from '../../utils/formatters';
import { NavEntry, navEntry, navGroup, normalize, searchNav, entryAllowed } from '../../utils/navMap';
import { useNavAccess, useNavGo } from './useNavGo';

export type FindKind = 'option' | 'customer' | 'supplier' | 'item' | 'bill' | 'purchase' | 'voucher';

export interface FindItem {
  id: string;
  kind: FindKind;
  title: string;
  subtitle?: string;
  badge?: string;
  /** Keyboard key (F2…) of an option. */
  keyHint?: string;
  run: () => void;
}
export interface FindSection {
  id: string;
  label: string;
  items: FindItem[];
}

/** What "Find anything" shows before anything is typed: the everyday actions (old function keys first). */
const QUICK: { entry: string; title: string }[] = [
  { entry: 'new-bill', title: 'New bill' },
  { entry: 'receive', title: 'Receive payment' },
  { entry: 'add-expense', title: 'Add expense' },
  { entry: 'receive-stock', title: 'Receive stock' },
  { entry: 'acc-cash-book', title: 'Cash Book' },
  { entry: 'new-purchase-invoice', title: 'Purchase Invoice' },
  { entry: 'pay-supplier', title: 'Pay a supplier' },
  { entry: 'aging-customers', title: 'Who owes for how long' },
  { entry: 'all-reports', title: 'Reports' },
];

const PER_KIND = 6;

/**
 * One search over the whole app: the menu options (nav map: labels, old names, Urdu / Roman-Urdu words, hints)
 * and the shop's data — customers, suppliers, items, bills (number / memo), purchase invoices and vouchers
 * (number). Used by the Ctrl+K / "/" dialog and the phone More sheet.
 */
export const useFindAnything = (query: string): FindSection[] => {
  const { customers, suppliers, products, invoices, purchaseInvoices, vouchers, can, setSelectedCustomerId, setSelectedSupplierId, setActiveScreen } = useTrading();
  const ui = useBillingUI();
  const stock = useStockUI();
  const go = useNavGo();
  const access = useNavAccess();

  return useMemo(() => {
    const option = (e: NavEntry, title = e.label): FindItem => ({
      id: `opt-${e.id}`,
      kind: 'option',
      title,
      subtitle: `${navGroup(e.group).label} › ${e.section}${e.sub ? ` › ${e.sub}` : ''} · ${e.hint}`,
      keyHint: e.key,
      run: () => go(e.target),
    });
    const q = query.trim();
    if (!q) {
      const quick = QUICK.map((x) => ({ x, e: navEntry(x.entry) })).filter((y): y is { x: (typeof QUICK)[number]; e: NavEntry } => Boolean(y.e) && entryAllowed(y.e!, access));
      return [{ id: 'quick', label: 'Quick actions', items: quick.map(({ x, e }) => option(e, x.title)) }];
    }
    const sections: FindSection[] = [];
    const options = searchNav(q, access, 10).map((e) => option(e));
    if (options.length) sections.push({ id: 'options', label: 'Menu options', items: options });

    const nq = normalize(q);
    const has = (...fields: (string | undefined | null)[]) => fields.some((f) => f && normalize(f).includes(nq));
    const low = q.toLowerCase();
    const exactNo = (n?: string) => Boolean(n) && n!.toLowerCase() === low;

    const cust = customers.filter((c) => has(c.name, c.company, c.code, c.phone, c.city)).slice(0, PER_KIND);
    if (cust.length)
      sections.push({
        id: 'customers',
        label: 'Customers',
        items: cust.map((c) => ({ id: `customer-${c.id}`, kind: 'customer', title: c.name, subtitle: `Customer${c.code ? ` ${c.code}` : ''} • ${c.phone || 'no phone'}${c.city ? ` • ${c.city}` : ''}`, badge: c.totalDue > 0 ? `Owes ${formatCurrency(c.totalDue)}` : 'Clear', run: () => { setSelectedCustomerId(c.id); setActiveScreen('customers'); } })),
      });
    const sup = suppliers.filter((s) => has(s.company, s.name, s.code, s.phone, s.city)).slice(0, PER_KIND);
    if (sup.length)
      sections.push({
        id: 'suppliers',
        label: 'Suppliers',
        items: sup.map((s) => ({ id: `supplier-${s.id}`, kind: 'supplier', title: s.company || s.name, subtitle: `Supplier${s.code ? ` ${s.code}` : ''} • ${s.phone || 'no phone'}`, badge: s.totalOwed > 0 ? `You owe ${formatCurrency(s.totalOwed)}` : 'Clear', run: () => { setSelectedSupplierId(s.id); setActiveScreen('suppliers'); } })),
      });
    const items = products.filter((p) => has(p.name, p.code, p.barcode, p.category, p.brand)).slice(0, PER_KIND);
    if (items.length)
      sections.push({
        id: 'items',
        label: 'Items',
        items: items.map((p) => ({ id: `product-${p.id}`, kind: 'item', title: p.name, subtitle: `Item${p.code ? ` ${p.code}` : ''} • ${formatCurrency(p.unitPricePerKg)} per ${p.unit || 'pcs'} • stock history`, badge: `Stock ${p.stockKg.toLocaleString()} ${p.unit || 'pcs'}`, run: () => stock.itemHistory(p.id) })),
      });
    const bills = invoices
      .filter((i) => has(i.invoiceNumber, i.memoNo) || (q.length >= 3 && has(i.customerName)))
      .sort((a, b) => Number(exactNo(b.invoiceNumber)) - Number(exactNo(a.invoiceNumber)) || (a.issueDate < b.issueDate ? 1 : -1))
      .slice(0, PER_KIND);
    if (bills.length)
      sections.push({
        id: 'bills',
        label: 'Bills',
        items: bills.map((i) => ({ id: `bill-${i.id}`, kind: 'bill', title: `${i.invoiceNumber} • ${i.customerName}`, subtitle: `Bill • ${i.issueDate}${i.memoNo ? ` • memo ${i.memoNo}` : ''}`, badge: i.balanceDue > 0 ? `${formatCurrency(i.balanceDue)} due` : 'Paid', run: () => ui.openBill(i.id) })),
      });
    if (can('products:create') || can('stock:adjust') || can('suppliers:view')) {
      const pinv = (purchaseInvoices || []).filter((p) => has(p.invoiceNumber, p.memoNo)).slice(0, PER_KIND);
      if (pinv.length)
        sections.push({
          id: 'purchases',
          label: 'Purchase invoices',
          items: pinv.map((p) => ({ id: `pinv-${p.id}`, kind: 'purchase', title: `${p.invoiceNumber} • ${p.supplierName}`, subtitle: `Purchase invoice • ${p.date}${p.memoNo ? ` • bill no. ${p.memoNo}` : ''}`, badge: formatCurrency(p.totalAmount), run: () => ui.openPurchaseInvoice(p.id) })),
        });
    }
    if (can('view_finance')) {
      const vs = (vouchers || []).filter((v) => has(v.ref)).slice(0, PER_KIND);
      if (vs.length)
        sections.push({
          id: 'vouchers',
          label: 'Vouchers',
          items: vs.map((v) => ({ id: `voucher-${v.id}`, kind: 'voucher', title: `${v.ref} • ${v.memo || v.voucherType || 'Voucher'}`, subtitle: `Voucher • ${v.date}`, badge: formatCurrency(v.lines.reduce((a, l) => a + (Number(l.debit) || 0), 0)), run: () => { ui.openAccountsTab('vouchers', `view:${v.id}`); setActiveScreen('accounts'); } })),
        });
    }
    return sections;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, customers, suppliers, products, invoices, purchaseInvoices, vouchers, access]);
};
