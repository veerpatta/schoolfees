# Resume prompt — Phase 8 of VPPS school fees admin app overhaul

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

- **Item 38 — Scheduled exports via email: DROPPED** per user
  decision. The school doesn't want this. Do not implement.

- **Phase 6** — commits `d2ece1e` + `08c6432` — items 42, 54, 35, 39, 34, 36:
  - Item 42 (commit `d2ece1e`): `user_activity_events` append-only table +
    `lib/activity/events.ts` helper (`recordActivity`,
    `getTodayActivityCounts`, `getLastEventByRef`, `listActivity`).
    Recorded from: payment posting, student edit, student detail
    view, export download, defaulter contact. Dashboard `ActivityStrip`
    + full feed at `/protected/admin-tools/activity`.
  - Item 54 (commit `d2ece1e`): `lastViewedByUser` map flows from
    students page → quick-load → list-table. "Last viewed by you N ago"
    line on both mobile card and desktop rows.
  - Item 35 (commit `d2ece1e`): `column-mapping-card.tsx` persists/
    applies a localStorage mapping keyed by a header-set hash.
  - Item 39 (commit `d2ece1e`): `?format=pdf` on
    `/protected/exports/[exportType]` returns a printable HTML page
    that auto-triggers `window.print`.
  - Item 34 (commit `08c6432`): `resumeStudentImportBatch` in
    `lib/import/data.ts` resets rows where the previous commit failed
    at save time (`status=invalid`, errors prefixed `ERR_IMPORT_*`)
    back to `valid/approved`, then re-runs commit. Idempotent.
    `ImportCommitCard` shows a "Resume from row N" panel when the
    batch status is `failed` and the importer made partial progress.
  - Item 36 (commit `08c6432`): Migration
    `20260525131743_import_duplicate_audit_decision` adds
    `duplicate_audit_decision` + `duplicate_audit_target_student_id`
    columns to `import_rows`. New `lib/import/duplicate-audit.ts`
    scans staged rows for matches against existing students by
    (full_name + father_name) and by phone, returns candidates per row.
    `DuplicateAuditPanel` (mobile + desktop) renders between column
    mapping and batch summary in the import workflow. Per-row choices:
    "Mark as update" (with student picker), "Mark as duplicate" (skip),
    "Proceed as new", "Reset decision". Commit logic honours decisions.

- **Phase 7** — commit `5e16dc0` — items 50, 52, 53:
  - Item 50: `BulkStudentEditBar` shows when ≥1 student is selected
    (mobile + desktop). Bulk-update class / transport route / status
    across the selection. `bulkUpdateStudentsAction` validates class
    against active fee settings, applies the patch, re-prepares dues,
    writes `student_edited` activity per student. Multi-select
    checkboxes added to `student-list-table.tsx`.
  - Item 52: Migration `20260525133208_student_photos` adds
    `students.photo_path` + private `student-photos` storage bucket
    + staff RLS policies. `StudentPhotoUpload` resizes images
    client-side via canvas (≤600 px, ~200 KB JPEG). `StudentAvatar`
    lazily fetches signed URLs via new `/protected/students/photo`
    route; cached across renders. Rendered in list (mobile + desktop)
    and the identity strip. `StudentFormInput`, `StudentValidatedInput`,
    and `StudentDetail` all carry `photoPath` end-to-end.
  - Item 53: `lib/fees/time-travel.ts` reconstructs the latest active
    state of `fee_policy_configs`, `fee_settings`, and
    `student_fee_overrides` at any chosen date from `audit_logs`.
    New `/protected/fee-setup/time-travel` page with date picker +
    policy snapshot + per-class fee table + first 20 student overrides.
    "Time travel" link added to Fee Setup page header.

# Phase plan (remaining)

- Phase 8 — items 18, 19 (year-end, high-stakes — dry-run on
  TEST-2026-27 before applying to prod).
- Phase 9 — item 6 (family / multi-student payment — biggest single
  feature, deserves its own session).
- Phase 10 — items 43, 45, 47, 48 (long-tail).

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

1. **Item definitions for Phases 8 – 10 are baked into this file.**
   Don't ask for clarifications — proceed.
2. Apply changes to both **mobile and desktop** where applicable.
3. After each phase: run **typecheck + lint + build**, then **commit
   and push to origin/main**. Don't skip the push — Vercel deploys
   from main and a previous miss caused a "Supabase Preview failed"
   incident.
4. If you apply any DB migration via the Supabase MCP, **immediately**
   call `mcp__supabase__list_migrations` and write the local
   `supabase/migrations/<remote-timestamp>_<name>.sql` file with the
   exact remote timestamp. (Note: in the prior session the harness
   required explicit user approval before running
   `mcp__supabase__apply_migration`. Ask up front via
   `AskUserQuestion` if you need to apply one; the user prefers MCP
   over file-only.)
5. **Don't wait for my input between phases.** Continue 8 → 9 only if
   genuinely safe — Phase 8 is year-end / high-stakes and Phase 9
   touches money. **Stop and write a fresh resume file before
   starting Phase 9.** Phase 8 itself can be a single session.
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
  `ActivityStrip` (Phase 6), `DuplicateAuditPanel` (Phase 6),
  `BulkStudentEditBar` (Phase 7), `StudentAvatar` +
  `StudentPhotoUpload` (Phase 7).
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
- `bulkUpdateStudentFields(studentIds, patch)` in `lib/students/data.ts`
  is the canonical helper for changing class / route / status across
  many students at once. Always pair with
  `prepareDuesForStudentsAutomatically` after.
- `lib/fees/time-travel.ts` `getFeeSetupSnapshotAt(asOf)` reconstructs
  policy / fee_settings / overrides at any date from `audit_logs`.
  Re-use for any future "what did Fee Setup look like on day X" need.
- `StudentAvatar` from `components/students/student-avatar.tsx`
  handles signed-URL fetch + caching + lazy IntersectionObserver.
  Pass `photoPath` and `fullName`; `size` is `"sm" | "md" | "lg"`.
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

Confirm `5e16dc0` (Phase 7) is the latest on main. Then start
Phase 8 (items 18 and 19). Item 38 was dropped — do not implement.

Phase 8 is the **year-end class-promotion + credit-carry-forward**
work. Both items mutate every active student's `class_id` and create
new opening-credit entries. **Mandatory before touching anything:**

1. Read `supabase/migrations/20260521033957_family_payment_id.sql`,
   `20260521171500_disable_family_payments.sql`, and any
   `realign_recent_imports_to_active_session` history — these show
   the pattern for "session-spanning" bulk operations.
2. Walk through one student through the proposed flow on
   `TEST-2026-27` end-to-end before touching real-session data.
3. Implement the wizard's preview/apply/summary as separate explicit
   server actions — never roll the apply into the preview render.
4. Add a "Roll back" affordance on the summary screen that's wired
   to the previous-class snapshot, not the audit log (faster + safer
   for the staff to use).

Before starting Phase 9 (family payments — biggest single feature),
stop and write a fresh `.claude/resume-phase-9.md` file in this same
format. The remaining item definitions (Phases 9, 10) are already
baked in above — carry them forward into the new file so future
sessions never have to re-explain anything.

The resume-prompt pattern, recapped:
- Every stop produces a fresh `.claude/resume-phase-N.md` with full
  phase plan, shipped commits + SHAs, remaining-phase item
  definitions, working preferences, conventions, and test failures
  to ignore.
- The user pastes a one-line pointer prompt ("Read
  `.claude/resume-phase-N.md` and continue") in the next session.
- No information is ever lost between sessions.
