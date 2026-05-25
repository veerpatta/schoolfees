# Resume prompt — Phase 5 of VPPS school fees admin app overhaul

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
    batch-reprint page with auto-print + auto-close.
  - Item 23: `ReceiptPrintActions` Save-as-PDF button.
  - Item 49: `StudentReceiptsPanel` with By-session / Timeline toggle.
- **Phase 4** — commit `dbf2baa` — items 24, 25, 26, 28, 29, 30, 32,
  37, 41, 44:
  - Item 24: Next-action chip strip on student profile (Collect ₹X /
    Call Father / Print latest receipt / WhatsApp dues with pre-filled
    message). In `components/students/student-identity-strip.tsx`.
  - Item 25: Sticky top-strip on student profile that pins below the
    main header on scroll (`components/students/student-sticky-header.tsx`).
  - Item 26: Today strip above Transactions filters (server-side fetch
    via `getWorkbookTransactions({todayOnly:true})`, rendered in
    `components/transactions/transactions-client-shell.tsx`).
  - Item 28: SavedViewsTabs now tracks `activeSavedViewId` so recalled
    views stay highlighted; any filter edit deselects them. The
    existing `lib/data-table/saved-views.ts` localStorage persistence
    was kept (no DB migration needed; the per-device behaviour matches
    how a small office uses the app).
  - Item 29: SummaryRow footer now shows Σ Amount or Σ Pending + Σ Paid
    summed across visible rows.
  - Item 30: Today-collection KPI gets a delta line "▲ 12% vs Tue avg"
    computed in `lib/dashboard/kpi-delta.ts` from the same-weekday
    average of `collectionTrend` (which is now exposed by
    `getDashboardAboveFoldData`).
  - Item 32: Route-wise collection section on the dashboard backed by
    `getRouteCollectionSummary` in `lib/dashboard/data.ts`.
  - Item 37: `lib/helpers/export.ts` `formatExportName` helper applied
    to all four export routes (exports/[exportType], transactions/export,
    finance-controls/export, reports/export via `buildCsvFilename`).
  - Item 41: `lib/dashboard/optimistic-counters.ts` (localStorage queue
    + custom `vpps:payment-posted` event), pushed from payment-desk on
    success and surfaced as a banner via
    `components/dashboard/optimistic-banner.tsx` on the dashboard.
  - Item 44: Admin-only `components/dashboard/anomaly-toaster.tsx`
    using `lib/dashboard/anomaly-rules.ts` (price-spike + same-day-dupe
    rules). Late-fee-waiver burst rule was skipped because the dashboard
    summary doesn't surface waiver counts; flag if you'd like that added.

# Phase plan (the 10-phase tier list)

- Phase 5 — messaging foundation (items 46, 8, 21, 14). **Next up.**
- Phase 6 — admin productivity (items 34, 35, 36, 38, 39, 42, 54)
- Phase 7 — student management (items 50, 52, 53)
- Phase 8 — year-end (items 18, 19) — high-stakes, dry-run on
  TEST-2026-27 before applying to prod
- Phase 9 — family / multi-student payment (item 6)
- Phase 10 — long-tail (items 43, 45, 47, 48)

# Phase 5 item definitions

**These need to be baked in before this session can run.** The Phase 4
session got definitions for items 24, 25, 26, 28, 29, 30, 32, 37, 41,
44 in the resume file. The next session needs the same for items 46,
8, 21, 14. Without them I would be guessing what each item means and
risk shipping the wrong thing.

Item 14 specifically was deferred from Phase 2 with the note "needs the
storage bucket" — that's voice notes on defaulter contact attempts, so
it likely needs:

- a Supabase storage bucket (private, only authenticated staff)
- a column on `defaulter_contacts` for the audio reference
- recording + upload UI on the defaulter row
- playback in the contact log

Items 8, 21, 46 — paste the same kind of "item X — short title — what
to build" entries you used for Phase 4.

# How I want you to work

1. Confirm Phase 5 item meanings before starting (the next session
   should refuse to start without them rather than guess).
2. Apply changes to both **mobile and desktop** where applicable.
3. After Phase 5: run **typecheck + lint + build**, then **commit and
   push to origin/main**. Don't skip the push — Vercel deploys from
   main and the previous miss caused a "Supabase Preview failed"
   incident.
4. If you apply any DB migration via the Supabase MCP, **immediately**
   call `mcp__supabase__list_migrations` and write the local
   `supabase/migrations/<remote-timestamp>_<name>.sql` file with the
   exact remote timestamp.
5. **Don't wait for my input between phases** once Phase 5 starts —
   continue to Phase 6 and 7 if context allows (those items also need
   definitions baked in). Phases 8, 9 each deserve their own session.
6. **Stop honestly** if the next phase requires more focus than you
   can give. When you stop, write a fresh resume prompt in this format.
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
  (Phase 3), `FamilyReceiptsBatchActions` (Phase 3),
  `StudentStickyHeader` (Phase 4), `NextActionStrip` (inline in
  StudentIdentityStrip, Phase 4), `OptimisticBanner` (Phase 4),
  `AnomalyToaster` (Phase 4), `RouteCollectionHeatmap` (Phase 4).
- `'left'` is the schema value for "withdrawn" students.
- 60ms is the agreed debounce for instant-feeling search.
- `ReceiptDocument` takes `embedPageStyles?: boolean` (defaults true;
  pass false when a parent page owns the `@page` rule).
- The `toast()` helper in `components/ui/toast.tsx` only accepts
  `{title, description?, action?}` — there's no `variant` prop. Phase 4
  anomaly toasts work by using a clear AlertTriangle icon in the
  Review action button rather than a colour-coded variant.
- `pushOptimisticPayment` from `lib/dashboard/optimistic-counters.ts`
  is the canonical way for any new posting path to notify the
  dashboard. Only the payment desk should ever post, but this is the
  event to dispatch from there.
- `lib/helpers/export.ts` `formatExportName(basename, "xlsx")` is the
  one-stop helper for any future export route filename.
- `MEMORY.md` and `memory/` under
  `C:\Users\janme\.claude\projects\C--Users-janme-Documents-schoolfees\`
  is still empty — start fresh if you want to persist anything.

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
git log --oneline -6
```

Confirm `dbf2baa` (Phase 4) is the latest on main. Then either bake
item definitions for Phase 5 into this file and re-launch, or proceed
with the item meanings the user provides in the prompt itself.

When you stop, write a fresh `resume-phase-N.md` file in the same
format so the next session can pick up cleanly.
