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
