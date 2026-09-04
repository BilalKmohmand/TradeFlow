# Sarmaya — Pakistani Bulk Trading & Logistics System

A localised bulk-trading operations dashboard built for Pakistani commodity traders. Manage customers, suppliers, products, bookings, truck dispatches, ledger balances and automated WhatsApp alerts — with all currency in Pakistani Rupees (PKR).

## Features

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
- **Admin Control Center** (PIN-protected) — change the master PIN, delete any customer / supplier / product / booking / dispatch / ledger row, purge whole tables, export & import JSON backups, factory reset, and review the audit log.

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

- **Users & roles**: Admin → Users & Roles. Each person gets a name, role and PIN and picks their name on the lock screen. The master PIN always signs in as Administrator. Roles: **admin** (everything), **manager** (everything except purging data and managing users), **operator** (day-to-day transactions only: no deletes, no price changes, no finance, no admin). The audit log records who did what.
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
npm run check     # type-check + unit tests + e2e (what CI should run)
```

The end-to-end suite (`e2e/app.spec.ts`) unlocks the app, factory-resets, creates a user, supplier, product, customer and vehicle, books, dispatches with a fleet vehicle, receives stock, records an expense, checks the dashboard, P&L, aging, stock flow, invoice preview, price history and monthly sales, then signs in as an operator to verify hidden admin/delete controls, and checks the mobile layout. Screenshots land in `e2e/screenshots/`.

Unit and integration tests live in `src/__tests__/` and cover the finance maths (cost basis, P&L, aging, credit exposure), stock-flow grouping, price-history comparisons, alerts, and an integration suite that drives the real `TradingProvider` through bookings, dispatches, purchases, payments, cascading deletes with reversals, booking edits/cancellation, roles and permissions, plus App-level tests for navigation, the print preview and Escape handling.

In VS Code, install the recommended **Vitest** extension (`.vscode/extensions.json`) to run and debug individual tests from the Testing sidebar, or use the "Vitest: run all tests" and "Dev server" launch configurations from the Run and Debug panel.

## Database migrations

Run the SQL files in `supabase/` in this order on an existing project:

1. `migrate_tons_to_kg.sql` (once) — tons → kg, purchases and price_history tables.
2. `migrate_v3_enterprise.sql` (once) — expenses, trucks, users tables; booking cancellation and dispatch→truck columns.
3. `migrate_v4_cashbook.sql` (once) — cash entries and settings.
4. `migrate_v5_dispatch_tax_delivery.sql` (once) — weighbridge, freight, tax, delivery status, trip expenses, company profile.
5. `migrate_v6_trade_documents.sql` (once) — quotations, purchase orders, returns, stock adjustments, tasks, broker commission.

New projects can run `schema.sql` instead, which already contains everything.

## Admin Access

This app is for internal use only, so every unlocked session has full admin rights.

- **Master PIN**: the default PIN is `7860`. Change it from the lock screen or from **Admin → Master PIN & Session**. The PIN is 4–6 digits. Named users with their own PINs are managed under **Admin → Users & Roles**.
- **Deleting records**: every card and detail modal has a trash icon. Deletes cascade and reverse their side-effects:
  - Deleting a **dispatch** returns its tonnage to warehouse stock and the booking's remaining balance, removes its ledger rows and WhatsApp alert, and reduces the customer's due if the dispatch was unpaid.
  - Deleting a **booking** deletes all of its dispatches (with the reversal above), then the booking itself.
  - Deleting a **customer** deletes all of their bookings, dispatches, ledger rows and WhatsApp logs.
  - Deleting a **product** deletes all bookings and dispatches for that product.
  - Deleting a **supplier** unlinks its products (they are kept) and removes supplier ledger rows.
  - Deleting a **ledger entry** removes only that row; balances are not recalculated.
- **Purge table / Factory reset / Load sample data** live on the Admin screen and require typing a confirmation word. They do **not** cascade.
- Deletes are applied locally and, when Supabase is configured, to the cloud database. Every action is written to the audit log.

> **Security note**: the PIN gate is a client-side convenience only. With RLS disabled in `supabase/schema.sql`, anyone holding the anon key can read and write every table. Keep the Supabase URL/key out of public repos and restrict who can open the deployed URL.

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
