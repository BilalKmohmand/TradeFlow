/**
 * A realistic, BIG shop for look-and-feel and search tests: 40 customers and 15 suppliers with codes,
 * Urdu and very long names and cities; 30 items (many sold by the carton); 60 bills; 12 purchase invoices;
 * 3 extra bank accounts; vouchers and cheques.
 *
 *   await page.addInitScript(bigShop);           // before signIn(page)
 *   await page.addInitScript(bigShop, { dark: true }); // …with the dark theme
 *
 * Self-contained (it runs in the browser): no imports, no closures over module scope.
 * Seeds only once per browser context, so reloads keep what a test changed.
 */
export const bigShop = (opts?: { dark?: boolean }) => {
  if (localStorage.getItem('e2e_big_shop')) return;
  localStorage.setItem('e2e_big_shop', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const iso = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  localStorage.setItem('tradeflow_theme_mode_v1', opts?.dark ? 'dark' : 'light');
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Madina Oil & Ghee Traders Batkhela (Pvt.) Ltd.', companyAddress: 'Main Bazar, Batkhela, Malakand', cashOpeningBalance: 250000, openingBankBalance: 1200000, mainBankName: 'Meezan Bank', cashOpeningDate: '2026-01-01', taxRatePct: 0 });

  const cities = ['Batkhela', 'Mingora', 'Thana', 'Dargai', 'Timergara', 'Chakdara', 'Peshawar', 'Mardan', 'بٹ خیلہ', 'Khwazakhela'];
  const custNames = [
    'Zaman and Co BTK', 'Haji Karim Kiryana Store', 'Shah Jee Kiryana', 'محمد اسلم کریانہ سٹور', 'Al-Madina General Store & Wholesale Dealers Malakand Division',
    'Bismillah Traders', 'Gul Khan & Sons', 'حاجی نور محمد اینڈ سنز', 'New Khyber Ghee Centre', 'Afridi Brothers',
    'Swat Valley Super Mart', 'Rehman Kiryana', 'Sher Ali Oil Depot', 'عبدالرحمن ٹریڈرز', 'Usman Ghani Store',
    'Pak Oil Traders', 'Faisal General Store', 'Hamza Wholesale', 'Bacha Khan Market Shop 12', 'Yousafzai Traders',
    'Noor Ghee Store', 'Ittefaq Kiryana', 'Madni Traders', 'Iqbal Brothers', 'Waheed Store',
    'Sultan Mahmood & Co', 'Zam Zam Oil', 'Saeed Kiryana', 'Mustafa Mart', 'Qadri Store',
    'Hayat Traders', 'Nisar General', 'Babar Oil Depot', 'Anwar Kiryana', 'Junaid Store',
    'Kaka Jee Traders', 'Amin Brothers', 'Taj Store', 'Raheem Kiryana', 'Zia General Store',
  ];
  const customers = custNames.map((name, i) => ({
    id: `c${i + 1}`,
    code: `C-${String(i + 1).padStart(4, '0')}`,
    name,
    company: i % 3 === 0 ? `${name.split(' ')[0]} Shop` : name,
    phone: `0300 ${String(1000000 + i * 12345).slice(0, 7)}`,
    email: '',
    address: `Shop ${i + 1}, ${cities[i % cities.length]}`,
    city: cities[i % cities.length],
    totalDue: 0,
    creditLimit: i % 4 === 0 ? 500000 : 0,
    createdAt: '2026-01-01',
  }));
  const supNames = ['Dalda Foods (Pvt) Ltd', 'Habib Oil Mills', 'Seasons Edible Oil', 'Eva Cooking Oil', 'Sufi Group of Industries', 'کسان گھی ملز', 'Shan Foods', 'Mezan Oil Industries', 'Kashmir Banaspati', 'Tullo Industries', 'Punjab Oil Mills Limited Lahore Head Office', 'Latif Ghee', 'Hilal Foods', 'National Foods', 'Soya Supreme'];
  const suppliers = supNames.map((company, i) => ({
    id: `s${i + 1}`,
    code: `S-${String(i + 1).padStart(4, '0')}`,
    name: `Rep ${i + 1}`,
    company,
    phone: `0321 ${String(7000000 + i * 4321).slice(0, 7)}`,
    email: '',
    materialCategory: 'Oil & Ghee',
    address: 'Karachi',
    city: i % 2 ? 'Karachi' : 'Lahore',
    totalOwed: 0,
    createdAt: '2026-01-01',
  }));
  const items: [string, string, string, number, number, string?, number?][] = [
    ['Dalda Banaspati 16 L Tin', 'Ghee', 'Dalda', 7250, 6800, 'carton', 1],
    ['Dalda Cooking Oil 5 L Can', 'Oil', 'Dalda', 2650, 2450, 'carton', 4],
    ['Dalda Cooking Oil 1 L Pouch', 'Oil', 'Dalda', 560, 510, 'carton', 12],
    ['Habib Banaspati 16 kg Tin', 'Ghee', 'Habib', 7100, 6700, 'carton', 1],
    ['Habib Cooking Oil 5 L', 'Oil', 'Habib', 2600, 2400, 'carton', 4],
    ['Habib Cooking Oil 1 L Pouch', 'Oil', 'Habib', 545, 500, 'carton', 12],
    ['Seasons Canola Oil 5 L', 'Oil', 'Seasons', 2900, 2700, 'carton', 4],
    ['Seasons Canola 1 L Bottle', 'Oil', 'Seasons', 610, 560, 'carton', 12],
    ['Eva Cooking Oil 3 L', 'Oil', 'Eva', 1700, 1560, 'carton', 6],
    ['Eva Banaspati 1 kg', 'Ghee', 'Eva', 540, 495, 'carton', 12],
    ['Sufi Cooking Oil 10 L Tin', 'Oil', 'Sufi', 5300, 5000, 'carton', 2],
    ['Sufi Canola 5 L', 'Oil', 'Sufi', 2800, 2600, 'carton', 4],
    ['کسان گھی 16 کلو', 'Ghee', 'Kisan', 6900, 6500, 'carton', 1],
    ['Mezan Banaspati 5 kg', 'Ghee', 'Mezan', 2500, 2300, 'carton', 4],
    ['Mezan Cooking Oil 1 L', 'Oil', 'Mezan', 530, 490, 'carton', 12],
    ['Kashmir Banaspati 2.5 kg Tin', 'Ghee', 'Kashmir', 1300, 1200, 'carton', 6],
    ['Tullo Pure Desi Ghee 1 kg', 'Ghee', 'Tullo', 2400, 2200, 'carton', 12],
    ['Latif Ghee 16 L', 'Ghee', 'Latif', 6800, 6400],
    ['Hilal Cooking Oil 5 L', 'Oil', 'Hilal', 2550, 2350, 'carton', 4],
    ['Soya Supreme 5 L', 'Oil', 'Soya Supreme', 2750, 2550, 'carton', 4],
    ['Soya Supreme 1 L', 'Oil', 'Soya Supreme', 575, 530, 'carton', 12],
    ['Salt 800 g', 'General', 'Shan', 60, 45, 'carton', 24],
    ['Sugar 1 kg', 'General', '', 150, 135],
    ['Shan Biryani Masala', 'General', 'Shan', 120, 100, 'box', 12],
    ['National Ketchup 800 g', 'General', 'National', 380, 330, 'carton', 12],
    ['Rice Basmati 5 kg', 'General', '', 2100, 1900],
    ['Olive Oil Extra Virgin Imported Premium Quality 500 ml Glass Bottle', 'Oil', 'Imported', 1850, 1600, 'carton', 12],
    ['Mustard Oil 1 L', 'Oil', '', 700, 620, 'carton', 12],
    ['Coconut Oil 200 ml', 'Oil', '', 320, 270, 'carton', 24],
    ['Ghee Tin Empty (return)', 'General', '', 350, 300],
  ];
  const products = items.map(([name, category, brand, price, cost, packName, packSize], i) => ({
    id: `p${i + 1}`,
    code: String(101 + i),
    barcode: `89600${String(10000 + i)}`,
    name,
    category,
    brand,
    unit: /Tin|16/.test(name) ? 'tin' : /Pouch|Bottle|1 L|ml/.test(name) ? 'pcs' : 'can',
    packName,
    packSize,
    unitPricePerKg: price,
    costPricePerKg: cost,
    stockKg: 40 + ((i * 37) % 900),
    minThresholdKg: 20,
    supplierId: `s${(i % 15) + 1}`,
  }));
  set('tradeflow_products_v2', products);
  set('tradeflow_godowns_v1', [
    { id: 'g-main', name: 'Main shop', isDefault: true, createdAt: '2026-01-01' },
    { id: 'g-back', name: 'Back godown (Mingora road)', isDefault: false, createdAt: '2026-01-01' },
  ]);

  const bills: any[] = [];
  const ledger: any[] = [];
  for (let n = 1; n <= 60; n++) {
    const c = customers[(n * 7) % customers.length];
    const lines = [0, 1, 2].slice(0, 1 + (n % 3)).map((k) => {
      const p = products[(n + k * 5) % products.length];
      const qty = 1 + ((n * (k + 3)) % 48);
      return { id: `b${n}-${k}`, productId: p.id, productName: p.name, kg: qty, ratePerKg: p.unitPricePerKg, amount: qty * p.unitPricePerKg, qty, unitPrice: p.unitPricePerKg, unit: p.unit };
    });
    const total = lines.reduce((a, x) => a + x.amount, 0);
    const paid = n % 4 === 0 ? total : 0;
    const days = 60 - n;
    bills.push({ id: `inv-${n}`, invoiceNumber: `INV-${n}`, memoNo: `M-${500 + n}`, customerId: c.id, customerName: c.name, customerPhone: c.phone, issueDate: iso(days), dueDate: iso(days), status: 'issued', paymentStatus: paid ? 'paid' : 'unpaid', items: lines, subtotal: total, taxRatePct: 0, taxAmount: 0, totalAmount: total, paidAmount: paid, balanceDue: total - paid, createdAt: iso(days), billKind: paid ? 'cash' : 'credit', paymentMethod: paid ? 'Cash' : 'Credit' });
    ledger.push({ id: `lb${n}`, entityType: 'customer', entityId: c.id, type: 'bill_issued', referenceId: `INV-${n}`, sourceId: `inv-${n}`, date: iso(days), description: `Bill INV-${n}`, debit: total, credit: 0, balanceAfter: 0 });
    if (paid) ledger.push({ id: `lp${n}`, entityType: 'customer', entityId: c.id, type: 'payment_received', referenceId: `INV-${n}`, sourceId: `inv-${n}`, date: iso(days), description: `Cash for INV-${n}`, debit: 0, credit: paid, balanceAfter: 0, method: 'Cash' });
    else (c as any).totalDue += total;
  }
  set('tradeflow_invoices_v1', bills);

  const pinv: any[] = [];
  for (let n = 1; n <= 12; n++) {
    const s = suppliers[n % suppliers.length];
    const p = products[(n * 3) % products.length];
    const qty = 24 * n;
    const amount = qty * (p.costPricePerKg || 0);
    pinv.push({ id: `pi-${n}`, invoiceNumber: `P-${n}`, memoNo: `SB-${9000 + n}`, date: iso(50 - n * 3), supplierId: s.id, supplierName: s.company, lines: [{ id: `pil-${n}`, productId: p.id, productName: p.name, code: p.code, unit: p.unit, qty, rate: p.costPricePerKg, amount, costPerUnit: p.costPricePerKg }], grossAmount: amount, discountAmount: 0, otherCharges: 0, totalAmount: amount, paidAmount: 0, createdAt: iso(50 - n * 3) });
    ledger.push({ id: `lpi${n}`, entityType: 'supplier', entityId: s.id, type: 'purchase_received', referenceId: `P-${n}`, sourceId: `pi-${n}`, date: iso(50 - n * 3), description: `Purchase invoice P-${n}`, debit: amount, credit: 0, balanceAfter: 0 });
    (s as any).totalOwed += amount;
  }
  set('tradeflow_purchase_invoices_v1', pinv);
  set('tradeflow_customers_v2', customers);
  set('tradeflow_suppliers_v2', suppliers);
  set('tradeflow_ledger_v2', ledger);
  set('tradeflow_accounts_v1', [
    { id: 'acc-1011', code: '1011', name: 'HBL — 5678', type: 'asset', parent: '1010', isBank: true, bankName: 'HBL', accountTitle: 'Madina Oil & Ghee', accountNumber: '0012345678', createdAt: '2026-01-01' },
    { id: 'acc-1012', code: '1012', name: 'MCB — 4321', type: 'asset', parent: '1010', isBank: true, bankName: 'MCB', accountTitle: 'Madina Oil & Ghee', accountNumber: '9900004321', createdAt: '2026-01-01' },
    { id: 'acc-1013', code: '1013', name: 'Bank Alfalah — 1122', type: 'asset', parent: '1010', isBank: true, bankName: 'Bank Alfalah', accountTitle: 'Madina Oil & Ghee', accountNumber: '5500001122', createdAt: '2026-01-01' },
  ]);
  set('tradeflow_journal_entries_v1', [
    { id: 'v1', date: iso(3), ref: 'CPV-1', memo: 'Shop rent September', lines: [{ accountCode: '1000', debit: 0, credit: 30000 }, { accountCode: '5100', debit: 30000, credit: 0, memo: 'Rent' }], source: 'manual', voucherType: 'CPV', createdAt: iso(3) },
    { id: 'v2', date: iso(2), ref: 'CRV-1', memo: 'Cash from Zaman and Co BTK', lines: [{ accountCode: '1000', debit: 15000, credit: 0 }, { accountCode: '1100', debit: 0, credit: 15000, partyType: 'customer', partyId: 'c1' }], source: 'manual', voucherType: 'CRV', createdAt: iso(2) },
  ]);
  set('tradeflow_cheques_v1', [
    { id: 'chq1', direction: 'received', customerId: 'c2', partyName: customers[1].name, bankName: 'MCB', chequeNumber: '100200', amount: 45000, chequeDate: iso(-5), entryDate: iso(1), status: 'in_hand', createdAt: iso(1) },
    { id: 'chq2', direction: 'issued', supplierId: 's2', partyName: suppliers[1].company, bankName: 'HBL', chequeNumber: '778899', amount: 120000, chequeDate: iso(-2), entryDate: iso(1), status: 'issued', bankCode: '1011', createdAt: iso(1) },
  ]);
  ['tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_returns_v2'].forEach((k) => localStorage.setItem(k, '[]'));
};
