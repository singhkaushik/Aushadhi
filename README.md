# Aushadhi (offline)

Offline billing, inventory and accounting for a pharma distribution agency, built with Next.js and SQLite. It covers purchase and sale with batch, expiry and GST, plus accounts and reports. Everything is stored in one local file, `data/pharma.db`, and no internet is needed.

## Run on Windows (browser)
Double-click `start-erp.bat`. It installs, builds and opens http://localhost:3000.

Or run it manually:
```
npm install
npm run build
npm start
```
For development, use `npm run dev`.

## Desktop app (Electron + nextron layout)
The project follows the nextron structure: `main/` holds the Electron main
process and `renderer/` holds the Next.js app.

```
npm run desktop   # dev mode: hot-reload in an Electron window
npm run dist      # production: builds installer + portable exe into dist/
```

In the packaged app the database lives in the OS user-data folder
(`%APPDATA%/aushadhi/data/pharma.db`), and the embedded Next server
listens on a random localhost port. Because the app uses server-side
rendering, API routes and SQLite, the desktop build ships the standalone
Next server (not a static export) — `nextron build` is therefore not used;
`scripts/build-desktop.mjs` performs the equivalent steps instead.

## Features
- **Masters**: parties and ledgers (GSTIN, DL no, state, credit days, opening balance), and items (company, salt, pack, HSN, GST, MRP/PTR/PTS, rack, schedule, min stock). Each item has batch-wise opening stock.
- **Vouchers**: Sale, Purchase, Sale Return, Purchase Return, Receipt, Payment and Journal.
  - Batch and expiry on every line, plus free quantity, discount %, and CGST/SGST or IGST chosen automatically from the state or GSTIN.
  - Totals are rounded off, and the app blocks sales that would take stock negative.
  - Vouchers can be edited or deleted, and stock and ledgers are reversed automatically.
- **Printing**: A4 GST invoice with an amount-in-words line.
- **Reports**: Stock (item- or batch-wise), Expiry and near-expiry, Reorder, bill-wise Outstanding with ageing (FIFO), Ledger, Sale and Purchase registers, Day Book, GST summary (HSN, B2B/B2C, 3B), Trial Balance, P&L and Balance Sheet.
- **Marg import**: Excel or CSV exports of parties, items and batch-wise stock, with header auto-detection and column mapping.
- **Backup and restore** of the database file.
- **Keyboard**: F2 Sale, F3 Purchase, F6 Receipt, F7 Payment, Enter moves to the next field, Ctrl+S saves.

Set `DB_PATH` to store the database somewhere else.

## v2 features
- **Login & roles:** first login `admin` / `admin` (change it under Change Password). Roles: Admin (everything), Billing (create/edit bills, no delete/settings/import/backup), Viewer (read-only).
- **Orders & challans:** Sale Order, Purchase Order, Delivery Challan. Open documents are listed under *Pending Orders / Challans* and convert into a bill in one click. Challans reduce stock; orders don't.
- **Financial-year numbering:** bill numbers restart every 1 April.
- **Schemes & discounts:** item scheme (e.g. 10 + 1 free) auto-fills free qty; party default discount auto-fills Disc%.
- **Salesmen / areas:** salesman master, area/pincode on parties, *Sales Analysis* by item, company, party, area, city, salesman or month, with profit.
- **Barcode billing:** scan a barcode into the item box to pick the item and its first batch.
- **Thermal printing:** 80 mm receipt from the voucher view.
- **E-invoice / e-way bill JSON:** download from a sale voucher view; verify on the NIC portal before filing.
