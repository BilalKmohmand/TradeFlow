# Sarmaya — Pakistani Bulk Trading & Logistics System

A localised bulk-trading operations dashboard built for Pakistani commodity traders. Manage customers, suppliers, products, bookings, truck dispatches, ledger balances and automated WhatsApp alerts — with all currency in Pakistani Rupees (PKR).

## Features

- **Customer & Supplier CRM** with Pakistani contact defaults (`+92` phones, `.com.pk` emails, local berths).
- **Commodity / Product inventory** with stock tonnage and low-stock alerts.
- **Bulk Bookings** in tons with live remaining-balance tracking.
- **Dispatch Logging** per truck with driver, vehicle number and WhatsApp dispatch alert.
- **Ledger** for customer receivables and supplier payables.
- **Reports** with daily / monthly CSV export and charts.
- **Supabase-backed** real-time data sync.
- **PKR Currency** formatting and localised `en-PK` numbers.
- **Light / Dark mode** with automatic time-based switching.
- **Admin Control Center** (PIN-protected) — change the master PIN, delete any customer / supplier / product / booking / dispatch / ledger row, purge whole tables, export & import JSON backups, factory reset, and review the audit log.

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
