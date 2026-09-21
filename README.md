# Sarmaya — Simple Billing & Daily Cash for Pakistani Traders

Out of the box the app runs in **Simple billing mode**: make a bill in one screen, take cash or give credit, and close the day with a daily sheet that shows cash in hand, bank, what customers owe and what you owe. Every product has one fixed price (per can, tin, bag, kg…) that can still be changed on any bill line. Works offline in the browser, and syncs to Supabase when configured.

The full bulk-trading ERP is still there and shares the same data — day to day you only see the simple billing screens, and the complete system is one setting away (**Admin → System & Backups → App mode**, or the *Open full suite* card on Home). That gives you quotations, multi-item bookings with agreed rates and broker commission, truck dispatches with weighbridge, freight, tax and delivery status, tax invoices and challans, purchase orders and stock receiving, kg inventory with stock flow and price history, Profit & Loss, balance sheet, cash book, receivables and payables aging, sales analytics, fleet and drivers, alerts, follow-up tasks, users with roles and permissions, audit trail, backups and CSV import.

## Simple billing mode

| Screen | What it does |
|---|---|
| **Home** | Today's sales, cash received, expenses and "money in business"; the four everyday buttons (New Bill, Add expense, Receive payment, Cash ↔ Bank); recent bills; low stock and unpaid-bill reminders. |
| **Bills** | Every bill with search and Today / 7 days / Month / All / Unpaid filters. Open a bill to take a payment, print it, send it on WhatsApp or delete it. CSV export. |
| **New Bill** | Customer (or type a new one inline), date, item lines with qty and an editable price, discount, paid-now + method, note. *Save* or *Save & Print*. Stock, the customer account, the ledger and the cash book all update from this one action. |
| **Daily Sheet** | One day on one page: opening cash/bank, bills, money received, expenses grouped into sheets (Day-to-day, Employee, Food, Owner drawings, Bank charges…), supplier payments, deposits/withdrawals, closing cash/bank. Print it at closing time. |
| **Money** | Cash in hand, bank, who owes you (with Receive and statement print), who you owe (suppliers + unpaid expenses), net "money in business". Tabs for monthly expense sheets and the cash book. Opening balances are set here or in Admin. |
| **Items & Prices** | The price list: name, sold-per unit, fixed price, cost price, stock and low-stock level. |
| **Customers / Suppliers / Admin** | Unchanged from the trading suite: accounts, ledgers, statements, users, roles, backups. |

### Credit limits on bills

Set a customer's **credit limit** (Rs., 0 = no limit) on the customer form. New Bill then shows *Credit limit Rs. X · owes Rs. Y · available Rs. Z*. If what they already owe plus the unpaid part of this bill goes over the limit, Save is blocked with a clear warning — take more payment now, or a user with the `override_credit` permission (manager / admin) ticks **Allow over limit** and types a short reason. The reason is saved on the bill (`creditOverride`) and in the audit log. `createBill` enforces the same rule, so it cannot be bypassed. Customers shows an **Over limit** badge and a "% of limit used" bar; Home lists customers over their limit under *Needs attention*.

### Bank reconciliation (Money → Bank reconciliation)

1. **Upload statement (CSV)** from your bank — columns date, description and either one amount column (+ in / − out) or separate money out (debit) / money in (credit) columns. Headings are guessed and can be changed in the mapping step. Dates in dd/mm/yyyy, yyyy-mm-dd (and dd-mm-yy, "05 Mar 2026") are read. Lines can also be typed by hand. Lines already imported are skipped.
2. Each line is **auto-matched** to a bank-side entry in your books (anything not paid in cash: bank transfer, cheque, Easypaisa/JazzCash, card, and the bank leg of Cash ↔ Bank transfers): same amount and direction to the paisa, dates within ±3 days, each entry used once, closest dates paired first. Confidence: *same day* / *1 day apart* / *2–3 days apart, please check*. You can match by hand, unmatch, or ignore a line.
3. For lines missing from your books, one tap adds the record — an expense paid from the bank (Bank charges by default) or money received into the bank — and matches it.
4. Type the statement end date and **closing balance**. The summary shows the book bank balance, money in your books not yet on the statement (deposits in transit, uncleared cheques — tick them when they clear), bank lines not in your books, and **Reconciled ✓** when the difference is 0. Save it and **Print** a reconciliation report.
### Batches, expiry dates and godowns

For shops that need it (edible oil and ghee in cans and tins expire), and invisible for those that don't — a shop with one godown and no batch items sees the same screens as before.

- **Track batch & expiry** — a switch on each item. Stock for that item is then received as batches (batch no., expiry date) with **Items → Receive stock** (header button, or the box icon on an item row). A receipt can also carry a cost price and a supplier; with both, it is booked as a purchase owed to that supplier, so the supplier balance and the Money screen stay right.
- **Bills sell first-expiry-first-out.** The New Bill form shows which batch each line will use; expired batches are never sold, and if only expired stock is left the bill is refused with a clear message. The batches are saved on the bill line, printed under the item (*Batch X · Exp dd-mm-yyyy*), and a deleted bill puts the quantity back into exactly those batches.
- **Godowns** — **Items → Godowns** to add, rename or delete godowns (a godown with stock in it can't be deleted; the main godown always exists) and **Move stock** between them (qty, date, note; logged). With two or more godowns the Items screen shows stock per godown, receipts ask *Into godown* and New Bill asks *From godown*.
- **Home → Needs attention** lists expired batches (red) and batches expiring within 30 days (amber).

How the numbers stay consistent: an item's `stockKg` is always the **total** across godowns, so every report and the trading suite keep working. Batches and stock in other godowns are rows in `stock_batches`; whatever is not in a row is plain stock in the main godown. Existing items therefore start with all their stock in the main godown and no batches — nothing to convert. If something outside the billing screens lowers the total (a trading dispatch, an edited stock count), the difference comes out of the batches earliest-expiry first.

Printed bills follow the classic layout — INVOICE, number, date, Bill From / Bill To, Description · Qty · Price · Amount, Subtotal, Total in Rs., paid and balance. A full function-by-function guide is in [`docs/GUIDE.md`](docs/GUIDE.md).

## Installing it as a mobile app (PWA)

The web build is a real installable app, not just a bookmark. Open the site on a phone and:

- **Android (Chrome)**: menu → **Install app** (or the install banner that appears automatically). It gets its own icon and opens full-screen, no address bar.
- **iPhone (Safari)**: Share → **Add to Home Screen**. Same result — its own icon, opens full-screen.

Once installed it also **works with the phone fully offline** — the app itself (screens, buttons, print layouts) is cached on the device by a service worker, so it opens even with no signal; bills already made are read from local storage as always, and anything typed while offline saves locally and reaches Supabase the next time there's a connection, exactly like the browser tab does. Updates to the app (a new deploy) are picked up automatically in the background the next time it's opened — nothing for the shopkeeper to tap.

This is a Progressive Web App (`vite-plugin-pwa`, manifest at `public/icons/`, generated `sw.js`/`manifest.webmanifest` on every build) — there is no separate iOS/Android app-store app, and none is needed for this to feel and behave like one. If a real App Store / Play Store listing is ever wanted, the same codebase can be wrapped with [Capacitor](https://capacitorjs.com) without a rewrite; nobody has asked for that yet.

## Accounts (double-entry)

**Money → Accounts** (needs the *view finance* permission) keeps a proper general ledger that an accountant can sign off, without changing how the shop works. Nothing extra is typed in: every bill, payment, expense, purchase, cash↔bank transfer, return and stock adjustment is **posted automatically** as a balanced journal entry (Dr = Cr), derived live from the records the app already keeps — delete a bill and its postings go with it.

- **Chart of accounts** for a Pakistani trading shop: 1000 Cash in hand, 1010 Bank (incl. Easypaisa/JazzCash, cheques, cards), 1100 Receivable, 1200 Inventory, 2000 Payable, 2010 Unpaid expenses, 2100 Sales tax payable, 2900 Suspense, 3000 Capital, 3100 Drawings, 3900 Opening balance equity, 4000 Sales, 4010 Discounts, 4020 Returns, 4100 Freight income, 5000 COGS, 5100 Stock losses, and one 6xxx account per expense category. The accountant can add accounts; system accounts can't be deleted.
- **Posting rules**: bill → Dr Receivable / Cr Sales, Dr Discounts, Cr Sales tax, plus Dr COGS / Cr Inventory at the item cost; payment → Dr Cash or Bank (by method) / Cr Receivable; purchase → Dr Inventory / Cr Payable; supplier payment → Dr Payable / Cr Cash or Bank; expense → Dr expense (drawings → equity) / Cr Cash, Bank or Unpaid expenses; transfer → one entry between Cash and Bank; opening balances and old customer/supplier dues → Opening balance equity. Cash, Bank, Receivable and Payable always equal the Money, Customers and Suppliers screens.
- **Tabs**: Trial balance (Balanced ✓ check), General ledger per account with running balance and links back to bills, Journal (auto + manual, filters), Chart of accounts, Profit & Loss, Balance sheet (Assets = Liabilities + Equity, with profit to date). Trial balance, P&L and balance sheet print like every other document.
- **Manual journal entries** for corrections and accruals: any number of lines, saves only when debits equal credits. **Period lock** (admin): manual journals dated on or before the lock date are refused.

Logic lives in `src/utils/accounting.ts` (pure, unit-tested); run `supabase/migrate_v10_accounting.sql` to sync manual journals and custom accounts to Supabase.

## Features (full trading suite)

- **Customer & Supplier CRM** with Pakistani contact defaults (`+92` phones, `.com.pk` emails, local berths).
- **Commodity / Product inventory** in kilograms with low-stock alerts.
- **Bulk Bookings** in kg with live remaining-balance tracking.
- **Incoming stock (Receive Stock)** — goods receipts from suppliers that add to stock and the supplier payable.
- **Daily Stock Flow tracker** — incoming vs outgoing per day (kg and Rs.) on the Dashboard and as a running log under Reports → Stock Flow, with every entry linked to its booking, dispatch, supplier, customer and product.
- **Product Price History** — every price change is recorded; each product shows a price chart plus comparisons against the same month, same quarter and same day last year with % change.
- **Dispatch Logging** per truck with driver, vehicle number and WhatsApp dispatch alert.
- **Ledger** for customer receivables and supplier payables.
- **Reports** with daily / monthly CSV export and charts.
- **Supabase-backed** real-time data sync.
- **PKR Currency** formatting and localised `en-PK` numbers.
- **Light / Dark mode** with automatic time-based switching.
- **Admin Control Center** (owner and admins) — staff accounts and temporary passwords, delete any customer / supplier / product / booking / dispatch / ledger row, purge whole tables, export & import JSON backups, factory reset, and review the audit log.

## Units

- Quantities: **kg** everywhere (forms, cards, charts, tables, CSV exports, WhatsApp messages).
- Prices: **Rs./kg**. Amounts remain in Rs.
- Booking and dispatch forms accept and store kg directly.

## Stock Flow, Purchases & Price History

- **Receive Stock** (Products header, Dashboard, Supplier modal, ⌘K) books incoming goods from a supplier: stock goes up, a `purchase_received` ledger row is written for the supplier and their payable increases unless "paid on receipt" is ticked.
- **Dashboard → Today's Stock Movement** shows incoming / outgoing / net kg and Rs. for today plus the latest movements. "Full Log" opens **Reports → Stock Flow**, a day-by-day running log (7 / 30 / 90 days or a custom range) with a chart, totals and CSV export.
- Every movement links to its source: dispatch → booking (with the dispatch highlighted), receipt → supplier, and product → product detail. Bookings open from anywhere their number appears.
- **Product detail** (click a product name or "History") has three tabs: Price History (chart, log, year-over-year comparison cards, "set new price" and "add a past price point" for back-filling last year's prices), Stock In / Out, and Bookings.
- Price points are recorded automatically when a product is created, when its price is changed, and when a booking is agreed (shown as dots; only listed prices drive the comparisons).

## Enterprise Features

- **Users & roles**: Admin → User Accounts & Auth. Each person gets a name, a username, a role and a temporary password (see *Signing in*). Roles: **admin** (everything), **manager** (everything except purging data and managing users), **operator** (day-to-day transactions only: no deletes, no price changes, no finance, no admin). The audit log records who did what.
- **Editing & lifecycle**: pencil icons on every customer, supplier, product and booking card and in the detail modals. Bookings can be edited (quantity never below what is dispatched; amounts recalculated) and cancelled with a reason.
- **Credit control**: a booking shows the customer's projected exposure (outstanding + committed active bookings + this contract) against their credit limit and is blocked when over it. Managers and admins can tick an override, which is written to the audit log.
- **Receive Stock / purchases**, **Stock Flow log** and **Price History** are described above.
- **Operations screen** (Ops): 
  - *Alerts*: low or zero stock, customers over credit limit, receivables and payables past 30 days (ledger-based, oldest-first), bookings past their target date, vehicles in maintenance. Each alert opens the record. The nav badge shows the count.
  - *Fleet*: vehicles with driver, phone, capacity and status; picked from a list when logging a dispatch (with an over-capacity warning); trips, kg hauled and costs per vehicle.
  - *Expenses*: categorised operating expenses (transport, fuel, labour, port charges, rent, utilities, salaries, maintenance, tax, other), optionally tied to a vehicle, with monthly totals and CSV export.
- **Finance** (Reports → Profit & Loss / Aging, managers and admins only):
  - *P&L*: monthly revenue, cost of goods (weighted-average purchase cost per product), gross profit, expenses by category, net profit, six-month trend and per-product margins. Dispatched kg with no purchase record is flagged as uncosted.
  - *Aging*: receivables and payables in 0-30 / 31-60 / 61-90 / 90+ buckets with oldest open invoice, one-click WhatsApp reminders and CSV export.
- **Documents**: print or save as PDF a tax invoice or delivery challan for any dispatch (booking detail → printer icons) and a statement of account for any customer or supplier (detail modal → printer icon).
- **Dashboard**: month-to-date revenue, gross profit, expenses and net profit, top customers, and a "Needs Attention" panel with the top alerts.
- **Exports**: Admin → Data Exports for customers, suppliers, products and the full ledger as CSV.

## Navigation & workspace

- **Sidebar** (desktop): grouped into Overview, Sales, Purchasing, Inventory, Finance, Operations and Administration, with quick links into the sub-views (orders, quotations, returns, purchase orders, receive stock, stock flow, each finance report, alerts, fleet, expenses, follow-ups). Collapsible; remembers its state. On phones the bottom tab grid is used instead.
- **Header**: global search (⌘K), theme, a notifications bell with the current alerts, the signed-in user and role, and Lock.
- **Dashboard**: business pulse tiles (receivables, payables, stock value, active orders, open quotes, open POs, fleet), month-to-date P&L, needs-attention panel, today's stock movement, a 7-day in/out chart, recent activity from the audit trail and active bookings awaiting dispatch.
- **Sales Analytics** (Reports → Sales Analytics): revenue, volume, average price, customers ranked by revenue with share bars, revenue by product, and a 12-month revenue vs gross-profit chart, for 30 days / quarter / 12 months / all time, with CSV export.
- **Lists**: Customers, Suppliers, Products and Bookings can be sorted (name, balance, stock, value, date, customer…) and exported to CSV.
- **Data Import** (Admin → Data Import): upload CSV files of customers, suppliers or products (templates provided), preview, then import; duplicates by phone or product name are skipped and opening balances can be set.

## Trade documents & workflow

- **Quotations** (Bookings → Quotations): quote a price, mark it sent / accepted / rejected, print it, and convert it to a booking in one click. Quotes expiring within two days appear in alerts.
- **Purchase orders** (Suppliers → Purchase Orders): raise a PO to a supplier; each Receive Stock against it fills the order (partial / received). Overdue POs appear in alerts.
- **Returns** (Bookings → Returns): a sales return puts goods back in stock and issues a printable **credit note**; a purchase return sends goods back and raises a **debit note**. Deleting a return reverses everything.
- **Stock adjustments**: the "Adjust" link on a product asks for a reason (count, wastage, moisture, damage, theft, other) and a note. Adjustments appear in the stock flow and the audit log.
- **Follow-ups** (Ops → Follow-ups): to-dos with due dates attached to a customer, supplier, booking, product or vehicle; due and overdue items show in alerts and on the dashboard.
- **Broker commission**: a booking can carry a broker name and Rs./kg commission which accrues into the P&L as dispatches happen.
- **Sales tax & freight** apply per dispatch (rate under Admin → Company & Invoicing); invoices show goods, freight, tax and total. **Weighbridge** gross/tare fields compute net kg on dispatches and receipts.
- **Delivery status**: every dispatch is in transit until marked delivered with received-by and proof-of-delivery note; fleet vehicles go on trip and return to available automatically. Dispatches not delivered after two days appear in alerts.
- **Daily cash book** (Reports → Cash Book) and **balance sheet** (Reports → Balance Sheet), with an opening cash balance setting and manual cash entries.
- Printable **receipt / payment vouchers**, **quotation**, **purchase order**, **credit / debit notes** alongside invoices, challans and statements.
- Duplicate phone numbers are rejected when adding customers or suppliers.

## Testing

```bash
npm test          # run the Vitest suite once
npm run test:watch
npm run test:e2e  # real-browser end-to-end flow in the installed Google Chrome (Playwright)
npm run check     # build + type-check + unit tests + e2e (what CI should run)
```

`e2e/inventory.spec.ts` turns on batch tracking, receives two batches with different expiry dates (one on credit from a supplier), checks the expiring-soon alert on Home, makes a bill that uses the earlier-expiring batch and prints it, adds a second godown, moves stock there and bills from it — on desktop and a 390px phone. Run e2e on your own port with `E2E_PORT=4192 npx playwright test` when several checkouts share a machine.

The billing suite (`e2e/billing.spec.ts`) makes the client's sample invoice, a credit bill with an inline new customer and an edited price, takes part payments, adds an expense from the daily sheet, prints the bill and the daily sheet, moves cash to the bank, checks the money position, adds an item, switches app mode and reloads — on desktop and on a 390px phone. `e2e/auth.spec.ts` covers creating the owner account on an empty device, sign-in with a wrong and a right password, the one-time PIN → password move, the owner adding staff who then set their own password, lock/unlock, switch user and log out, and the sign-in screens at 390px in light and dark mode. The trading suite (`e2e/app.spec.ts`) signs in, factory-resets, creates a user, supplier, product, customer and vehicle, books, dispatches with a fleet vehicle, receives stock, records an expense, checks the dashboard, P&L, aging, stock flow, invoice preview, price history and monthly sales, then signs in as an operator to verify hidden admin/delete controls, and checks the mobile layout. Screenshots land in `e2e/screenshots/`.

Unit and integration tests live in `src/__tests__/` and cover the finance maths (cost basis, P&L, aging, credit exposure), stock-flow grouping, price-history comparisons, alerts, and an integration suite that drives the real `TradingProvider` through bookings, dispatches, purchases, payments, cascading deletes with reversals, booking edits/cancellation, roles and permissions, plus App-level tests for navigation, the print preview and Escape handling.

In VS Code, install the recommended **Vitest** extension (`.vscode/extensions.json`) to run and debug individual tests from the Testing sidebar, or use the "Vitest: run all tests" and "Dev server" launch configurations from the Run and Debug panel.

## Database migrations

**Just run [`supabase/setup.sql`](supabase/setup.sql).** Supabase → SQL Editor → New query → paste the whole file → Run. It works on a brand-new project and on one that is part way through: it creates whatever is missing, adds whatever column is missing, and does nothing the second time. It never deletes a table, drops a column or changes a value.

That is the whole setup. The one exception is `migrate_tons_to_kg.sql`, which converts a pre-2026 tons-based database and must be run once, by hand, *before* `setup.sql`; projects created from `setup.sql` or `schema.sql` never need it.

Verified against a real PostgreSQL 16: on an empty database it creates all 27 tables; on a database missing the billing tables it brings it from 19 to 27 with every column the app writes; running it twice reports no errors.

<details>
<summary>The individual files it is built from, for reference</summary>

Run these in this order only if you want to apply them one at a time — `setup.sql` already contains all of them:

1. `migrate_tons_to_kg.sql` (once) — tons → kg, purchases and price_history tables.
2. `migrate_v3_enterprise.sql` (once) — expenses, trucks, users tables; booking cancellation and dispatch→truck columns.
3. `migrate_v4_cashbook.sql` (once) — cash entries and settings.
4. `migrate_v5_dispatch_tax_delivery.sql` (once) — weighbridge, freight, tax, delivery status, trip expenses, company profile.
5. `migrate_v6_trade_documents.sql` (once) — quotations, purchase orders, returns, stock adjustments, tasks, broker commission.
6. `migrate_v7_master_pin_sync.sql` (once) — master PIN and user account columns synced through cloud settings.
7. `migrate_v8_simple_billing.sql` (once) — invoices/bills table, product unit, app mode and opening bank balance in settings.
8. `migrate_v9_billing_integrity.sql` (once) — cost price on items, ledger source/method columns, paired cash↔bank transfers.
9. `migrate_v10_accounting.sql` (once) — double-entry accounts: manual journal entries, custom accounts, period lock in settings.
10. `migrate_v11_inventory.sql` (once) — godowns, stock batches with expiry, stock transfers, and the item's `trackBatches` flag. Existing data needs no conversion. Run it before turning on batch tracking on a cloud-synced shop (the products sync needs the new column).
11. `migrate_v12_credit_bankrec.sql` (once) — `invoices.creditOverride`, `bank_statement_lines` and `bank_reconciliations` tables (RLS disabled). Both tables are optional: without them bank reconciliation stays on the device.
12. `migrate_v16_passwords.sql` (once, **run it after `setup.sql`** — it is not folded into `setup.sql` yet) — username + password sign-in: `username`, `roles`, `status`, `passwordHash`, `passwordSalt`, `passwordIter`, `mustChangePassword`, lockout and `updatedAt` columns on `users`, and `pin` no longer NOT NULL. Without it the users table cannot hold the password hashes, so the owner can only sign in on the device where the account was made.
13. `migrate_v20_purchasing.sql` (once, **run it after `setup.sql`** — not folded into `setup.sql`) — purchasing: item `brand`, `barcode`, `photo`, `reorderQty`; multi-line purchase orders (`purchase_orders.items`, `orderDate`); `purchases.poLineId`; `supplier_bills` and `supplier_claims` tables (RLS disabled, optional: without them bills and claims stay on the device). Supplier bills post only the difference from the goods already received (`purchase_variance` ledger rows, account 5150 Purchase price differences); accepted claims post a debit note (`supplier_claim`, Dr Payable / Cr 5100).

`schema.sql` alone creates every table for a brand-new project, but it cannot add a missing column to a table you already have — that is why `setup.sql` runs both halves.

</details>

## Signing in

Everyone signs in with a **username and password** (the old PIN keypad is gone).

- **First time on a device with no account** (nothing on the device and nothing in the cloud `users` table): the app shows **Create your account** — shop name, your name, username and password (at least 8 characters, typed twice, with a show/hide eye). This makes you the owner (super admin) and sets the shop name on bills if none was set. There is no public sign-up after that: staff are added by the owner.
- **Sign in**: username (not case-sensitive, spaces ignored) and password. **Keep me signed in on this device** (on by default) keeps you signed in for 30 days; untick it on a shared computer and the session ends when the browser closes. Wrong passwords count per user; after the limit in *Admin → Security Policies* (default 5) the account is locked for the set time (default 15 minutes) or until an admin unlocks it.
- **Lock** (header button, or the account menu → *Lock screen*, or ⌘K) hides the app until the same person types their password again; *Not you? Switch user* goes back to the sign-in form. A reload does not get past the lock. **Log out** is in the account menu (top right), next to **My account**, where you can change your own password.
- **Staff**: *Admin → User Accounts & Auth → Add staff* — name, username, role and a temporary password (a random one is suggested). The person must choose their own password the first time they sign in. The key icon on a row sets a new temporary password (same forced change); the unlock icon lifts a lockout. Only roles with the user-management permissions can do this.
- **Moving from PINs**: existing users get a username made from their first name in small letters (Bilal Khan Mohmand → `bilal`, Rashid Minhas → `rashid`, Zahid … → `zahid`; a number is added if two people share a first name). The username is shown under *Admin → User Accounts & Auth*. Each person signs in **once** with their username and their **old PIN as the password**, then must choose a new password, and the PIN is deleted. The owner can also use the old master PIN that one time; once the owner has a password the master PIN is forgotten on every device.
- **How passwords are kept**: never in plain text. The browser hashes them with PBKDF2-SHA256 (WebCrypto, a random 16-byte salt per password, 210,000 iterations) and only the hash, salt and iteration count are stored and synced (`users.passwordHash`, `passwordSalt`, `passwordIter`), so the owner can sign in on another device once `migrate_v16_passwords.sql` has been run. WebCrypto needs https or localhost.
- Sign-ins, failed attempts, lockouts, lock/unlock, logouts, password changes and resets are written to the audit log.

> **Security note**: this is sign-in for a local-first app, enforced in the browser. With RLS disabled, anyone holding the Supabase anon key can read or change every table, including the password hashes. True database security would additionally need **Supabase Auth + Row Level Security** policies (not implemented). Keep the Supabase URL/key private and restrict who can open the deployed URL.

**Tests**: the e2e specs sign in through `e2e/helpers/login.ts` — `await signIn(page)` seeds the standard test users and signs in as the owner (`bilal` / `Sarmaya@2026`); `signIn(page, OPERATOR)` signs in as `zahid`; `seedUsers(page)` + `login(page, username, password)` do the two steps separately. The accounts (`bilal` super admin, `rashid` manager, `zahid` operator, `ayesha` viewer, all with password `Sarmaya@2026`) are defined once in `e2e/helpers/users.ts`, which unit tests also use through `src/__tests__/helpers/auth.ts` (`seedTestUsers()` + `await signIn(() => hook.result.current)`).

## Optional backend

`server.ts` carries an older demo Express API (credential login, 2FA, role management). It only runs under `npm run dev` and the app no longer calls its sign-in routes: username + password sign-in, roles and permissions work fully in the browser. Nothing needs configuring.

## Admin Access

The Admin screen is open to the owner (super admin) and roles with the admin permission.

- **Accounts**: the owner account is created on first start; staff accounts and temporary passwords are managed under **Admin → User Accounts & Auth** (see *Signing in*). The old master PIN no longer exists.
- **Deleting records**: every card and detail modal has a trash icon. Deletes cascade and reverse their side-effects:
  - Deleting a **dispatch** returns its tonnage to warehouse stock and the booking's remaining balance, removes its ledger rows and WhatsApp alert, and reduces the customer's due if the dispatch was unpaid.
  - Deleting a **booking** deletes all of its dispatches (with the reversal above), then the booking itself.
  - Deleting a **customer** deletes all of their bookings, dispatches, ledger rows and WhatsApp logs.
  - Deleting a **product** deletes all bookings and dispatches for that product.
  - Deleting a **supplier** unlinks its products (they are kept) and removes supplier ledger rows.
  - Deleting a **ledger entry** removes only that row; balances are not recalculated.
- **Purge table / Factory reset / Load sample data** live on the Admin screen and require typing a confirmation word. They do **not** cascade.
- Deletes are applied locally and, when Supabase is configured, to the cloud database. Every action is written to the audit log.

> **Security note**: sign-in is enforced in the browser only. With RLS disabled in `supabase/schema.sql`, anyone holding the anon key can read and write every table; real protection needs Supabase Auth + RLS. Keep the Supabase URL/key out of public repos and restrict who can open the deployed URL.

## Run Locally

```bash
npm install
```

Create `.env.local` from `.env.example` and fill in your Supabase URL and anon key:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Create the tables in your Supabase SQL Editor by running the contents of `supabase/schema.sql`.

### Upgrading an existing database from tons to kg

All quantities are now stored in **kilograms** and unit prices in **Rs. per kg** (1 ton = 1000 kg). If your Supabase project was created with the old tons-based schema, run `supabase/migrate_tons_to_kg.sql` **once** in the SQL editor. It renames the columns, multiplies quantities by 1000, divides prices by 1000, and creates the new `purchases` and `price_history` tables. Until it has been run the app still loads old rows (converted on read) but cannot write to those tables, so run it before using the new version in production.

Data cached in the browser from the old version is converted automatically the first time the new version opens.

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Build for Production

```bash
npm run build
npm start
```

## Deploy on Vercel

1. Import the GitHub repository on [Vercel](https://vercel.com).
2. Set the same Supabase environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in the Vercel project settings.
3. The included `vercel.json` will run `npm run build` and serve the `dist` folder.

## Tech Stack

- React 19 + TypeScript
- Vite + Tailwind CSS
- Supabase (`@supabase/supabase-js`)
- Express dev server
