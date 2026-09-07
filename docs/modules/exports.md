# EXPORTS_GUIDE.md

## Purpose

Top-level office download center for XLSX files.

## Export Categories

- Students
- Fees / Dues
- Payments
- Admin / Setup (as available)
- Conventional discount reports

## Current Common Exports

All eleven `exportType` values, from `src/modules/exports/data/ai-context-bundle.ts`:

- `all-students`
- `student-master` — the full student record, including the 25 optional
  information fields; treat the download as an identity document
- `class-wise-dues`
- `defaulters` (filtered exports match the on-screen Defaulters filters)
- `receipt-register`
- `conventional-discount-students`
- `previous-year-dues` — carry-forward balances
- `left-student-dues` — students who left still owing
- `emi-plans` — active repayment plans
- `emi-schedule` — the monthly calendar behind them
- **`ai-context-bundle`** — see below

Exports stream **all rows**; there is no page cap.

## AI context bundle

A single multi-sheet XLSX designed to feed an LLM with the full live picture,
self-describing so a model needs no extra context:

- `_README` — data dictionary: explains the three reductions (tuition discount
  vs discount-mode write-off vs late-fee waiver), that discounts are never
  counted as paid, and that every sheet joins on **SR no** (admission number).
- `Students` (all statuses — active/inactive/graduated), `Installments`,
  `Payments`, `Adjustments` (append-only corrections/reversals incl. refunds),
  `Refunds`, `Classes`, `Routes`, `Discounts`, `Defaulters`,
  `Recovery Follow-Up`, `Previous Year Dues`, `Left Student Recovery`,
  `EMI Plans`, `EMI Schedule`, `Sessions`.

The `Students` sheet carries the student-information fields and keeps fees
pending separate from late fee pending. The EMI sheets are required to interpret
whether a family is on track against an agreed monthly calendar.

The recovery sheets use the same read models as Defaulters and Admin Tools:
contact/promise/no-call context for active defaulters, carry-forward balances
for previous-year dues, and collectable balances for left/graduated/inactive
students.

Source: `src/modules/exports/data/ai-context-bundle.ts` (`aiContextBundleResponse`).

## Grouped workbooks

`workbookResponse` writes a single sheet called `Export`, which is right for a
flat list and wrong for a set of lists somebody hands out one at a time.
`groupedWorkbookResponse(filename, sheets)` writes one sheet per group, and
`safeSheetName` enforces the rules Excel will otherwise refuse to open a file
over: 31 characters, none of `[]:*?/\`, non-empty, unique. Both live in
`src/modules/exports/data/responses.ts`.

The first consumer is `/protected/reminders/lists/export` — the fee-collection
lists, one tab per class or route. See `docs/modules/whatsapp-reminders.md`.

## File Quality Expectations

- office-friendly filename pattern
- understandable column headers
- filter-aware and reconcilable with on-screen tables
- **every export streams all rows — no page caps.** Student exports use
  `getAllStudents()` (walks every page) and workbook-backed exports pass
  `exportAll: true`. `getStudents()` stays page-bounded for search only.

## Usage Notes

- prefer Exports for official sharing/office archive copies
- reconcile against Transactions/Dashboard when needed
- do not treat exports as a replacement for append-only system record
