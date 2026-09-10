# Sarmaya — function-by-function guide

This is the "what does each part do" reference for the Simple Billing build. It follows the code: first the data rules, then every function in the context, then every screen and dialog, then the reports and printouts.

## 1. The five things the app keeps

| Thing | Where it lives | What it means |
|---|---|---|
| **Item** (`Product`) | Items & Prices | Something you sell. `name`, `unit` (can, tin, bag, kg…), `unitPricePerKg` = the fixed selling price per unit, `costPricePerKg` (optional, for profit), `stockKg` = stock on hand in that unit, `minThresholdKg` = low-stock warning level. |
| **Customer** | Customers | Who you sell to. `totalDue` = what they owe you right now, across all bills. |
| **Supplier** | Suppliers | Who you buy from. `totalOwed` = what you owe them. |
| **Bill** (`Invoice`) | Bills | One sale. Lines (`items[]` with `qty`, `unitPrice`, `amount`), `subtotal`, `discount`, `taxAmount`, `totalAmount`, `paidAmount`, `balanceDue`, `payments[]`, `paymentMethod`, `billKind` = `cash` (fully paid) or `credit`. Numbered `INV-1`, `INV-2`… printed as *Invoice #1*. |
| **Money movements** | Daily Sheet / Money | Three sources feed one cash book: **ledger** payments (customer payments in, supplier payments out), **expenses** (out, unless "Credit (unpaid)"), and **cash entries** (manual in/out and cash↔bank transfers). The payment *method* decides whether it hits cash or bank: anything starting with "Cash" is cash in hand; Bank Transfer, Cheque, Easypaisa / JazzCash, Card are bank. |

Everything is saved in the browser immediately (localStorage) and, when Supabase is configured, upserted to the cloud table of the same name. Bills use the `invoices` table (migration `supabase/migrate_v8_simple_billing.sql`).

## 2. Context functions (`src/context/TradingContext.tsx`)

These are the actions the screens call. Each one does *all* the bookkeeping so a screen never has to.

### `createBill(input)`
Input: `customerId` (or `newCustomer: {name, phone}` to create one on the spot), `items[{productId, name, qty, unitPrice, unit}]`, `discount`, `paidNow`, `paymentMethod`, `notes`, `date`.

1. Drops lines with no item or zero qty; refuses an empty bill or unknown customer.
2. Maths: `subtotal = Σ qty × unitPrice`; `discount` capped at subtotal; tax = (subtotal − discount) × `settings.taxRatePct` (0 by default); `total = subtotal − discount + tax`; `paid = min(paidNow, total)`; `balance = total − paid`.
3. Number: `nextBillNumber()` = highest trailing number of any existing bill + 1.
4. Saves the bill with status `paid` / `partial` / `issued` and `billKind` `cash` / `credit`.
5. **Stock**: each item's `stockKg` goes down by qty (can go negative = oversold, which then shows as low stock).
6. **Customer account**: `totalDue += total − paid`.
7. **Ledger**: a `bill_issued` debit for the total and, if anything was paid, a `payment_received` credit whose description is `Payment received: <method> - Bill INV-n` — the cash book reads the method out of that text.
8. Audit-log entry. Returns `{success, message, invoice}` so the dialog can print it.

### `payBill(invoiceId, amount, method, notes?, date?)`
Refuses zero or more than the remaining balance. Adds a payment record to the bill, updates `paidAmount` / `balanceDue` / status (`partial` → `paid`), reduces the customer's `totalDue`, writes a `payment_received` ledger line with the method (so it lands in cash or bank), logs it.

### `deleteBill(invoiceId)`
Full reversal: stock goes back on each item, the *unpaid* part comes off the customer's `totalDue`, every ledger line that references the bill number (the bill itself and all its payments) is removed locally and from the cloud, then the bill is removed. Admin/delete permission only.

### `addCashTransfer({amount, from: 'cash'|'bank', date?, note?})`
Writes two cash entries — an *out* on the side you took from and an *in* on the other side — so the cash book shows both legs and the total money never changes. Descriptions: "Deposited cash to bank" or "Withdrew cash from bank".

### `recordCustomerPayment(customerId, amount, notes)`
Money received against the customer's whole account rather than one bill (old dues). The Receive dialog passes the method in the note so it reaches the right side of the cash book. Sends a WhatsApp acknowledgement to the log.

### `recordSupplierPayment(supplierId, amount, notes)`
Same for money you pay a supplier: reduces `totalOwed`, writes a `payment_made` ledger line.

### `addExpense(data)` / `deleteExpense(id)`
An expense has `category` (Day-to-day, Employee, Food, Owner drawings, Bank charges, plus the transport/fuel/rent… ones), `amount`, `description`, `paidVia`. "Credit (unpaid)" means it is owed, not paid — it shows under *You owe* on Money and never touches cash.

### `addProduct` / `updateProduct` / `deleteProduct`
Plain CRUD for items. A price change through `updateProduct` is recorded in price history.

### `addCustomer` / `updateCustomer` / `deleteCustomer`, `addSupplier` / …
Plain CRUD; deletes cascade through bookings, ledger and bills that reference them.

### `updateSettings(partial)`
Company profile (name, address, phone, tax id printed on bills), `taxRatePct`, `appMode` (`billing` or `trading`), `cashOpeningBalance`, `openingBankBalance`, `cashOpeningDate` (the date from which cash and bank are counted).

### `purgeTable`, `exportSystemBackup`, `importSystemBackup`, `factoryResetAllData`
Admin tools. Backups now include `invoices`. Factory reset clears bills too.

### Unchanged trading-suite functions
`createBooking`, `createDispatch`, `receivePurchase`, quotations, purchase orders, returns, stock adjustments, tasks, fleet, users/roles/permissions, audit log — all still exist and drive the trading screens when `appMode` is `trading`.

## 3. Pure helpers (`src/utils/`)

| Function | File | Does |
|---|---|---|
| `collectCashMovements(ledger, expenses, cashEntries, customers, suppliers)` | finance.ts | Turns the three money sources into one list of dated in/out movements with a `method`. |
| `accountBalancesOn(movements, settings, date)` | finance.ts | Cash in hand and bank balance on a date: opening balances + every movement since `cashOpeningDate`, split by method. |
| `positionSummary(customers, suppliers, expenses, balances)` | finance.ts | `receivables` (customers owe), `payables` (suppliers owed + unpaid expenses), `netPosition` = cash + bank + receivables − payables = "money in business". |
| `daySummary(invoices, movements, date)` | billing.ts | Bill count, sales, cash received, expenses, supplier payments and credit given for one day. |
| `buildDailySheet(sources, date)` | billing.ts | The whole day: opening/closing cash & bank, bills, receipts, expenses grouped by category, supplier payments, transfers, cash-in/out and bank-in/out totals. |
| `groupExpenses(expenses)` | billing.ts | Groups by category with labels and totals (the "sheets"). |
| `filterBills(invoices, query, period, today, unpaidOnly)` | billing.ts | Search by number, customer, phone or item; Today / 7 days / Month / All; unpaid only; newest first. |
| `nextBillNumber(invoices)` | TradingContext.tsx | Next sequential number. |
| `lineQty(item)` / `linePrice(item)` | billing.ts | Read qty and price from a bill line, falling back to the kg fields of older invoices. |
| `isCashMethod(method)` | types.ts | Cash vs bank decision used everywhere. |

## 4. Screens (`src/screens/billing/`)

### Home (`BillingHomeScreen`)
Four tiles: **Sales today**, **Cash received today**, **Expenses today**, **Money in business** (each opens the matching screen). Four buttons: New Bill, Add expense, Receive payment, Cash ↔ Bank, plus Daily sheet. Recent bills (tap to open). "Money now" card with cash, bank, owed to you, you owe. "Needs attention" lists unpaid bills and low-stock items.

### Bills (`BillsScreen`)
Search box, period chips, Unpaid toggle, CSV download. Each row: customer, number, date, items, total, Paid / due. Printer icon prints straight away; tapping the row opens the bill.

### Daily Sheet (`DailySheetScreen`)
Date picker with previous/next day. Tiles: opening cash, cash in, cash out, closing cash (bank figures underneath). Quick buttons. Four panels: Bills, Money received, Expenses (with per-category "+" chips), Suppliers paid & other. Delete "✕" on expenses and manual entries (permission-gated). **Print** opens the daily-sheet printout.

### Money (`MoneyScreen`)
*Overview*: cash, bank, others owe you, you owe others; net position with the formula spelled out; Cash ↔ Bank, Receive and Opening balances buttons; the debtor list (Receive + statement print per customer) and the creditor list (suppliers + unpaid expenses). *Expense sheets*: one card per category for a chosen month. *Cash book*: every movement in a month with in/out totals.

### Items & Prices (`ItemsScreen`)
Table of items with price, stock (red with a warning when at or below the low-stock level) and all-time sold quantity. Edit and delete per row; New item.

### Customers, Suppliers, Admin
The existing screens. Admin → **System & Backups** holds the company profile, app mode, opening balances, backups and factory reset.

## 5. Dialogs (`src/components/billing/`)

| Dialog | Opened from | What it does |
|---|---|---|
| **New Bill** (`NewBillModal`) | Home, Bills, Daily Sheet | Customer dropdown or **New** (name + phone typed inline); date; item rows — picking an item fills its price, qty and price are editable, amount is live; Add another item; discount; totals box with Paid now (**Full** button) and method; Save / Save & Print. Validation messages appear at the top. |
| **Bill detail** (`BillDetailModal`) | Any bill row | Lines table; Total / Paid / Balance / customer's overall due; payment history; **Receive payment** form (amount with Full, method, note) while a balance remains; Print, WhatsApp (opens wa.me with the bill text), Delete (confirm dialog). |
| **Add expense** (`ExpenseModal`) | Home, Daily Sheet, Money | What for, amount, category, date, paid from. |
| **Receive payment** (`ReceiveModal`) | Home, Daily Sheet, Money | Customer (sorted by what they owe), amount with Full, method, note. |
| **Cash ↔ Bank** (`TransferModal`) | Home, Daily Sheet, Money | Deposit to bank or withdraw cash, amount, date, note. |
| **Item** (`ItemModal`) | Items | Name, sold-per unit, selling price, cost price, stock, low-stock level. |

All dialogs are hosted once by `BillingUIProvider`; screens call `useBillingUI().newBill()` etc. Each open remounts the dialog so it always starts clean. Escape closes only the top-most layer.

## 6. Printouts (`src/components/PrintDocument.tsx`)

- **Bill** (`type: 'bill'`): company header, *INVOICE*, *Invoice #n*, date; Bill From / Bill To; dark table header Description · Qty · Price · Amount; Subtotal, Discount, Tax (if any), **Total Rs.**, Paid (method), Balance due or *PAID IN FULL*; the customer's total outstanding; signature lines.
- **Daily sheet** (`type: 'daily_sheet'`): opening/in/out/closing for cash and bank, then Bills, Money received, Expenses by category, Suppliers paid & transfers; Prepared by / Checked by.
- Customer **statement** (from Money → printer icon) and the existing vouchers, challans and trading invoices are unchanged.

"Print / Save PDF" uses the browser print dialog; only the document area prints.

## 7. Navigation and modes

`settings.appMode` (default `billing`) picks the navigation and the Home / Items screens. Billing nav: Home, Bills, Daily Sheet, Customers, Suppliers, Items & Prices, Money, Admin. On phones the same items sit in a two-row grid under the header. Trading nav and screens appear when the mode is `trading`.

## 8. Tests

- `src/__tests__/billing.test.tsx` — bill maths against the client's sample invoice (300 × 2,065 + 300 × 1,037.5 + 40 × 6,535 = 1,192,150), stock and customer effects, discount and cash-book routing by method, sequential numbering, part payments and refusal of over-payment, delete reversal, cash↔bank transfer, the daily sheet's opening/closing/grouping, the money position, and bill filtering.
- `e2e/billing.spec.ts` — the full desktop flow and a 390px phone flow in real Chrome, with screenshots in `e2e/screenshots/billing-*.png`.
- `npm run check` builds, type-checks, runs unit tests and all Playwright specs.
