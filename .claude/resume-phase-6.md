# Resume prompt — Phase 6 (remaining) of VPPS school fees admin app overhaul

Continue the 10-phase overhaul I planned earlier. The app lives at
`C:\Users\janme\Documents\schoolfees`, runs Next.js 16 App Router +
Supabase, and is in production for AY 2026-27 with 479 students. Use
`TEST-2026-27` for any testing — never touch `2026-27` data directly.

# What's already shipped (verify with `git log` on main)

- **Phase 1** — commit `4053991` — items 22, 27, 31, 40, 51.
- **Phase 2** — commit `de52399` — items 10, 12, 13 (ContactStatusChip).
- **Phase 3** — commit `abd2445` — items 20, 23, 49 (receipts/profile).
- **Phase 4** — commit `dbf2baa` — items 24, 25, 26, 28, 29, 30, 32, 37, 41, 44.
- **Phase 5** — commit `c303129` — items 46, 8, 21, 14:
  - Item 46: `whatsapp_templates` table + CRUD page under
    `/protected/admin-tools/whatsapp-templates` with 3 seed templates.
    Placeholders + live preview + category grouping.
  - Item 8: Multi-select checkboxes on the defaulters list,
    `BulkWhatsappProvider` with a floating action bar and a
    template-picker sheet that opens one `wa.me/<phone>?text=…` tab
    per parent.
  - Item 21: `ReceiptShareActions` on receipt detail + preview sheet.
    Adds WhatsApp + mailto buttons next to "Save as PDF", reusing
    receipt-category templates. New `students.email` column added by
    migration `20260525123312_add_student_email_column`.
  - Item 14: `defaulter-voice-notes` private storage bucket +
    `voice_note_path` column on `defaulter_contacts`. MediaRecorder
    UI in the contact popover (≤60 s, auto-upload on stop).
    `ContactLogTimelineButton` renders the recent attempts with
    signed-URL playback. New routes: `/protected/defaulters/voice-note`
    and `/protected/defaulters/contact-log`.

- **Phase 6 partial** — commit `d2ece1e` — items 42, 54, 35, 39:
  - Item 42: `user_activity_events` append-only table +
    `lib/activity/events.ts` helper (`recordActivity`,
    `getTodayActivityCounts`, `getLastEventByRef`, `listActivity`).
    Recorded from: payment posting (`postStudentPayment` success),
    student edit (`updateStudentAction`), student detail view
    (server component for `/protected/students/[studentId]`),
    export download (`/protected/exports/[exportType]` route),
    defaulter contact (`logContactAction`). Dashboard now renders an
    `ActivityStrip` ("Today: N payments, N edits, …"); full feed at
    `/protected/admin-tools/activity`.
  - Item 54: `lastViewedByUser` map flows from
    `app/protected/students/page.tsx` →
    `components/students/student-quick-load.tsx` →
    `components/students/student-list-table.tsx`. Faint "Last viewed
    by you N ago" line on both mobile card and desktop table rows.
    `lib/helpers/time-ago.ts` is the shared formatter.
  - Item 35: `components/imports/column-mapping-card.tsx` now
    persists/applies a localStorage mapping keyed by a header-set
    hash. Shows "Auto-filled from your last import" hint when the
    stored mapping is applied.
  - Item 39: `?format=pdf` on `/protected/exports/[exportType]`
    returns a printable HTML page that auto-triggers `window.print`.
    Exports page (`app/protected/exports/page.tsx`) shows both XLSX
    and PDF buttons per export. `printableHtmlResponse` +
    `rowsResponse` helpers in the route. Skipped for
    `ai-context-bundle` (too heavy for a print view).

# Phase plan (remaining)

- Phase 6 (still TODO) — items **34**, **36**, **38**.
- Phase 7 — items 50, 52, 53.
- Phase 8 — items 18, 19 (year-end, high-stakes — dry-run on
  TEST-2026-27 before applying to prod).
- Phase 9 — item 6 (family / multi-student payment — biggest single
  feature, deserves its own session).
- Phase 10 — items 43, 45, 47, 48 (long-tail).

# Phase 6 remaining item definitions

- **Item 34 — Resume failed import from row N**
  When a staged import batch fails midway, the import detail page
  shows a "Resume from row N" button that re-runs the commit pipeline
  starting at the last successful row. Use the existing `import_rows`
  status column; mark already-committed rows so they're skipped on
  re-run. Idempotent so a double-tap is safe.

  *Pointers:*
  - Commit handler: `app/protected/imports/actions.ts`
    (search for the `commit` action).
  - DB shape: `lib/import/types.ts` + the
    `student_import_workflow` migration.
  - The new UI button belongs in
    `components/imports/import-commit-card.tsx`.

- **Item 36 — Pre-import duplicate audit**
  Before the row-by-row review step, run a fast scan over staged rows
  looking for matches against existing students by
  `(full_name + father_name)` and by `(primary_phone or
  secondary_phone)`. Surface as a yellow panel listing candidates
  with a "Mark as update / mark as duplicate / proceed as new" action.
  Persists choices into the row metadata so the commit step honours
  them.

  *Pointers:*
  - Existing dry-run runs in `lib/import/dry-run.ts` (or similar).
  - `import_rows` row metadata is a `jsonb` column already used for
    notes/issues — extend it with a `duplicateDecision` field.
  - Place the panel in `components/imports/student-import-workflow.tsx`
    between the column-mapping step and the row review.

- **Item 38 — Scheduled exports via email**
  **HOLD AND FLAG.** No email provider is currently installed
  (no `resend`, `sendgrid`, `mailgun`, `nodemailer`, or `@aws-sdk/client-ses`
  in `package.json`). Per the original spec: "find it; if none, hold
  this item and flag." When picking this up:
  1. Confirm with the user which provider they want (Resend is the
     cheapest + simplest with Vercel; Postmark is the alternative).
  2. Install + add env vars (`RESEND_API_KEY` etc.).
  3. Then build:
     - New table `export_schedules` keyed by `id, owner, schedule
       (cron text), export_type, recipients[], saved_view_id?,
       last_run_at, is_active`.
     - Vercel cron at `/api/cron/scheduled-exports` daily.
     - Match schedules by cron + last_run_at, run the matching
       export, send the XLSX via email.
     - Admin UI under `/protected/admin-tools/scheduled-exports` to
       CRUD schedules.

# Phase 7 item definitions (student management)

- **Item 50 — Bulk student edit**
  In the students list, a multi-select column (checkboxes) plus a
  "Bulk edit" action bar that becomes visible when ≥1 row is
  selected. Lets admin bulk-update class, transport route, or status
  (active / inactive / left / graduated). Server action validates
  the change against fee setup and triggers `syncAfterStudentChange`
  for each. Audit each change to `user_activity_events` (already
  available from Phase 6 item 42).

- **Item 52 — Photo upload for student ID**
  Storage bucket `student-photos` (private), new column
  `students.photo_path text null`. Upload UI on the student form
  (camera or file picker). Display a circular avatar in the student
  list rows + identity strip. Tiny — under 200 KB on upload (resize
  client-side). Optional field; no functional impact when missing.
  Pattern mirrors `defaulter-voice-notes` bucket setup from Phase 5
  item 14 — copy the migration shape (private bucket, allowed mime
  types, staff-only read/upload).

- **Item 53 — Fee Setup time-travel**
  On Fee Setup, add a date picker "What was the setup on
  <yyyy-mm-dd>?". Reads from `audit_logs` (already captures
  before/after snapshots of `fee_policy_configs` and
  `student_fee_overrides`) and renders a read-only view of the policy
  as of that date. Useful for the year-end accounting questions.

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
  row in the new session that nets against the first installment
  due. Surface in the promotion summary so admin can see who is
  starting the new year with credit, and how much.

# Phase 9 item definition (family payment) — its own session

- **Item 6 — Family / multi-student payment, re-enabled with allocation transparency**
  History: an earlier `disable_family_payments` migration shut this
  off. Read that migration first to understand what went wrong,
  then rebuild with:
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
  Service Worker + IndexedDB. If WiFi drops while the staff is
  typing in the Collect drawer, the draft (selected student id,
  amount, mode, date, note) saves locally. When connectivity
  returns, a banner prompts to post the queued payment. No silent
  auto-post — the banner makes the staff confirm.

- **Item 45 — Read-only parent share link (signed URL)**
  Admin generates a tokened, read-only URL that shows a single
  student's dues + receipts (no login). Token signed with
  `SUPABASE_JWT_SECRET` or similar, 90-day expiry, revocable.
  Surface the link as a "Share with parent" button on the student
  profile. Drastically cuts the "send me the receipt" calls.

- **Item 47 — PWA install prompt for office tablet**
  Depends on item 43 (Service Worker). Add a manifest install
  handler + a banner when the staff visits the app on a touch
  device for the ≥3rd time, prompting "Install on home screen".
  Turns the app into a kiosk for parents-in-hallway collection.

- **Item 48 — Nightly snapshot CSV backup**
  Vercel cron at `/api/cron/nightly-backup`. Dumps the night's
  tables (students, payments, receipts, fee_policy_configs,
  audit_logs) as CSV, packages them as a single ZIP, drops to a
  configured destination (Supabase storage bucket + optional admin
  email). Own backup beyond Supabase's, gives the school physical
  peace of mind.

# How I want you to work

1. **Item definitions for Phases 6 (remaining) – 10 are baked into this
   file.** Don't ask for clarifications — proceed.
2. Apply changes to both **mobile and desktop** where applicable.
3. After each phase: run **typecheck + lint + build**, then **commit
   and push to origin/main**. Don't skip the push — Vercel deploys
   from main and a previous miss caused a "Supabase Preview failed"
   incident.
4. If you apply any DB migration via the Supabase MCP, **immediately**
   call `mcp__supabase__list_migrations` and write the local
   `supabase/migrations/<remote-timestamp>_<name>.sql` file with the
   exact remote timestamp.
5. **Don't wait for my input between phases.** Continue 6 → 7 while
   context holds. Phases 8 and 9 each deserve their own session —
   stop and write a fresh resume prompt before starting them.
6. **Stop honestly** if the next phase requires more focus than you
   can give. When you stop, write a fresh `.claude/resume-phase-N.md`
   in this exact format, with definitions for the remaining phases
   carried over so future sessions never get stuck for lack of
   context.
7. Maintain the safety rules from CLAUDE.md: never edit posted
   payments/receipts directly (use payment_adjustments), never expose
   `SUPABASE_SERVICE_ROLE_KEY` in browser code, no alternate
   payment-posting paths outside Payment Desk, etc.

# Project conventions worth remembering

- The workbook calculation puts academic fee fully in installment 1
  (verified in DB). A toggle to split equally exists in Fee Setup but
  defaults to first_only.
- `v_workbook_student_financials.discount_amount` already includes any
  conventional discount (RTE / Staff Child / 3rd Child) — don't add
  `conventionalDiscountAmount` on top in the Payment Desk UI.
- Defaulter contact log lives in `defaulter_contacts` (append-only,
  with `snooze_until`, `outcome`, `channel`, and `voice_note_path`
  added in Phase 5).
- `getContactSummariesForStudents` already exposes `lastOutcome`,
  `noAnswerStreak`, `totalAttempts`.
- `getStudentContactLog(studentId, sessionLabel)` returns the recent
  contact log entries with voice-note paths (Phase 5).
- Shared components shipped across sessions: `StudentFinanceGlance`,
  `ContactStatusChip`, `ReceiptPreviewSheet`, `StudentReceiptsPanel`
  (Phase 3), `FamilyReceiptsBatchActions` (Phase 3),
  `StudentStickyHeader` (Phase 4), `NextActionStrip` (inline in
  StudentIdentityStrip, Phase 4), `OptimisticBanner` (Phase 4),
  `AnomalyToaster` (Phase 4), `RouteCollectionHeatmap` (Phase 4),
  `BulkWhatsappProvider` + `BulkRowCheckbox` (Phase 5),
  `ReceiptShareActions` (Phase 5), `VoiceNoteRecorder` +
  `VoiceNotePlayer` + `ContactLogTimelineButton` (Phase 5),
  `ActivityStrip` (Phase 6).
- `'left'` is the schema value for "withdrawn" students.
- 60ms is the agreed debounce for instant-feeling search.
- `ReceiptDocument` takes `embedPageStyles?: boolean` (defaults true;
  pass false when a parent page owns the `@page` rule).
- The `toast()` helper in `components/ui/toast.tsx` only accepts
  `{title, description?, action?}` — there's no `variant` prop. Phase
  4 anomaly toasts work by using a clear AlertTriangle icon in the
  Review action button rather than a colour-coded variant.
- `pushOptimisticPayment` from `lib/dashboard/optimistic-counters.ts`
  is the canonical way for any new posting path to notify the
  dashboard. Only the payment desk should ever post, but this is
  the event to dispatch from there.
- `lib/helpers/export.ts` `formatExportName(basename, "xlsx")` is the
  one-stop helper for any future export route filename.
- `lib/whatsapp-templates/render.ts` exposes
  `renderWhatsappTemplate(body, vars)` and
  `buildWaMeLink(phone, text)` — re-use for any future
  message-template feature.
- `lib/activity/events.ts` exposes `recordActivity` (fire-and-forget,
  never throws) — call this from any new server action that
  represents a user-meaningful action so it shows up in the
  dashboard strip + full feed. The set of canonical kinds is in
  `ACTIVITY_KINDS` but free-form strings are also accepted.
- `MEMORY.md` and `memory/` under
  `C:\Users\janme\.claude\projects\C--Users-janme-Documents-schoolfees\`
  is still empty — start fresh if you want to persist anything.

# Pre-existing test failures to ignore (verified against bare main)

These four test files fail identically on `main` and on any branch —
they're load-time/router-mounting issues unrelated to Phase work:

- `tests/ui/family-flow-links.test.tsx` — `Cannot find package
  'server-only'` import failure
- `tests/ui/students-sibling-pill.test.tsx` — `useRouter` not mounted
- `tests/integration/navigation.test.ts` — mobile nav fixture
  mismatch
- `tests/integration/payment-desk-workflow.test.ts` — confirm-receipt
  sheet allocation table fixture mismatch

# What to do first

```
git log --oneline -8
```

Confirm `d2ece1e` (Phase 6 partial) is the latest on main. Then start
Phase 6 remaining (items 34 and 36 — item 38 is held pending an email
provider decision). Continue into Phase 7 (items 50, 52, 53) if
context allows.

Before starting Phase 8 or 9, stop and write a fresh
`.claude/resume-phase-N.md` file in this same format. The remaining
item definitions are already baked in above — carry them forward
into the new file so future sessions never have to re-explain anything.

The resume-prompt pattern, recapped:
- Every stop produces a fresh `.claude/resume-phase-N.md` with full
  phase plan, shipped commits + SHAs, remaining-phase item
  definitions, working preferences, conventions, and test failures
  to ignore.
- The user pastes a one-line pointer prompt ("Read
  `.claude/resume-phase-N.md` and continue") in the next session.
- No information is ever lost between sessions.
