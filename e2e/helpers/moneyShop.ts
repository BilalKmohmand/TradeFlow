/**
 * A realistic oil & ghee dealer's books for the money / banks / vouchers specs:
 * 30 customers and 15 suppliers (codes + cities), the main bank plus HBL, UBL and MBL with opening
 * balances, and three months of bills, payments (cash and each bank), purchases and supplier payments.
 * Every party balance is exactly what its ledger lines add up to.
 *
 *   await page.addInitScript(seedMoneyShop);
 *
 * Runs in the browser (addInitScript), so it must not use anything from outside the function.
 */
export const seedMoneyShop = () => {
  if (localStorage.getItem('e2e_money_seeded')) return; // survive reloads and sign-outs
  localStorage.setItem('e2e_money_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().split('T')[0];
  const cities = ['Batkhela', 'Mardan', 'Peshawar', 'Swat', 'Charsadda', 'Timergara'];
  const custNames = ['Zaman Store', 'Bismillah Traders', 'Haji Karim & Sons', 'Madina Kiryana', 'Al Noor General Store', 'Khan Brothers', 'Sher Afzal Traders', 'Gul Mohammad Store', 'Yousaf Kiryana', 'Shinwari Traders', 'Afridi & Co', 'Swati Ghee Point', 'Mardan Oil Depot', 'Rehman Store', 'Habib Kiryana', 'Faisal Traders', 'Jan Muhammad Store', 'Sultan General Store', 'Ittefaq Traders', 'Wali Khan Store', 'Qasim Brothers', 'Taj Kiryana', 'Hamza Traders', 'Bilal Oil Mart', 'Anwar Store', 'Shah Jee Traders', 'Noor Ghee Store', 'Saleem Kiryana', 'Fazal Traders', 'Iqbal General Store'];
  const supNames = ['Dalda Foods', 'Habib Oil Mills', 'Seasons Edible Oil', 'Sufi Group', 'Kisan Ghee', 'Eva Cooking Oil', 'Meezan Ghee', 'Tullo Oil', 'Shan Ghee Mills', 'Sultan Oil', 'Pakistan Oil Refinery', 'Canola Mills', 'Punjab Ghee', 'Soya Supreme', 'Latif Oil Traders'];
  const ledger: Record<string, unknown>[] = [];
  const due: Record<string, number> = {};
  const owed: Record<string, number> = {};
  let n = 0;
  const custLine = (cid: string, d: number, debit: number, credit: number, type: string, ref: string, desc: string, extra: Record<string, unknown> = {}) => {
    due[cid] = (due[cid] || 0) + debit - credit;
    ledger.push({ id: `l-${++n}`, entityType: 'customer', entityId: cid, type, referenceId: ref, date: day(d), description: desc, debit, credit, balanceAfter: due[cid], ...extra });
  };
  const supLine = (sid: string, d: number, debit: number, credit: number, type: string, ref: string, desc: string, extra: Record<string, unknown> = {}) => {
    owed[sid] = (owed[sid] || 0) + debit - credit;
    ledger.push({ id: `l-${++n}`, entityType: 'supplier', entityId: sid, type, referenceId: ref, date: day(d), description: desc, debit, credit, balanceAfter: owed[sid], ...extra });
  };
  const banks = ['1010', '1011', '1012', '1013'];
  custNames.forEach((_, i) => {
    const cid = `c${i + 1}`;
    // Two bills per customer across three months, then a payment for most of them.
    custLine(cid, 85 - i, 40000 + i * 3500, 0, 'bill_issued', `OB-${100 + i}`, 'Old bill');
    custLine(cid, 40 - i, 25000 + i * 1250, 0, 'bill_issued', `OB-${200 + i}`, 'Bill');
    if (i % 3 !== 2) {
      const method = i % 2 ? 'Bank Transfer' : 'Cash';
      custLine(cid, 20 - (i % 15), 0, 15000 + i * 500, 'payment_received', `RCP-${300 + i}`, 'Payment received', { method, ...(method === 'Cash' ? {} : { bankCode: banks[i % 4] }) });
    }
  });
  supNames.forEach((_, i) => {
    const sid = `s${i + 1}`;
    supLine(sid, 80 - i, 120000 + i * 10000, 0, 'purchase_received', `PB-${400 + i}`, 'Stock bought');
    if (i % 2 === 0) supLine(sid, 30 - i, 0, 50000 + i * 2000, 'payment_made', `SP-${500 + i}`, 'Paid supplier', { method: i % 4 ? 'Bank Transfer' : 'Cash', ...(i % 4 ? { bankCode: banks[(i / 2) % 4] } : {}) });
  });
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Madina Oil & Ghee Traders', companyAddress: 'Main Bazar, Batkhela', companyPhone: '0932410550', cashOpeningBalance: 250000, openingBankBalance: 1500000, mainBankName: 'Meezan Bank', bankOpenings: { '1011': 800000, '1012': 350000, '1013': 200000 }, cashOpeningDate: day(120), taxRatePct: 0, cities });
  set('tradeflow_accounts_v1', [
    { id: 'acc-1011', code: '1011', name: 'HBL — 5678', type: 'asset', system: false, parent: '1010', isBank: true, bankName: 'HBL', accountNumber: '0012345678', accountTitle: 'Madina Oil & Ghee Traders' },
    { id: 'acc-1012', code: '1012', name: 'UBL — 8877', type: 'asset', system: false, parent: '1010', isBank: true, bankName: 'UBL', accountNumber: '998877' },
    { id: 'acc-1013', code: '1013', name: 'MBL — 4411', type: 'asset', system: false, parent: '1010', isBank: true, bankName: 'MBL', accountNumber: '22334411' },
  ]);
  set('tradeflow_customers_v2', custNames.map((name, i) => ({ id: `c${i + 1}`, code: `C${String(i + 1).padStart(3, '0')}`, name, company: name, phone: `0300${String(1000000 + i * 7919).slice(0, 7)}`, email: '', address: cities[i % cities.length], city: cities[i % cities.length], totalDue: due[`c${i + 1}`], creditLimit: 0, createdAt: day(120) })));
  set('tradeflow_suppliers_v2', supNames.map((company, i) => ({ id: `s${i + 1}`, code: `S${String(i + 1).padStart(3, '0')}`, name: company.split(' ')[0], company, phone: `0333${String(2000000 + i * 6007).slice(0, 7)}`, email: '', address: cities[(i + 2) % cities.length], city: cities[(i + 2) % cities.length], materialCategory: 'Oil & Ghee', totalOwed: owed[`s${i + 1}`], createdAt: day(120) })));
  set('tradeflow_products_v2', [
    { id: 'p1', code: 'DT16', name: 'Dalda 16 L Tin', category: 'Ghee', unit: 'tin', unitPricePerKg: 5200, costPricePerKg: 4800, stockKg: 400, minThresholdKg: 0 },
    { id: 'p2', code: 'HC5', name: 'Habib 5 L Can', category: 'Oil', unit: 'can', unitPricePerKg: 2100, costPricePerKg: 1900, stockKg: 300, minThresholdKg: 0 },
  ]);
  set('tradeflow_ledger_v2', ledger);
  set('tradeflow_expenses_v2', [
    { id: 'e1', date: day(10), category: 'daily', amount: 1500, description: 'Tea for staff', paidVia: 'Cash', createdAt: day(10) },
    { id: 'e2', date: day(5), category: 'rent', amount: 45000, description: 'Shop rent', paidVia: 'Bank Transfer', bankCode: '1011', createdAt: day(5) },
  ]);
  ['tradeflow_invoices_v1', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_purchase_orders_v2', 'tradeflow_cheques_v1', 'tradeflow_returns_v2', 'tradeflow_quotations_v2', 'tradeflow_journal_entries_v1', 'tradeflow_bank_statement_lines_v1', 'tradeflow_bank_reconciliations_v1'].forEach((k) => localStorage.setItem(k, '[]'));
};
