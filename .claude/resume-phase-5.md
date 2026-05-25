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

Implement these in this order: 46 first (foundation), then 8 and 21 in
parallel (both consume templates), then 14 last (needs the same storage
bucket pattern but a different channel).

- **Item 46 — WhatsApp template manager in Admin Tools**
  Admins maintain a small library of pre-canned WhatsApp message
  templates with placeholder variables (`{{studentName}}`, `{{pending}}`,
  `{{dueDate}}`, `{{className}}`, `{{fatherName}}`). New table
  `whatsapp_templates` keyed by `id, name, body, placeholders[]`,
  RLS for admin-only write, staff-read. Surface as a CRUD page under
  `/protected/admin-tools/whatsapp-templates`. Provide 3 seed templates
  (Friendly reminder / Final reminder / Receipt confirmation).

- **Item 8 — Bulk WhatsApp drafts from defaulters**
  In the defaulters list, multi-select rows → "Send WhatsApp to N
  parents" → opens a sheet that picks a template (item 46), shows a
  preview rendered with the first row's variables, then on confirm
  opens one `wa.me/<phone>?text=<rendered>` link per selected row in a
  new tab. Falls back to per-row WhatsApp draft modal (already exists)
  when only one row is selected.

- **Item 21 — Email / WhatsApp the receipt PDF**
  On the receipt detail page (and from the receipt preview sheet), add
  two action buttons next to "Save as PDF":
  - "WhatsApp to parent": opens `wa.me/<fatherPhone>?text=<receipt
    template>` with a templated message including the receipt number,
    amount, and a link to the public receipt URL (depends on Phase 10
    item 45 for the public link — for now just include the receipt
    number).
  - "Email to parent": only enabled if `students.email` is set; opens
    `mailto:<email>?subject=Receipt <number>&body=<template>` with the
    PDF attachment instruction. No server send in Phase 5; mailto is
    enough.

- **Item 14 — Voice-note attachment on defaulter contact log**
  Deferred from Phase 2. Add:
  - Supabase storage bucket `defaulter-voice-notes` (private,
    authenticated only). Apply via `mcp__supabase__apply_migration`.
  - New column `voice_note_path text null` on `defaulter_contacts`.
  - On the contact-log popover, a `<MediaRecorder>` button to record up
    to 60 seconds, preview, and upload before submit. Server action
    receives the storage path and stores it on the row.
  - In the contact log timeline (already rendered in
    `ContactStatusChip`'s expanded view), play back via a signed URL.

# Phase 6 item definitions (admin productivity)

- **Item 34 — Resume failed import from row N**
  When a staged import batch fails midway, the import detail page shows
  a "Resume from row N" button that re-runs the commit pipeline
  starting at the last successful row. Use the existing `import_rows`
  status column; mark already-committed rows so they're skipped on
  re-run. Idempotent so a double-tap is safe.

- **Item 35 — Column-mapping memory across imports**
  When uploading a spreadsheet, the column-mapping step remembers the
  last successful mapping for files with the same column headers. Use
  `localStorage` keyed on a hash of the headers (sorted + joined). Show
  "Auto-filled from your last import" hint at the top of the mapping
  step.

- **Item 36 — Pre-import duplicate audit**
  Before the row-by-row review step, run a fast scan over the staged
  rows looking for matches against existing students by (full_name +
  father_name) and by (primary_phone or secondary_phone). Surface as a
  yellow panel listing the candidates with a "Mark as update / mark as
  duplicate / proceed as new" action. Persists choices into the row
  metadata so the commit step honours them.

- **Item 38 — Scheduled exports via email**
  Admins schedule a recurring export (defaulters / day-collection /
  any saved view from item 28). New table `export_schedules` keyed by
  `id, owner, schedule (cron), export_type, recipients[], saved_view_id
  ?, last_run_at`. Vercel cron route at
  `/api/cron/scheduled-exports` runs daily; the matching schedules
  generate their XLSX and email it via the existing email provider
  (find it; if none, hold this item and flag).

- **Item 39 — PDF export format alongside XLSX**
  Each export endpoint that today returns XLSX gets an optional
  `?format=pdf` query that returns a PDF version (printable table).
  Use `puppeteer-core` + `chromium-min` on the server, OR a simpler
  HTML-to-PDF library if available; if neither is acceptable, expose a
  client-side `window.print()` route that renders the table as an
  HTML page and lets the browser save as PDF (similar to Phase 3 item
  23 pattern).

- **Item 42 — Recent activity feed per user**
  New table `user_activity_events` (`id, user_id, kind, ref_id,
  payload jsonb, created_at`) capturing: payment posted, receipt
  printed, student edited, export downloaded, defaulter contacted.
  Insert from existing action handlers (one line each). Surface as a
  bottom strip on the dashboard ("Today: 12 receipts, 1 edit, 1
  export") plus a full feed under `/protected/admin-tools/activity`.

- **Item 54 — Last-viewed timestamp on student rows**
  Use the `user_activity_events` from item 42, kind `student_view`
  inserted when a student profile is opened. In the student list, show
  a faint `Last viewed by you: 2 hrs ago` line on rows you've recently
  opened. Helps admins remember which records they've already touched.

# Phase 7 item definitions (student management)

- **Item 50 — Bulk student edit**
  In the students list, a multi-select column (checkboxes) plus a
  "Bulk edit" action bar that becomes visible when ≥1 row is selected.
  Lets admin bulk-update class, transport route, or status (active /
  inactive / left / graduated). Server action validates the change
  against fee setup and triggers `syncAfterStudentChange` for each.
  Audit each change to `user_activity_events` (Phase 6).

- **Item 52 — Photo upload for student ID**
  Storage bucket `student-photos` (private), new column
  `students.photo_path text null`. Upload UI on the student form
  (camera or file picker). Display a circular avatar in the student
  list rows + identity strip. Tiny — under 200 KB on upload (resize
  client-side). Optional field; no functional impact when missing.

- **Item 53 — Fee Setup time-travel**
  On Fee Setup, add a date picker "What was the setup on
  <yyyy-mm-dd>?". Reads from `audit_logs` (already captures
  before/after snapshots of fee_policy_configs and student_fee_overrides)
  and renders a read-only view of the policy as of that date. Useful
  for the year-end accounting questions.

# Phase 8 item definitions (year-end)

- **Item 18 — Bulk class promotion wizard**
  3-step wizard:
  1. Promotion preview — group all active students by current class,
     suggest next class (Class 8 → Class 9). Show withdrawn / failed
     exceptions for manual override.
  2. Apply — bulk-update `class_id` to next-year classes. The new
     session's fee setup auto-resolves via existing workbook logic.
  3. Summary — list affected students with a "Roll back" button that
     re-points them to their previous class (in case of mistake).
  All operations dry-run on the active session first. Require admin
  + an explicit "I have verified the next-year fee setup" checkbox.

- **Item 19 — Carry forward credit balances at promotion**
  Part of (or step 2.5 of) item 18. For any student with
  `creditBalance > 0` at promotion time, create an opening-credit
  row in the new session that nets against the first installment due.
  Surface in the promotion summary so admin can see who is starting
  the new year with credit, and how much.

# Phase 9 item definition (family payment) — its own session

- **Item 6 — Family / multi-student payment, re-enabled with allocation transparency**
  History: an earlier `disable_family_payments` migration shut this
  off. Read that migration first to understand what went wrong, then
  rebuild with:
  - One payment amount + one mode + one (or per-child) receipts.
  - Splits across siblings using each child's pending share (or
    admin-tweaked split with a slider per child).
  - One combined receipt PDF with a per-child breakdown, plus
    optional per-child receipts.
  - Reuses the sibling-linker work from Phase 3.
  Ship behind a feature flag, test on TEST-2026-27 for a week, then
  flip on in prod.

# Phase 10 item definitions (long-tail, each its own time)

- **Item 43 — Offline draft for Collect**
  Service Worker + IndexedDB. If WiFi drops while the staff is typing
  in the Collect drawer, the draft (selected student id, amount, mode,
  date, note) saves locally. When connectivity returns, a banner
  prompts to post the queued payment. No silent auto-post — the
  banner makes the staff confirm.

- **Item 45 — Read-only parent share link (signed URL)**
  Admin generates a tokened, read-only URL that shows a single
  student's dues + receipts (no login). Token signed with
  `SUPABASE_JWT_SECRET` or similar, 90-day expiry, revocable. Surface
  the link as a "Share with parent" button on the student profile.
  Drastically cuts the "send me the receipt" calls.

- **Item 47 — PWA install prompt for office tablet**
  Depends on item 43 (Service Worker). Add a manifest install handler
  + a banner when the staff visits the app on a touch device for the
  ≥3rd time, prompting "Install on home screen". Turns the app into a
  kiosk for parents-in-hallway collection.

- **Item 48 — Nightly snapshot CSV backup**
  Vercel cron at `/api/cron/nightly-backup`. Dumps the night's tables
  (students, payments, receipts, fee_policy_configs, audit_logs) as
  CSV, packages them as a single ZIP, drops to a configured destination
  (Supabase storage bucket + optional admin email). Own backup beyond
  Supabase's, gives the school physical peace of mind.

# How I want you to work

1. **Item definitions for Phases 5–10 are baked into this file.** Don't
   ask for clarifications — proceed.
2. Apply changes to both **mobile and desktop** where applicable.
3. After each phase: run **typecheck + lint + build**, then **commit
   and push to origin/main**. Don't skip the push — Vercel deploys
   from main and a previous miss caused a "Supabase Preview failed"
   incident.
4. If you apply any DB migration via the Supabase MCP, **immediately**
   call `mcp__supabase__list_migrations` and write the local
   `supabase/migrations/<remote-timestamp>_<name>.sql` file with the
   exact remote timestamp.
5. **Don't wait for my input between phases.** Continue Phase 5 → 6 → 7
   while context holds. Phases 8 and 9 each deserve their own session
   (year-end is high-stakes; family-payment is the biggest single
   feature) — stop and write a fresh resume prompt before starting them.
6. **Stop honestly** if the next phase requires more focus than you
   can give. When you stop, write a fresh `.claude/resume-phase-N.md`
   in this exact format, with definitions for the remaining phases
   carried over so future sessions never get stuck for lack of context.
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

Confirm `dbf2baa` (Phase 4) is the latest on main. Then start Phase 5
top-to-bottom (items 46, 8, 21, 14 in that order). Continue into
Phase 6 then Phase 7 if context allows.

Before starting Phase 8 or 9, stop and write a fresh
`.claude/resume-phase-N.md` file in this same format. The remaining
item definitions are already baked in below — carry them forward
into the new file so the user never has to re-explain anything.

The resume-prompt pattern, recapped:
- Every stop produces a fresh `.claude/resume-phase-N.md` with full
  phase plan, shipped commits + SHAs, remaining-phase item
  definitions, working preferences, conventions, and test failures
  to ignore.
- The user pastes a one-line pointer prompt ("Read
  `.claude/resume-phase-N.md` and continue") in the next session.
- No information is ever lost between sessions.
