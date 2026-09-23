/**
 * A realistic oil & ghee dealer for the purchasing / supplier specs: 22 suppliers with codes, cities
 * and phones (one Urdu name, one very long name), 32 items with codes, barcodes and cartons (two
 * tracked in batches) and 2 godowns. Nothing is owed and no stock movement exists yet, so every
 * balance the specs check is built by the flows under test.
 *
 *   await page.addInitScript(purchasingSeed);
 */
export const purchasingSeed = () => {
  if (localStorage.getItem('e2e_purq_seeded')) return; // survive page.reload()
  localStorage.setItem('e2e_purq_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  set('tradeflow_settings_v2', { appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Batkhela', cashOpeningBalance: 5000000, openingBankBalance: 2000000, cashOpeningDate: '2026-01-01', taxRatePct: 0 });
  const cities = ['Karachi', 'Lahore', 'Peshawar', 'Mardan', 'Swat', 'Batkhela', 'Rawalpindi', 'Quetta'];
  const firms = [
    'Dalda Foods', 'Habib Oil Mills', 'Seasons Edible Oil', 'Sufi Group', 'Eva Cooking Oil', 'Kisan Ghee', 'Mezan Group',
    'Soya Supreme', 'Canolive', 'Tullo Ghee', 'Shan Oil', 'Zaiqa Ghee', 'Latif Brothers', 'Madina Traders', 'Punjab Oil Mills',
    'Khyber Ghee', 'Malakand Agencies', 'Chitral Distributors', 'Swat Wholesale', 'Bannu Ghee Mills',
    'شاہین گھی ملز', 'The Very Long Named Edible Oil and Banaspati Ghee Manufacturing Company (Private) Limited',
  ];
  set(
    'tradeflow_suppliers_v2',
    firms.map((company, i) => ({
      id: `s${i + 1}`,
      code: `S-${String(i + 1).padStart(4, '0')}`,
      name: `Contact ${i + 1}`,
      company,
      phone: `0300${String(1000000 + i * 137).slice(0, 7)}`,
      email: '',
      materialCategory: 'Oil',
      address: `Main Bazar ${cities[i % cities.length]}`,
      city: cities[i % cities.length],
      totalOwed: 0,
      createdAt: '2026-01-01',
    }))
  );
  const items: Record<string, unknown>[] = [];
  const brands = ['Dalda', 'Habib', 'Seasons', 'Sufi', 'Eva', 'Kisan', 'Mezan', 'Tullo'];
  for (let i = 0; i < 32; i++) {
    const brand = brands[i % brands.length];
    const kind = i % 4;
    const grade = ['', ' Gold', ' Classic', ' Special'][Math.floor(i / 8)];
    const name = kind === 0 ? `${brand}${grade} Ghee 16 L Tin` : kind === 1 ? `${brand}${grade} Oil 5 L Can` : kind === 2 ? `${brand}${grade} Oil 1 L Pouch` : `${brand}${grade} Ghee 2.5 KG Tin`;
    const unit = kind === 0 ? 'tin' : kind === 1 ? 'can' : kind === 2 ? 'pouch' : 'tin';
    const cost = kind === 0 ? 6000 : kind === 1 ? 2000 : kind === 2 ? 450 : 1200;
    items.push({
      id: `p${i + 1}`,
      code: String(101 + i),
      name: i === 31 ? 'بناسپتی گھی خاص 16 لیٹر ٹن' : i === 30 ? `${brand} Premium Cholesterol-Free Vitamin-Enriched Cooking Oil 5 Litre Family Can` : name,
      category: kind % 2 === 0 ? 'Ghee' : 'Cooking oil',
      brand,
      unit,
      ...(kind === 1 ? { packName: 'carton', packSize: 4 } : kind === 2 ? { packName: 'carton', packSize: 12 } : {}),
      unitPricePerKg: Math.round(cost * 1.15),
      costPricePerKg: cost,
      stockKg: 0,
      minThresholdKg: 5 + (i % 3) * 5,
      reorderQty: 20,
      supplierId: `s${(i % 20) + 1}`,
      barcode: `896400${String(1000000 + i).slice(1)}`,
      ...(i === 4 || i === 8 ? { trackBatches: true } : {}),
    });
  }
  set('tradeflow_products_v2', items);
  set('tradeflow_godowns_v1', [
    { id: 'g1', name: 'Main shop', isDefault: true, createdAt: '2026-01-01' },
    { id: 'g2', name: 'Mardan godown', isDefault: false, createdAt: '2026-01-01' },
  ]);
  set('tradeflow_customers_v2', [{ id: 'c1', code: 'C-0001', name: 'Zaman and Co', company: 'Zaman and Co', phone: '0344', email: '', address: 'Batkhela', city: 'Batkhela', totalDue: 0, creditLimit: 0, createdAt: '2026-01-01' }]);
  [
    'tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2',
    'tradeflow_purchase_orders_v2', 'tradeflow_purchase_invoices_v1', 'tradeflow_supplier_bills_v1', 'tradeflow_supplier_claims_v1',
    'tradeflow_returns_v2', 'tradeflow_cheques_v1', 'tradeflow_stock_batches_v1',
  ].forEach((k) => localStorage.setItem(k, '[]'));
};
