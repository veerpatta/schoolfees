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

- all students
- class-wise dues
- defaulters (filtered exports match the on-screen Defaulters filters)
- receipt register
- conventional discount students
- **AI context bundle** (`ai-context-bundle`) — see below

## AI context bundle

A single multi-sheet XLSX designed to feed an LLM with the full live picture,
self-describing so a model needs no extra context:

- `_README` — data dictionary: explains the three reductions (tuition discount
  vs discount-mode write-off vs late-fee waiver), that discounts are never
  counted as paid, and that every sheet joins on **SR no** (admission number).
- `Students` (all statuses — active/inactive/graduated), `Installments`,
  `Payments`, `Adjustments` (append-only corrections/reversals incl. refunds),
  `Refunds`, `Classes`, `Routes`, `Discounts`, `Defaulters`, `Sessions`.

Source: `app/protected/exports/[exportType]/route.ts` (`aiContextBundleResponse`).

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
