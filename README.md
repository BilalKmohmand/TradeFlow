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

## Admin Access

This app is for internal use only, so every unlocked session has full admin rights.

- **Master PIN**: the default PIN is `7860`. Change it from the lock screen or from **Admin → Master PIN & Session**. The PIN is 4–6 digits and is stored in the browser's localStorage.
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
