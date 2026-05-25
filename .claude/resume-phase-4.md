# Resume prompt — Phase 4 of VPPS school fees admin app overhaul

Continue the 10-phase overhaul I planned earlier. The app lives at
`C:\Users\janme\Documents\schoolfees`, runs Next.js 16 App Router +
Supabase, and is in production for AY 2026-27 with 479 students. Use
`TEST-2026-27` for any testing — never touch `2026-27` data directly.

# What's already shipped (verify with `git log` on main)

- **Phase 1** — commit `4053991` — items 22, 27, 31, 40, 51. Items 24,
  25, 26, 29, 30, 37 were deferred into Phase 4.
- **Phase 2** — commit `de52399` — items 10, 12, 13 shipped via
  ContactStatusChip. Items 9, 11 were already wired by existing cadence
  tabs. Item 14 (voice notes) moved to Phase 5 because it needs the
  storage bucket.
- **Phase 3** — commit `abd2445` — items 20, 23, 49 shipped:
  - Item 20: `/protected/students/family/[familyGroupId]/receipts`
    batch-reprint page with auto-print + auto-close, triggered from
    StudentFamilyPanel. `ReceiptDocument` gained an `embedPageStyles`
    prop so the batch page can own its A4 `@page` rule instead of
    inheriting the per-receipt 80mm thermal rule.
  - Item 23: `ReceiptPrintActions` now has a "Save as PDF" button next
    to "Print receipt" with an inline hint about the print-dialog
    destination dropdown. Same `window.print()` pipeline — no
    server-side PDF lib.
  - Item 49: `StudentReceiptsPanel` client component with a
    By session / Timeline toggle on the Receipts tab; timeline view
    flattens every receipt chronologically with year markers.

# Phase plan (the 10-phase tier list)

- Phase 4 — transactions + dashboard (items 28, 32, 41, 44 + deferred
  Phase 1 items 24, 25, 26, 29, 30, 37). **Next up.**
- Phase 5 — messaging foundation (items 46, 8, 21, 14) — needs new
  storage bucket + new table, deserves its own focused session
- Phase 6 — admin productivity (items 34, 35, 36, 38, 39, 42, 54)
- Phase 7 — student management (items 50, 52, 53)
- Phase 8 — year-end (items 18, 19) — high-stakes, dry-run on
  TEST-2026-27 before applying to prod
- Phase 9 — family / multi-student payment (item 6) — biggest single
  feature, has its own session
- Phase 10 — long-tail (items 43, 45, 47, 48)

# Phase 4 item definitions (from the original 54-item friction list)

These ten items make up Phase 4. Implement them in this order; the
chrome work (24, 25, 26, 29, 30, 37) gives quick momentum before the
two heavier items (28 saved views, 41 optimistic counters) and the
adjacent visualisations (32 route heatmap, 44 anomaly toasts).

- **Item 24 — Next-action strip on student profile**
  Under the student name, render a row of primary actions:
  `[Collect ₹3,500] [Call Father] [Print latest receipt] [WhatsApp dues]`.
  Use `tel:` for Call; the existing Collect button for the first chip;
  the latest receipt id from the existing data for Print; a WhatsApp
  `wa.me/` link with a pre-filled dues message for the last. Both
  viewports.

- **Item 25 — Sticky student name on long-scroll profile**
  When the user scrolls the profile, a thin top strip stays pinned
  showing `Name · Class · SR · Pending`. `position: sticky; top: 56px`
  (mobile header height) on a small `<div>` placed just inside the
  page container. Hide on print.

- **Item 26 — Today strip pinned on Transactions**
  A small banner at the top of the Transactions page (above the
  filters) showing `Today · N receipts · ₹X · Cash X / UPI X / Bank X
  / Cheque X`. Counts come from the existing transactions data filtered
  to today; reuse `formatInr`. Both viewports.

- **Item 28 — Saved transaction filter views**
  Users can save the current filter combo (class, mode, date range,
  route) with a name like "My defaulter class list" or "Cash this
  week", and restore it with one click. Add a `saved_views_per_user`
  table keyed by user_id + table_key + name, with a JSONB column for
  the filter state. Surface as a "Save view" button next to the
  filter row, plus a dropdown of saved views to recall. The
  `SavedViewsTabs` component already exists for built-in views — extend
  it to support user-saved ones.

- **Item 29 — Sum row in filtered tables**
  When a filter narrows the Transactions table (or any read-only
  table), show a sticky footer row with `Σ amount` summing the visible
  rows. Should respect the active filter view. Desktop table footer
  + mobile a small summary line above pagination.

- **Item 30 — Period-over-period delta on KPIs**
  Each dashboard KPI card shows a delta line:
  `Today ₹47,800 (+12% vs Tue avg)` or `(-5% vs last week)`. Compute
  the comparator from the existing `collectionTrend` array — last
  7-day average for the same day-of-week, or last-month-same-day. Use
  a small up/down arrow + percentage with success/danger tones.

- **Item 32 — Route-wise collection heatmap**
  Same component pattern as the existing class heatmap but pivoted by
  transport_route. New section on the dashboard below the class
  heatmap. Each route shows total expected / collected / collection-%
  with a colour scale. Hidden when there are no transport routes
  configured.

- **Item 37 — Timestamped export filenames**
  Every XLSX/CSV download uses a filename like
  `defaulters_2026-05-25_1334.xlsx`. Find the export route(s) — the
  central one is `/protected/exports/[exportType]/route.ts` plus
  `/protected/transactions/export/route.ts`. Add a `formatExportName`
  helper in `lib/helpers/export.ts` that returns
  `<basename>_<YYYY-MM-DD>_<HHmm>.xlsx`. Apply at every download
  response.

- **Item 41 — Optimistic dashboard counters**
  When a payment is posted from the Payment Desk, bump the dashboard's
  Today collection / Receipts today counters in the client immediately
  (before the server-side revalidation lands). Use a global React
  context or `localStorage` event — the dashboard listens for a
  `vpps:payment-posted` custom event and adds the amount to the
  displayed number for the next 30 seconds, then refreshes.

- **Item 44 — Anomaly toasts for admins**
  Non-blocking toasts on the dashboard for admins when something
  unusual is recorded: receipt >3× the class average (price anomaly),
  same student paid twice in the same day, late fee waived >5 times
  in a week. Rules can be evaluated client-side on the existing
  recentPayments + class-summary data — no new backend. Use the
  existing `toast()` helper with a `variant: "warning"` and a
  `Review` button linking to the offending row.

# How I want you to work

1. After confirming the Phase 4 item meanings, work through them
   sequentially.
2. Apply changes to both **mobile and desktop** where applicable, in
   their respective patterns.
3. After Phase 4: run **typecheck + lint + build**, then **commit and
   push to origin/main**. Don't skip the push — Vercel deploys from
   main and the previous miss caused a "Supabase Preview failed"
   incident.
4. If you apply any DB migration via the Supabase MCP, **immediately**
   call `mcp__supabase__list_migrations` and write the local
   `supabase/migrations/<remote-timestamp>_<name>.sql` file with the
   exact remote timestamp.
5. **Don't wait for my input between phases** once Phase 4 starts —
   continue to Phase 6 and 7 if context allows. Phases 5, 8, 9 each
   deserve their own session.
6. **Stop honestly** if the next phase requires more focus than you
   can give in the remaining context budget. When you stop, write a
   fresh resume prompt in the same format as this one.
7. Maintain the safety rules from CLAUDE.md: never edit posted
   payments/receipts directly (use payment_adjustments), never expose
   SUPABASE_SERVICE_ROLE_KEY in browser code, no alternate
   payment-posting paths outside Payment Desk, etc.

# Project conventions worth remembering

- The workbook calculation puts academic fee fully in installment 1
  (verified in DB). A toggle to split equally exists in Fee Setup but
  defaults to first_only.
- `v_workbook_student_financials.discount_amount` already includes any
  conventional discount (RTE / Staff Child / 3rd Child) — don't add
  `conventionalDiscountAmount` on top in the Payment Desk UI.
- Defaulter contact log lives in `defaulter_contacts` (append-only,
  with `snooze_until`, `outcome`, `channel`).
  `getContactSummariesForStudents` already exposes `lastOutcome`,
  `noAnswerStreak`, `totalAttempts`.
- Shared components shipped across sessions: `StudentFinanceGlance`,
  `ContactStatusChip`, `ReceiptPreviewSheet`, `StudentReceiptsPanel`
  (new in Phase 3), `FamilyReceiptsBatchActions` (new in Phase 3).
- `'left'` is the schema value for "withdrawn" students.
- 60ms is the agreed debounce for instant-feeling search.
- `ReceiptDocument` now takes `embedPageStyles?: boolean` (defaults
  true; pass false when a parent page owns the `@page` rule).
- `MEMORY.md` and `memory/` under
  `C:\Users\janme\.claude\projects\C--Users-janme-Documents-schoolfees\`
  is empty — start fresh if you want to persist anything.

# Pre-existing test failures to ignore (verified against bare main)

These four test files fail identically on `main` and on any branch —
they're load-time/router-mounting issues unrelated to Phase work:

- `tests/ui/family-flow-links.test.tsx` — `Cannot find package
  'server-only'` import failure
- `tests/ui/students-sibling-pill.test.tsx` — `useRouter` not mounted
- `tests/integration/navigation.test.ts` — mobile nav fixture mismatch
- `tests/integration/payment-desk-workflow.test.ts` — confirm-receipt
  sheet allocation table fixture mismatch

# What to do first

```
git log --oneline -5
```

Confirm `abd2445` (Phase 3) is the latest, then implement Phase 4 in
the order listed above. The item descriptions are now complete in this
document — don't wait for further input.

After Phase 4 ships and is pushed, continue into Phase 6 (admin
productivity) and Phase 7 (student management) if context allows.
Phases 5, 8, 9 each deserve their own session.

When you stop, write a fresh `resume-phase-N.md` file in the same
format so the next session can pick up cleanly.
