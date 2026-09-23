/**
 * A realistic oil & ghee dealer for the sales specs: 32 customers with codes (some Urdu / long names, cities),
 * 22 items with codes, barcodes and cartons, two godowns, batch items with expiry, two banks,
 * salesmen, areas and a scheme. Runs in the browser (page.addInitScript), so it must be self-contained.
 */
export const salesSeed = () => {
  if (localStorage.getItem('e2e_sales_seeded')) return; // survive page.reload()
  localStorage.setItem('e2e_sales_seeded', '1');
  const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().split('T')[0];
  const today = day(0);
  set('tradeflow_settings_v2', {
    appMode: 'billing', companyName: 'Rohail Zaman Traders', companyAddress: 'Amandarra, Alladand Road, Batkhela', companyPhone: '0341-0550055',
    cashOpeningBalance: 50000, openingBankBalance: 250000, cashOpeningDate: '2026-01-01', taxRatePct: 0, allowNegativeStock: true,
    bankOpenings: { '1011': 100000 }, mainBankName: 'Meezan — 0071',
  });
  set('tradeflow_accounts_v1', [{ id: 'acc-hbl', code: '1011', name: 'HBL — 4471', type: 'asset', parent: '1010', isBank: true, bankName: 'HBL', accountNumber: '00114471', createdAt: today }]);
  const cities = ['Batkhela', 'Mingora', 'Peshawar', 'Mardan', 'Dargai', 'Chakdara', 'Timergara'];
  const names = [
    'Zaman and Co BTK', 'Haji Karim Store', 'حاجی عبدالرحمن اینڈ سنز', 'Al-Madina Kiryana & General Store Main Bazar Batkhela', 'Bilal Traders',
    'Shah Jee Oil Depot', 'خان کریانہ سٹور', 'Gul Muhammad', 'Swat Ghee Centre', 'Noor Brothers', 'Afridi Wholesale', 'Yousafzai Mart',
    'Rehman Sweets & Bakers', 'Pak Oil Traders', 'Malakand General Store', 'Qureshi & Sons', 'Hamid Kiryana', 'Sultan Store',
    'Taj Traders', 'Wali Khan', 'Faisal Brothers', 'Iqbal Stores', 'Mingora Cash & Carry', 'Dir Road Wholesale', 'Saeed Ahmed',
    'Chakdara Ghee House', 'Usman Traders', 'Zahir Shah', 'Ayaz Kiryana', 'Kamran Store', 'Abdul Wahab & Co', 'Jan Muhammad',
  ];
  set('tradeflow_customers_v2', names.map((n, i) => ({
    id: `c${i + 1}`, code: `C-${String(i + 1).padStart(4, '0')}`, name: n, company: n, phone: `0300${String(1000000 + i * 7919).slice(0, 7)}`,
    email: '', address: cities[i % cities.length], city: cities[i % cities.length], totalDue: 0, creditLimit: i === 4 ? 50000 : 0, createdAt: today,
    ...(i === 1 ? { salesmanId: 'sm1', areaId: 'ar1' } : {}),
  })));
  set('tradeflow_suppliers_v2', [{ id: 's1', code: 'S-0001', name: 'Ahmed', company: 'Dalda Foods', phone: '03007654321', email: '', materialCategory: 'Oil', address: 'Karachi', totalOwed: 0, createdAt: today }]);
  const items: [string, string, number, number, number, string?, number?][] = [
    // name, unit, price, cost, stock, packName, packSize
    ['Dalda Ghee 16 L Tin', 'tin', 7050, 6400, 120, 'carton', 1],
    ['Dalda Cooking Oil 5 L Can', 'can', 2450, 2200, 400, 'carton', 4],
    ['Habib Banaspati 1 kg Pouch', 'pouch', 560, 505, 1200, 'carton', 12],
    ['Habib Oil 3 L Bottle', 'bottle', 1650, 1500, 300, 'carton', 6],
    ['Sufi Canola Oil 5 L', 'can', 2650, 2400, 200, 'carton', 4],
    ['Kisan Ghee 2.5 kg Tin', 'tin', 1290, 1180, 150, 'carton', 6],
    ['Seasons Canola 1 L', 'bottle', 590, 540, 600, 'carton', 12],
    ['Eva Cooking Oil 10 L', 'can', 4800, 4450, 80, 'carton', 2],
    ['Meezan Ghee 16 kg Tin', 'tin', 6900, 6300, 60],
    ['Shan Masala Box (small)', 'box', 120, 95, 2000, 'carton', 144],
    ['National Salt 800 g', 'pack', 55, 42, 3000, 'carton', 40],
    ['Sugar 50 kg Bag', 'bag', 7250, 7000, 90],
    ['Basmati Rice 25 kg Bag', 'bag', 8900, 8300, 40],
    ['Tapal Danedar 950 g', 'pack', 1450, 1320, 500, 'carton', 12],
    ['Lipton Yellow Label 190 g', 'pack', 420, 380, 800, 'carton', 36],
    ['Olpers Milk 1 L', 'pack', 290, 262, 1000, 'carton', 12],
    ['Rafhan Corn Oil 5 L', 'can', 3350, 3050, 70, 'carton', 4],
    ['Mezan Oil Pouch 1 L', 'pouch', 575, 520, 900, 'carton', 12],
    ['Soya Supreme 16 L Tin', 'tin', 6750, 6150, 50],
    ['Canolive 3 L', 'bottle', 1890, 1720, 120, 'carton', 6],
    ['Dalda Premium Olive 500 ml (imported, heavy duty glass bottle)', 'bottle', 1980, 1800, 140, 'carton', 12],
    ['Batch Ghee 1 kg (with expiry)', 'pouch', 600, 540, 0, 'carton', 12],
  ];
  set('tradeflow_products_v2', items.map(([name, unit, price, cost, stock, packName, packSize], i) => ({
    id: `p${i + 1}`, code: `${101 + i}`, barcode: `896400${String(1000000 + i).slice(1)}${i % 10}`, name, category: 'Oil & Ghee', unit,
    unitPricePerKg: price, costPricePerKg: cost, stockKg: i === 21 ? 60 : stock, minThresholdKg: 5,
    ...(packName && (packSize || 0) > 1 ? { packName, packSize } : {}),
    ...(i === 21 ? { trackBatches: true } : {}),
  })));
  set('tradeflow_godowns_v1', [
    { id: 'g1', name: 'Main shop', isDefault: true, createdAt: today },
    { id: 'g2', name: 'Dargai godown', isDefault: false, createdAt: today },
  ]);
  set('tradeflow_stock_batches_v1', [
    { id: 'sb1', productId: 'p22', godownId: 'g1', batchNo: 'B-OLD', expiryDate: day(15), qty: 24, receivedDate: '2026-01-10', costPrice: 540 },
    { id: 'sb2', productId: 'p22', godownId: 'g1', batchNo: 'B-NEW', expiryDate: day(200), qty: 36, receivedDate: '2026-02-10', costPrice: 540 },
    { id: 'sb3', productId: 'p2', godownId: 'g2', batchNo: '', qty: 100, receivedDate: '2026-01-10', costPrice: 2200 },
  ]);
  set('tradeflow_salesmen_v1', [{ id: 'sm1', name: 'Rashid (Swat route)', active: true, createdAt: today, commissionPct: 1 }]);
  set('tradeflow_areas_v1', [{ id: 'ar1', name: 'Swat', active: true, createdAt: today }]);
  set('tradeflow_schemes_v1', [{ id: 'sc1', name: 'Buy 10 get 1', productId: 'p3', kind: 'free_every', buyQty: 10, freeQty: 1, active: true, createdAt: today }]);
  ['tradeflow_invoices_v1', 'tradeflow_ledger_v2', 'tradeflow_expenses_v2', 'tradeflow_cash_entries_v2', 'tradeflow_purchases_v2', 'tradeflow_cheques_v1', 'tradeflow_returns_v2', 'tradeflow_quotations_v2'].forEach((k) => localStorage.setItem(k, '[]'));
};
