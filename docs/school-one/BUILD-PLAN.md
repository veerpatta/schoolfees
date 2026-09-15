# School One — Master Build Plan

**Repo:** `veerpatta/schoolfees` (this plan lives at `docs/school-one/BUILD-PLAN.md`)
**Version:** 1.0 — 16 September 2026
**Inputs:** the architecture assessment (15 Sep 2026), the filled context worksheet (15 Sep 2026), read-only inspection of `schoolfees` @ `3a3ee8a`, `sampark` @ `830548c`, `timetable2025` (public), and account metadata.
**Status of production:** untouched. Nothing in this plan writes to project `vgqyilgstjvgohrsiwkb` until the explicitly labelled "Production release" step of each phase, and every such step is preceded by a backup and a dev-project rehearsal.

---

## 0. How a coding agent uses this document

1. Read, in this order: `docs/school-one/CLAUDE-addendum.md` → this file → the phase's prompt pack (`docs/school-one/prompts/phase-N.md`). Then the existing `CLAUDE.md`, `AGENTS.md`, and the README of any module you touch.
2. Every prompt in a pack is one bounded task with an explicit **edit list**. If the work needs a file outside the list, **stop and report** — do not widen scope.
3. Before every commit: `npm run typecheck && npm run lint && npm run test && npm run build`. A red step is a stop, not a warning.
4. Your database is the **dev project or local stack — never production**. The production write guard (Phase 0) makes this a runtime error, not a memory test. If you ever see the production project ref `vgqyilgstjvgohrsiwkb` in an environment you are working in, stop.
5. Migrations are **additive only** and **append-only** (never edit an applied migration). New enum values go in their own migration file, separate from the migration that first uses them.
6. Fee-module tables, RPCs, triggers, and routes are **read-only for School One work** (see §6). The one sanctioned exception is the promotion transaction gaining a single `enrolments` insert (Phase 1, item P1.7).
7. Financial hard rules from `CLAUDE.md` apply verbatim to every task, even tasks that "only" touch attendance.

---

## 1. Decisions locked from the worksheet

| Area | Decision | Source |
|---|---|---|
| Foundation | Evolve `schoolfees`; Supabase project stays master; one repo, modular monolith | A1–A2 |
| Hosting | Vercel Hobby continues; Pro only if Vercel objects or a limit bites; custom domain on `vpps.co.in` later; only Janmejay deploys | B1 |
| Dev database | Free second Supabase project `schoolfees-dev` for previews + local `supabase start`; `TEST-2026-27` in production is for **final fee-adjacent UAT only**, never for development | B2a, A11 (see §1.1) |
| Backups | Nightly logical backup to Google Shared Drive (Workspace for Education, `vpps.co.in`) **and** Cloudflare R2; monthly restore drill | A10, B3, L1 |
| Sampark | Collection flow (WhatsApp task links) stays and is optimised for marks; teachers may also edit/add the same data in-app under the same rules; old domain `sampark-theta-eight.vercel.app` stays alive as the template-button redirect | A5, H2, H5 |
| Timetable | Timetable and substitutions live **inside** School One; substitution engine ported from `timetable2025`; substitute teacher notified by WhatsApp (AiSensy) | A6, G10, I1–I4 |
| Roles | admin, accountant, fee_collector, view_only (existing) + `office`, `academic_coordinator`, `exam_coordinator`; class-teacher vs subject-teacher is an **assignment**, not a role; everything assignable by admin in the UI | C3, S |
| Sensitive data | Class teacher of that class + admin + office may see sensitive fields; other teachers may not | C6 |
| Attendance | Once per day; one tap "all present" then mark absent; statuses Present / Absent / Half-day; class teacher marks, office may mark on behalf; **no correction without approval**; reminder after period 1; monthly printable register; 5G is fine, a pending queue is enough | G1–G7 |
| Marks | Subject teachers enter marks in-app or via Sampark round; **no approval needed to change a mark** until the exam coordinator locks the assessment; every change is logged | H4, S |
| Reports | Student progress view; report-card PDF; progress report to parent by WhatsApp, **human-pressed** | S |
| Notes | Class teachers and subject teachers write notes on students; note kinds configurable by admin | G9, G12 |
| Payment gateway | Cashfree/Razorpay integration is a **separate fee-module track**; not part of School One phases; must not share a release with any School One migration | F5, A12 |
| Sentinel | Only Janmejay uses the fee app today as admin → narrowing `teacher` has no live impact | C2 |
| Rollout model | **Two admin logins on the same production app:** `director@vpps.co.in` = operations (sees today's fee app exactly as it is); `raj@vpps.co.in` = canary (sees School One features as they ship). Per-user feature flags decide what each login sees. See §1.2 | your note, 16 Sep |
| Sampark / timetable status | Both are **paused and not in use** → no parallel running, no freeze windows, no cutover calendar; their data can be migrated as soon as the foundation exists. The approved WhatsApp template button URL still points at `sampark-theta-eight.vercel.app/w/`, so that redirect is still kept | your note, 16 Sep |

### 1.2 The canary-admin rollout model (what it does and does not isolate)

**What it is.** Production stays one deployment and one database. Two admin accounts exist in `public.users`: `director@vpps.co.in` (role `admin`, used for daily school operations, fee posting, reminders) and `raj@vpps.co.in` (role `admin`, the canary). A `feature_flags` table (Phase 0, P0.9) lists School One features; each flag is either off, on for named users, on for named roles, or on for everyone. New navigation items, routes, and jobs check the flag. `director@` is never on a flag's allowlist until the feature is declared done; `raj@` is on every flag from the day the feature merges.

**What it isolates.** The *user interface and workflows* the operations login sees. Nothing in the office's day changes until a flag is flipped for `director@`, and a flip is reversible in seconds without a deploy. Cron jobs and reminders keep running exactly as now — they are not tied to a login.

**What it does not isolate — and how the plan covers each.**

| Not isolated by a second login | Covered by |
|---|---|
| Code: both logins run the same deployment, so a bug in shared code affects both | CI, the AI review step, and the rule that School One never edits `src/modules/fees/**` |
| Schema: migrations apply to the one database | additive-only migrations, rehearsed on `schoolfees-dev` first, applied only in the release window |
| Shared tables: `students`, `users`, `whatsapp_reminder_sends` | the students module's single write path; additive columns only; `audit_logs` records which admin did what |
| Test data: anything the canary *writes* in production lands in production tables | every new table carries `session_label`; the canary works in `TEST-2026-27` (the fee app's existing convention) until the go-live check, and only the go-live check writes to `2026-27` |
| Development: an agent must still never build against production | `schoolfees-dev` + the write guard (Phase 0) — unchanged and still mandatory |

**Practical rule for the canary:** use `raj@` in production to *look* at School One with real data and to run the final acceptance check of each phase; do the building, breaking, and fixing on the dev project. When a phase's acceptance is signed, flip the flag for the roles that need it (teachers, office), then for `director@`.

### 1.1 Assumptions register (worksheet items left blank — defaults taken)

These are editable in `docs/school-one/decisions.md`; the plan treats them as settings, not facts.

| # | Item | Default taken | Why |
|---|---|---|---|
| D-1 | Approver for attendance corrections (C5) | `admin`, `office`, `academic_coordinator` | smallest set that includes someone in the office every day |
| D-2 | Approver for master-data corrections (C5) | `admin` (Sampark's current rule); `office` cannot approve | C4 unanswered; keep the stricter existing rule |
| D-3 | Attendance submission deadline (G3) | end of period 1 for the reminder; end of period 3 for the office "missing" list | from G5 |
| D-4 | Leave status (G2) | not enabled; only P / A / Half-day | you added only half-day |
| D-5 | Quiet hours for WhatsApp (J3) | no sends 20:00–07:00 IST | conservative |
| D-6 | Who may send parent-facing academic messages (J3) | `admin`, `exam_coordinator`, class teacher of that class | matches "teachers can send or admin can send" |
| D-7 | Automatic (no-human) sends (J4) | staff-facing only (attendance reminder, substitution notice, job alerts); every parent-facing send is button-pressed | the stated default |
| D-8 | Failure alerts (K2) | Janmejay's WhatsApp + Sentry | |
| D-9 | Backup retention (L3) | 14 daily / 8 weekly / 24 monthly | |
| D-10 | Encryption key holder (L2) | Janmejay: password manager + one printed copy in the school safe | **must be confirmed before Phase 0 item P0.4 runs** |
| D-11 | Archive trigger (L8) | only when DB > 300 MB or Supabase asks for money | |
| D-12 | Exports (M1) | admin + office + exam_coordinator for academic exports; teachers export nothing; every export logged | |
| D-13 | Photos (M2) | visible on class lists to that class's teachers; download admin-only | |
| D-14 | Auto-logout (M3) | 30 minutes idle on shared office devices; 12 hours on personal phones | |
| D-15 | Branching (N2) | `main` = production; one feature branch per phase; PR per phase; AI review step because no second human reviewer | |
| D-16 | Deployment window (N4) | production migrations only on Sundays or holidays, after a fresh backup | |
| D-17 | Rollback stance (N5) | flag off and keep data; restore from backup only for data corruption | |
| D-18 | Pilot (G11) | one class teacher + one subject teacher for two weeks before the whole staff, even though no formal pilot was requested | cheap insurance |
| D-19 | Timetable classes | 16 timetabled class groups (Class 1 → 12 streams); Nursery/JKG/SKG have no timetable and get attendance only | from `data.js` |

---

## 2. Target architecture (summary)

```
schoolfees (Next.js 16, Node runtime, Vercel bom1)
├── src/modules/fees/*            existing — READ-ONLY for School One
├── src/modules/students/         existing — extended (external ids, sensitive split)
├── src/modules/staff/            new — staff_profiles, access links, assignments UI
├── src/modules/academics/        new — sessions/classes aliases, subjects, enrolments, calendar
├── src/modules/timetable/        new — versions, slots, periods, substitution engine, plans
├── src/modules/attendance/       new — registers, entries, corrections, reminders
├── src/modules/collection/       ported from sampark — field defs, requests, submissions, review
├── src/modules/assessments/      new (thin) — assessments, marks entry, locks
├── src/modules/notes/            new — student notes with configurable kinds
├── src/modules/reports/          new — progress views, report card PDF, parent report send
├── src/modules/whatsapp/         existing — generalised with `purpose`
├── src/platform/jobs/            new — job_runs, per-job secrets, chunked runner
└── src/app/teach/*               new — mobile-first teacher shell
Supabase vgqyilgstjvgohrsiwkb (prod)  ·  schoolfees-dev (previews)  ·  supabase start (local)
pg_cron + pg_net → /api/jobs/* (Vercel, Node, ≤300 s)   ·   GitHub Actions → backups
```

One database, table ownership per module, cross-module writes only through the owning module's server functions. RLS stays the last line of defence; the first line is `requireStaffPermission()` plus the new scope helper (§4).

---

## 3. Data model specification (new tables)

Conventions: `uuid` PKs with `gen_random_uuid()`, `created_at/updated_at timestamptz default now()`, `created_by uuid references public.users(id)`. All tables `enable row level security`. Append-only tables get the existing `private.prevent_append_only_mutation()` trigger. `session_label text` matches `academic_sessions.session_label`.

### 3.1 Phase 0 — platform

**`job_runs`** — `id`, `job_name text`, `trigger text` (`pg_cron` | `vercel_cron` | `github` | `manual`), `status text check in ('running','succeeded','failed','skipped')`, `started_at`, `finished_at`, `items_processed int default 0`, `details jsonb`, `error text`. Index `(job_name, started_at desc)`. Append-only except `status/finished_at/items_processed/details/error` updated once by the runner (enforced in code; not trigger-protected).

**`backup_runs`** — `id`, `ran_at`, `kind text` (`nightly` | `restore_drill`), `dump_bytes bigint`, `sha256 text`, `row_counts jsonb`, `destinations jsonb`, `verified boolean`, `notes text`. Written only by `/api/jobs/backup-report` with `JOB_SECRET_BACKUP`.

### 3.2 Phase 1 — staff, academics, timetable import

**`staff_profiles`** — `id`, `user_id uuid null unique references users(id)` (null = no login), `display_name text not null`, `short_name text not null unique` (the timetable name: `Prateek`, `SP`…), `phone text`, `whatsapp_phone text`, `is_teaching boolean default true`, `is_active boolean default true`, `preferred_language text default 'hi'`, `sampark_teacher_id text unique null`, `notes`. Comment: "short_name is the join key to timetable data; never rename a short_name in place — retire and create."

**`staff_access_links`** — Sampark's durable teacher link. `id`, `staff_id → staff_profiles`, `token text unique` (16 base64url), `issued_at`, `issued_by`, `revoked_at`, `last_used_at`. Revocation = `revoked_at` set (Sampark used NULL-as-revocation on the teacher row; here it is a row so history survives).

**`subjects`** — `id`, `code text unique` (`maths`, `biology`, `elga`…), `name_en`, `name_hi`, `category text` (from `SUBJECT_CATEGORIES` in `data.js`), `is_examined boolean`, `sort_order int`, `is_active`.

**`class_aliases`** — `class_id → classes(id)`, `system text` (`timetable` | `sampark` | `psp` | `lead`), `label text`, unique `(system, label, class_id)`, unique `(class_id, system)`. Maps `Class 11 Science` (timetable), `11 Science` (Sampark), etc. onto the session's `classes` row without touching `classes`.

**`teaching_assignments`** — `id`, `session_label`, `class_id → classes`, `subject_id → subjects null`, `staff_id → staff_profiles`, `role text check in ('class_teacher','subject_teacher','shared_activity')`, `source text check in ('timetable','office')`, `effective_from date default current_date`, `ended_at date null`, `created_by`. Unique `(session_label, class_id, coalesce(subject_id,'00000000-…'), staff_id, role) where ended_at is null`. Exactly one active `class_teacher` per class per session (partial unique index).

**`enrolments`** — `id`, `student_id → students`, `session_label`, `class_id → classes`, `roll_no text`, `status text` (mirrors `student_status`), `effective_from date`, `effective_to date null`, `source text` (`backfill_installments` | `backfill_promotion` | `promotion` | `admission` | `office`). Unique `(student_id, session_label, effective_from)`. Partial unique `(student_id, session_label) where effective_to is null`. **Backfill order:** current session from `students.class_id`; past sessions from `installments.class_id → classes.session_label` (distinct per student), then `promotion_run_entries.previous_class_id`; conflicts reported, never guessed.

**`academic_calendar`** — `date date primary key`, `session_label`, `kind text check in ('working','holiday','exam','event','half_day','vacation')`, `label_en`, `label_hi`, `created_by`. Distinct from `school_holidays` (which stays for the WhatsApp fee guards only).

**`student_external_ids`** — `student_id → students`, `system text` (`psp_nic` | `apaar` | `lead` | `sampark_legacy`), `external_id text`, `verified_at`, `verified_by`, unique `(system, external_id)`, unique `(student_id, system)`.

**`student_sensitive_details`** — `student_id primary key → students`, `aadhaar_no`, `jan_aadhaar_no`, `apaar_id`, `category`, `religion`, `caste`, `moved_at`. RLS: `students:view_sensitive_all` **or** (`students:view_sensitive_own_classes` and the student's current class ∈ `private.staff_class_ids('class_teacher')`). Compatibility view `students_with_sensitive` (security invoker) for legacy readers listed in P1.5. `students` keeps the old columns **nullable and empty** for one release, then a follow-up migration drops them after the reader inventory is green.

**`timetable_versions`** — `id`, `session_label`, `label text` (`v11`), `status text check in ('draft','published','archived')`, `source_sha256 text`, `payload jsonb` (the parsed CSV, for audit), `periods jsonb` (from `SCHEDULE` in `data.js`: reporting, period start/end minutes, break, close), `published_at`, `published_by`. Partial unique: one `published` per `session_label`.

**`timetable_slots`** — `id`, `version_id → timetable_versions`, `class_id → classes`, `day_of_week smallint check 1..6`, `period_no smallint check 1..8`, `label text` (`Biology / Maths`), `subject_ids uuid[]`, `staff_ids uuid[]`, `is_parallel boolean`, `is_shared boolean`. Unique `(version_id, class_id, day_of_week, period_no)`. Index on `staff_ids` (GIN).

### 3.3 Phase 2 — attendance, notes

**`attendance_registers`** — `id`, `session_label`, `class_id`, `register_date date`, `status text check in ('not_submitted','submitted','locked')`, `submitted_by → staff_profiles`, `submitted_at`, `submitted_on_behalf boolean default false`, `client_key text`, `present_count int`, `absent_count int`, `half_day_count int`. Unique `(class_id, register_date)`. Rows are **created ahead** by the nightly `open-registers` job for every working day × active class, so "not submitted" is a row, not an absence of rows.

**`attendance_entries`** — `id`, `register_id`, `student_id`, `status text check in ('present','absent','half_day')`, `marked_by`, `marked_at`, `version int default 1`. Unique `(register_id, student_id)`.

**`attendance_corrections`** — append-only. `id`, `entry_id`, `from_status`, `to_status`, `reason text not null`, `requested_by`, `requested_at`, `decision text check in ('pending','approved','rejected')`, `decided_by`, `decided_at`. A trigger applies `to_status` to the entry and bumps `version` **only** on `decision = 'approved'`.

**`student_notes`** — append-only. `id`, `student_id`, `session_label`, `author_staff_id`, `kind_id → note_kinds`, `body text`, `visibility text check in ('class_team','office','author')`, `supersedes_note_id uuid null`, `created_at`. **`note_kinds`** — `id`, `code`, `label_en`, `label_hi`, `default_visibility`, `is_active`, `sort_order` (admin-editable, per G9).

### 3.4 Phase 3 — substitutions

**`staff_shift_policies`** — `staff_id primary key`, `allowed_periods smallint[]`, `note`, `policy_version smallint`, `updated_by`, `updated_at`. (Port of `teacher_shifts`, keyed by staff id instead of name.)

**`substitution_plans`** — `plan_date date primary key`, `version_id → timetable_versions`, `absences jsonb`, `absence_periods jsonb`, `assignments jsonb`, `pins jsonb`, `status text check in ('draft','published')`, `published_by`, `published_at`, `updated_by`, `updated_at`. Same shape as the Neon table so `scripts/substitution.js` ports without semantic change.

**`substitution_assignments`** — normalised projection written on publish: `id`, `plan_date`, `class_id`, `period_no`, `absent_staff_id`, `cover_staff_id`, `tier text`, `status text`, `notified_at`, `notification_send_id → whatsapp_reminder_sends`. Unique `(plan_date, class_id, period_no)`. This is what the teacher "Today" card and the WhatsApp notice read.

### 3.5 Phase 4 — collection (Sampark port) and assessments

Sampark tables are ported **with a `collection_` prefix** and uuid/text keys converted as noted: `collection_field_defs`, `collection_sources`, `collection_field_sources`, `collection_value_sources` (`student_id` becomes the fee app uuid), `collection_request_batches`, `collection_requests`, `collection_request_students`, `collection_submissions` (append-only; `review_status` the only updatable column, enforced by trigger), `collection_change_log` (append-only), `student_records` (`period` replaced by `assessment_id` **and** kept as `period_label` for the migration window), `student_documents`, `collection_rate_limits`. Sampark's `teachers` → `staff_profiles` + `staff_access_links`; `users` → mapped to existing `users` by email with role mapping (§4); `whatsapp_messages` → `whatsapp_reminder_sends` with `purpose`.

**`assessments`** — `id`, `session_label`, `code text` (`FA1`), `name_en`, `name_hi`, `class_ids uuid[]`, `subject_ids uuid[]`, `max_marks numeric`, `weightage numeric null`, `status text check in ('draft','open','locked','published')`, `opens_at`, `locks_at`, `locked_by`, `locked_at`, `published_at`. Marks entry (either path) is accepted only while `status = 'open'`.

**`marks_change_log`** — append-only, written by trigger on every `student_records` insert/update for `record_kind = 'marks'`: `record_id`, `from_value`, `to_value`, `changed_by`, `changed_via text` (`app` | `collection_link` | `import`), `changed_at`.

### 3.6 Phase 5 — reports

**`report_cards`** — `id`, `student_id`, `session_label`, `assessment_ids uuid[]`, `template_version`, `pdf_path text` (Storage), `generated_by`, `generated_at`, `sent_send_id → whatsapp_reminder_sends null`. Regeneration creates a new row; nothing is overwritten.

### 3.7 Changes to existing tables (the complete list)

| Table | Change | Phase | Risk |
|---|---|---|---|
| `staff_role` enum | add `office`, `academic_coordinator`, `exam_coordinator` (own migration) | 1 | additive; cannot be reverted, so the names must be final |
| `students` | sensitive columns become nullable-empty after the split, dropped one release later | 1 | medium — reader inventory required (P1.5) |
| `whatsapp_reminder_sends` | add `purpose text default 'fee_reminder'`, `staff_id uuid null`, widen the per-day unique index to include `purpose` | 2 | low — additive; existing rows default |
| promotion transaction (`src/modules/promotion/data/queries.ts`) | one `enrolments` insert per applied entry | 1 | low — same transaction, tested in dev with seeded runs |
| `users` | none | — | — |
| every fee table | **none** | — | — |

---

## 4. Roles, permissions, and scope

### 4.1 Roles (`staff_role` enum after Phase 1)

`admin` · `accountant` · `fee_collector` · `view_only` · `teacher` · `office` · `academic_coordinator` · `exam_coordinator`

Sampark role mapping at migration: `owner → admin`, `admin → admin`, `office → office`.

### 4.2 New permissions (added to `src/platform/auth/roles.ts`, `public.has_permission`, and `workers/schoolfees-mcp/src/permissions.mjs` — all three, pinned by the existing tests)

| Permission | admin | office | academic_coordinator | exam_coordinator | teacher |
|---|:-:|:-:|:-:|:-:|:-:|
| `students:view_own_classes` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `students:view_all` | ✓ | ✓ | ✓ | ✓ | |
| `students:view_sensitive_all` | ✓ | ✓ | | | |
| `students:view_sensitive_own_classes` | ✓ | ✓ | ✓ | | ✓ (class_teacher assignments only) |
| `students:edit_basic` (existing) | ✓ | ✓ | | | ✓ |
| `staff:assign` | ✓ | | ✓ | | |
| `calendar:manage` | ✓ | ✓ | ✓ | | |
| `timetable:view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `timetable:publish` | ✓ | | ✓ | | |
| `substitutions:manage` | ✓ | | ✓ | | |
| `attendance:mark_own_classes` | ✓ | | | | ✓ (class_teacher) |
| `attendance:mark_any` | ✓ | ✓ | ✓ | | |
| `attendance:view_all` | ✓ | ✓ | ✓ | ✓ | |
| `attendance:approve_corrections` | ✓ | ✓ | ✓ | | |
| `notes:write_own_classes` | ✓ | | | | ✓ |
| `notes:view_all` | ✓ | ✓ | ✓ | ✓ | |
| `collection:create` | ✓ | ✓ | | ✓ | |
| `collection:approve` | ✓ | | | | |
| `marks:enter_own` | ✓ | | | ✓ | ✓ (subject_teacher) |
| `marks:view_all` | ✓ | ✓ | ✓ | ✓ | |
| `assessments:manage` | ✓ | | | ✓ | |
| `assessments:lock` | ✓ | | | ✓ | |
| `reports:academic` | ✓ | ✓ | ✓ | ✓ | |
| `reports:send_parent` | ✓ | | | ✓ | ✓ (class_teacher) |
| `exports:academic` | ✓ | ✓ | | ✓ | |
| `jobs:view` | ✓ | | | | |

`teacher` **loses**: `fees:view`, `payments:view`, `finance:view`, `ledger:view`, `receipts:view`, `reports:view`, `imports:view`, `settings:view`, `defaulters:view`. `view_only` loses nothing but can no longer read sensitive columns (they leave the table). `accountant` and `fee_collector` are unchanged.

### 4.3 Scope helper

`private.staff_class_ids(p_role text default null) returns uuid[]` — the class ids from active `teaching_assignments` for the current staff profile in the current session (optionally filtered by role). Used by RLS on `attendance_*`, `student_notes`, `student_sensitive_details`, `student_records`, and by the server helper `requireClassScope(classId, role?)`. Scope lives here and nowhere else.

Server pattern for every teacher write (write it in each module README): **check permission → check scope → use the admin client**. This is the pattern `students/actions.ts` already uses for `students:edit_basic`; School One standardises it.

---

## 5. Phases

Each phase: **Goal → Preconditions → Work items (each = one prompt) → Manual steps (Janmejay) → Acceptance → Production release procedure → Rollback.** Estimates assume one coding agent driven part-time.

### Phase 0 — Safety rails and backups (2 weeks) — *prompt pack: `prompts/phase-0.md`*

**Goal:** make it mechanically impossible for School One work to touch live data by accident, and make the live data recoverable off-platform before anything else changes.

**Work items**
- P0.1 `schoolfees-dev` project bootstrapped from the repo's migrations + seeds; scripts `db:push:dev`, `db:reset:dev`; Vercel Preview scope pointed at it.
- P0.2 Production write guard in the app and in `scripts/`: refuses to start against the production project ref unless `VERCEL_ENV === 'production'` (or an explicit local override). UI banner naming the database when it is not production.
- P0.3 Job platform: `job_runs`, `backup_runs`, `src/platform/jobs/runJob()`, per-job secrets (`JOB_SECRET_<NAME>`), both existing cron routes wrapped (behaviour unchanged).
- P0.4 Off-platform backup: GitHub Actions nightly `pg_dump` (custom format + plain SQL via Supabase CLI), `age`-encrypted, to Shared Drive **and** R2, manifest with SHA-256 and row counts, retention pruning, report posted to `backup_runs`.
- P0.5 Monthly restore drill workflow: restore latest dump into a `postgres:17` service container, run invariant queries (row counts per table, `sum(payments.amount)` per session, receipt count), post result.
- P0.6 Docs: `docs/school-one/` scaffold, `CLAUDE.md` pointer to the addendum, `PRODUCTION_OPERATIONS_CHECKLIST.md` updated; old `nightly-backup` route marked deprecated (kept running until P0.5 passes once).
- P0.9 Feature flags: `feature_flags` table (`key`, `description`, `enabled_for_all`, `enabled_roles staff_role[]`, `enabled_user_ids uuid[]`, `updated_by`), helper `isFeatureEnabled(key, staff)`, navigation and route gating, admin editor under `/protected/settings/features`. The canary model (§1.2) depends on this, so it ships in Phase 0.

**Manual (Janmejay)** — create the `director@vpps.co.in` admin account via `/protected/staff` (signup is disabled by design; admins create users) and move daily operations to it; keep `raj@vpps.co.in` as the canary; create the dev project; set Vercel env scopes; create the Shared Drive `VPPS-SchoolOne-Backups`, a Google Cloud project + service account added to the drive as Content manager; create an R2 bucket + API token; generate the `age` key pair and file the private key (D-10); add GitHub secrets; confirm the first restore drill.

**Acceptance** — (a) a preview deployment renders the "DEV DATABASE" banner and cannot reach production even with a mis-set variable (test: set prod URL in preview → app refuses to boot with a clear message); (b) two consecutive nightly backups exist in both destinations with matching checksums; (c) one restore drill has passed with row counts equal to production's manifest; (d) `job_runs` shows the two existing crons running; (e) all existing tests green; (f) `director@` and `raj@` both log in to production; a flag enabled for `raj@` only shows a placeholder "School One" nav item to `raj@` and nothing to `director@`.

**Production release** — P0.2, P0.3 and P0.9 ship together (one migration: `job_runs`, `backup_runs`, `feature_flags`; one deploy). No data changes; no visible change for `director@`. **Rollback** — redeploy previous commit; tables are harmless if left.

### Phase 1 — Foundation: staff, academics, timetable import, roles (4 weeks)

**Preconditions:** Phase 0 acceptance met; the timetable repo's current `scripts/data.js` copied into `docs/school-one/fixtures/timetable-v11.txt`; Sampark's `teachers` and `teacher_subjects` exported as CSV (no phone numbers in the repo — phones are imported in the dev/prod run from a file outside git).

**Work items**
- P1.1 Migration set A: `staff_role` enum additions (own file). Migration set B: `staff_profiles`, `staff_access_links`, `subjects`, `class_aliases`, `teaching_assignments`, `enrolments`, `academic_calendar`, `student_external_ids`, `timetable_versions`, `timetable_slots`, scope helper, RLS. Seeds for dev.
- P1.2 Timetable parser port: `src/modules/timetable/domain/parse-timetable.ts` — a TypeScript port of `parseTimetable`/`buildTeacherMap` from `timetable2025/scripts/data.js`, including the parallel-vs-shared rule (`Biology / Maths (Hemlata / Prateek)` vs `ELGA (five names)`). Unit tests use the v11 fixture: 6 days × 16 classes × 8 periods = 768 cells, 30 parallel, 60 shared, 19 teachers, 24 subject labels.
- P1.3 Timetable import command: `scripts/school-one/import-timetable.mjs --file --session --label v11 --dry-run` → creates a draft `timetable_versions` row, resolves class labels via `class_aliases`, teachers via `staff_profiles.short_name`, subjects via `subjects.code`; unresolved names are listed and the run stops. Derives `teaching_assignments` (`source = 'timetable'`, `subject_teacher`; `shared_activity` for ELGA-style cells). Class teachers are **not** derivable from the timetable and are set in the UI.
- P1.4 Enrolments backfill script with dry-run report; consistency job `enrolments-vs-students` (nightly) that reports drift between `students.class_id` and the open enrolment.
- P1.5 Sensitive-column split: reader inventory (grep for each column across `src/`, `workers/`, `scripts/`, `supabase/functions/`), compatibility view, migration, updates to the student form, bulk-update template, imports, AI-context export, MCP worker. Second migration (drop columns) is written but **held** for the next release.
- P1.6 Permission matrix update in all three places; `teacher` narrowed; new roles wired into navigation and the `/protected` landing map in `src/proxy.ts` (keep the no-import rule there); Playwright `smoke:rbac` gains `office`, `academic_coordinator`, `exam_coordinator`.
- P1.7 Promotion: one `enrolments` insert per applied `promote`/`graduate` entry inside the existing transaction; rollback path closes it. Tested against seeded `promotion_runs` in dev.
- P1.8 Admin UI under `/protected/master-data`: Staff (profiles, link users, phones), Subjects, Class aliases, Assignments (set class teacher; view timetable-derived subject teachers; add office overrides), Calendar (import from spreadsheet), Timetable versions (upload → dry-run report → publish).

**Manual** — run the timetable import in dev and check the unresolved-names list; set class teachers; import the calendar; decide the three enum names are final.

**Acceptance** — timetable v11 published in dev with 768 slots and zero unresolved names; every active class has exactly one class teacher; enrolments backfill reports zero conflicts (or each conflict has a written decision); RBAC smoke passes for eight roles; the compatibility view keeps every existing student screen and export identical (snapshot tests on the export headers); existing test suite green.

**Production release** — Sunday; fresh backup; migrations A then B; run enrolments backfill in dry-run, review, then apply; run timetable import (draft) and publish; set class teachers. **Rollback** — new tables can stay; the compatibility view means no reader breaks; the enum values cannot be removed but are harmless.

### Phase 2 — Teacher workspace v1: attendance, notes, today (4–5 weeks)

**Preconditions:** Phase 1 in production; at least one teacher has a login; AiSensy template `attendance_reminder_hi/en` approved (submit at the start of the phase — approval is the long pole).

**Work items**
- P2.1 Migrations: `attendance_registers`, `attendance_entries`, `attendance_corrections` (+ trigger), `student_notes`, `note_kinds`, `whatsapp_reminder_sends.purpose/staff_id`.
- P2.2 `/teach` shell: mobile-first layout, Hindi-first with English, bottom nav (Today · Classes · Attendance · Notes), role-aware entry (`/protected` landing for teacher → `/teach`).
- P2.3 Attendance screen: opens today's register for the class teacher's class; all students default Present; tap toggles Absent → Half-day → Present; one Submit; idempotent submit with `client_key`; pending queue in IndexedDB with explicit "Pending — will send when online" state; conflict response shows the already-submitted register.
- P2.4 Corrections: request from the teacher (reason required) → approval queue for D-1 approvers → trigger applies. Office "mark on behalf" path with `submitted_on_behalf`.
- P2.5 Jobs: `open-registers` (nightly, working days from `academic_calendar`), `attendance-reminder` (after period 1 end from the published version's `periods`, WhatsApp to class teachers with `not_submitted`), `attendance-missing-list` (after period 3, office view + optional WhatsApp to office). All via pg_cron → `/api/jobs/*` with `runJob()`.
- P2.6 Student card (class-scoped): photo, names, phone (class teacher), house, route, attendance % (materialised view refreshed by the existing pg_cron pattern), notes, enrolment history. Sensitive fields behind a "Show" tap that is logged (`user_activity_events`).
- P2.7 Notes: add note (kind, body, visibility); list; supersede.
- P2.8 Today card: class-wise/teacher-wise periods from `timetable_slots` for the published version; substitutions appear here in Phase 3.
- P2.9 Monthly printable register (react-pdf via `src/platform/pdf/document-kit.tsx`), class × month grid, bilingual header.

**Acceptance** — a class teacher on a mid-range Android marks and submits attendance for 27 students in under 60 seconds on first use; "not submitted" is visible to the office by the configured time; a double submit produces one register; a correction without approval is impossible from any path (unit + RLS test); reminder job writes `job_runs` and one `whatsapp_reminder_sends` row per class per day maximum; pilot (D-18) signed off.

**Production release** — Sunday; backup; migration; flag `teach_workspace` on for `raj@` first (canary check with real rosters, writing only in `TEST-2026-27`), then for the pilot teachers, then for role `teacher`. `director@` sees nothing until the office-side screens (missing-attendance list, correction approvals) are enabled for role `admin`/`office`. **Rollback** — flag off; tables retained.

### Phase 3 — Timetable views and substitutions in School One (3–4 weeks)

**Preconditions:** Phase 2 stable for two weeks; AiSensy template `substitution_notice_hi/en` approved.

**Work items**
- P3.1 Migrations: `staff_shift_policies`, `substitution_plans`, `substitution_assignments`.
- P3.2 Engine port: `timetable2025/scripts/substitution.js` → `src/modules/timetable/domain/substitution-engine.ts` **unchanged in logic**, with its test file (`tests/substitution-engine.test.js`, 49 KB) ported to Vitest first so the port is proven equal before any "improvement".
- P3.3 Server-side plan storage replaces the browser→Neon direct write (the Neon connection string is currently readable by anyone who opens the page — School One removes that). `/protected/timetable/substitutions`: pick date, mark absences (whole/half day), get ranked cover (auto vs amber "confirm"), pin, publish.
- P3.4 Publish → writes `substitution_assignments` → "Notify" button sends one WhatsApp per cover teacher (D-7: staff-facing may be automatic on publish; default is the button). Teacher "Today" card shows covers.
- P3.5 Timetable views inside `/teach` and `/protected`: class-wise, day-wise, teacher-wise, free-teachers (port of the four views).
- P3.6 Improvements backlog captured as issues, not done in this phase (e.g. seed `canCover` from subject groups, relax `full_day` — both flagged in the engine docs as policy decisions).
- P3.7 Shift policies editor (port of `teacher_shifts` editor) for `academic_coordinator`.

**Acceptance** — the ported engine reproduces the original test suite results and the documented v11 simulation figures (674 vacancies across 114 single-teacher absences, 27 % auto); a published plan reaches every cover teacher's Today card. Because the old timetable app is paused, there is no parallel run: School One becomes the timetable's home on release, and `timetable2025` is left as a read-only reference with its Neon config removed.

**Production release** — normal deploy; flag `timetable` for `raj@` → `academic_coordinator` → everyone; no fee tables involved. **Rollback** — flag off; School One tables retained.

### Phase 4 — Sampark merge, assessments, in-app marks (5–6 weeks)

**Preconditions:** Phases 1–3 in production; Sampark is paused (no open round — confirmed), so no freeze window is needed; `sampark-theta-eight.vercel.app` redirect plan agreed (H2 = keep). Because Sampark is idle, P4.4's data migration can be rehearsed on the dev project at any time from Phase 1 onward, which is also how the Sampark `teachers`/`teacher_subjects` data reaches `staff_profiles` in P1.3.

**Work items**
- P4.1 Migrations: all `collection_*` tables, `student_records` (with `assessment_id` + `period_label`), `student_documents`, `assessments`, `marks_change_log`, grants/triggers mirroring Sampark's `grants.sql`.
- P4.2 Port `src/lib/auth/token.ts`, rate limiting, `/r/[token]`, `/t/[token]`, `/w/[token]` (route handlers, Node runtime, admin client, same 404-for-everything rule, `NEVER_ON_TEACHER_PAGE` list), the field registry + `validateField`, request builder + snapshot, submissions + supersede + idempotency, review queue transaction (`decideSubmissions`) writing to the fee app's `students` **through the students module's server function** (so `audit_logs` and `value_sources` both record it), precedence (`mayWrite`).
- P4.3 Marks: `assessments` admin (exam coordinator), in-app marks grid for subject teachers scoped by `teaching_assignments`, Sampark round type "marks" keyed by `assessment_id`; both paths call one `saveMark()` that checks `status = 'open'`, validates against `max_marks`, upserts `student_records`, and relies on the trigger for `marks_change_log`. Lock/unlock by `assessments:lock` with reason.
- P4.4 Data migration `scripts/school-one/migrate-sampark.mjs`: reads Neon (read-only role), matches students on `sr_no = admission_no` (unique on both sides, else → report), maps teachers to `staff_profiles` by `sampark_teacher_id`/short name, copies `value_sources`, `change_log`, `submissions`, `student_records` (mapping `period` → `assessments`), `student_documents`, photos (Vercel Blob → Supabase Storage `student-photos`, newest wins by `updated_at`, per E9). Dry run produces `migration-report.md`; real run is idempotent (external id stamps).
- P4.5 WhatsApp: Sampark's three template kinds registered in `src/modules/whatsapp/domain/campaigns.ts` with `purpose = 'collection_*'`; sends logged in `whatsapp_reminder_sends`.
- P4.6 Sampark repo: replace the app with redirects only (`vercel.json` `redirects` for `/w/:token`, `/r/:token`, `/t/:token` → School One); keep the Vercel project forever (H2). Neon `sampark` paused; deletion ticket dated +90 days.

**Acceptance** — a teacher's existing WhatsApp button (old domain) lands on the same request in School One; migration report shows zero unmatched students (or each has a decision); every teacher-verified value in Sampark is present in Supabase with `source = teacher`; marks entered via link and via app produce identical `student_records` and `marks_change_log` rows; RLS test proves a subject teacher cannot read marks of an unassigned class.

**Production release** — Sunday, backup, migrations, dry-run migration → review → real migration → redirect deploy → smoke test with one real teacher link → flag `collection` for `raj@` and `exam_coordinator`. **Rollback** — Sampark on Neon is untouched until +90 days after verification and can be un-paused; School One collection tables retained.

### Phase 5 — Reports, report cards, parent progress messages (3 weeks)

- P5.1 Student progress view (attendance by term, marks by assessment, notes) for class/subject teachers and office.
- P5.2 Report card PDF: `src/modules/reports/domain/report-card-pdf.tsx` on the existing document kit; template versioned; bilingual; stored in Storage; `report_cards` rows.
- P5.3 Parent progress send: reuse the fee app's **document lane** (`api/service/documents`, signed URL as AiSensy media header, `AisensyMedia` rules — never an admission number in the filename); new template `progress_report_hi/en`; human-pressed per class or per student; family dedupe reused; quiet hours (D-5).
- P5.4 Exports (`exports:academic`): marks sheet, attendance summary, class list without sensitive columns; every export logged.

**Acceptance** — a report card for a Class 8 student renders in under 3 s, matches the school's letterhead conventions, and its send is logged with delivery status; a teacher without `reports:send_parent` cannot trigger a send from any path.

### Phase 6 — Automations, job console, MCP extension (2 weeks)

- P6.1 Jobs: `daily-summary` (to Janmejay/office), `incomplete-marks` (during `assessments.status = 'open'`), `collection-reminders`, `job-health` (yesterday's failed/missing runs → WhatsApp + Sentry).
- P6.2 `/protected/admin-tools/jobs`: last run, status, next run, manual trigger with `jobs:view`.
- P6.3 `schoolfees-live-mcp`: add read-only tools for attendance summaries, assessments, timetable/today, respecting the mirrored permission matrix (allowed roles list extended deliberately, not by default).

### Phase 7 — Backlog (triggered, not scheduled)

- Drive archive per closed year (assessment §5.4) — trigger D-11.
- Transport: driver lists and route rosters. The idea of messaging drivers about fee-overdue children is **policy-sensitive** (it affects a child's access to school); build the roster first, and treat any fee-linked message as an admin-only, human-pressed action after the school writes the policy down.
- Meta Cloud API direct (replacing AiSensy) — a messaging-module concern; nothing in School One assumes AiSensy beyond `src/modules/whatsapp/data/aisensy.ts`.
- Cashfree/Razorpay — fee-module track, its own plan, never in a School One release window.

---

## 6. Safety rails (apply to every prompt)

**Never**
- Read or write the production project from a development, preview, or CI context. The guard enforces it; the rule stands even if the guard is bypassed.
- Modify any table, RPC, trigger, or policy in the fee module: `payments`, `receipts`, `installments`, `payment_adjustments`, `receipt_adjustments`, `receipt_finance_adjustments`, `fee_settings`, `fee_policy_configs`, `student_fee_overrides`, `collection_closures`, `refund_requests`, `student_carry_forward_balances`, `student_late_fee_waivers`, `student_repayment_*`, `late_fee_*`, `settlement_pool_*`, `ledger_regeneration_*`, `config_change_*`, `prev_year_import_*`, `payment_import_*`, `family_payments`, `audit_logs`. Additive columns on `whatsapp_reminder_sends` are the only sanctioned touch in the messaging tables.
- Add a second posting path, a second write path to `students` outside the students module, or a `NEXT_PUBLIC_*` secret.
- Edit an applied migration; use `mcp__supabase__apply_migration`; run `supabase db push` against production from an agent session.
- Send a real WhatsApp message from dev/preview: `AISENSY_API_KEY` is **absent** in those scopes and `isAisensyConfigured()` must return false; tests assert the no-op path.
- Put a phone number, Aadhaar, or child's name in a fixture, test, seed, commit message, or prompt.

**Always**
- Every new user-facing surface and every new job checks a `feature_flags` key; nothing School One ships is visible to `director@vpps.co.in` until its flag is enabled for that user or role.
- One migration per concern; enum additions in their own file.
- New tables: RLS enabled, policies written, a negative RLS test (the wrong role gets zero rows), append-only trigger where the plan says append-only.
- Server writes: permission → scope → admin client; never trust a client-supplied `staff_id` or `class_id` without the scope check.
- Job routes: `runJob()` wrapper, per-job secret, idempotent, bounded batch, `job_runs` row.
- Bilingual strings via `next-intl` messages; Hindi first on teacher screens.
- Update the module README (what it owns / what must never happen) and `supabase/migrations/README.md` in the same PR.

**Environment matrix**

| Context | `VERCEL_ENV` | Supabase target | AiSensy | Guard behaviour |
|---|---|---|---|---|
| Production deploy | `production` | `vgqyilgstjvgohrsiwkb` | configured | allows |
| Preview deploy | `preview` | `schoolfees-dev` (`wtgxcptmucjerhufzjcf`) | absent | refuses production ref |
| Local dev | unset | local stack or `schoolfees-dev` | absent | refuses production ref unless `ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION=I understand` (scripts only, prints a red banner) |
| GitHub Actions backup | n/a | production, **read via dump only** | n/a | uses `SUPABASE_PROD_DB_URL` secret, environment-protected |
| Agent session | never production | dev/local | absent | — |

---

## 7. Environment variables and secrets (names only)

| Where | Name | Purpose |
|---|---|---|
| Vercel (all scopes) | `PRODUCTION_SUPABASE_PROJECT_REF` | the guard's reference value |
| Vercel Production | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | production project |
| Vercel Preview | same three names | **dev** project values |
| Vercel Production | `JOB_SECRET_NIGHTLY_BACKUP`, `JOB_SECRET_AUTO_DAY_CLOSE`, `JOB_SECRET_BACKUP_REPORT`, later `JOB_SECRET_ATTENDANCE`, `JOB_SECRET_DAILY_SUMMARY`… | one per job family; `CRON_SECRET` retired after Phase 0 |
| Supabase Vault (prod) | the same job secrets, read by `pg_cron` jobs via `vault.decrypted_secrets` (existing pattern) | |
| GitHub (environment `backup`) | `SUPABASE_PROD_DB_URL`, `BACKUP_AGE_RECIPIENT`, `GDRIVE_SA_JSON`, `GDRIVE_SHARED_DRIVE_ID`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `JOB_SECRET_BACKUP_REPORT`, `SCHOOLFEES_BASE_URL` | backups |
| Local `.env.local` | dev/local values; `ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION` only ever set by hand for a scripted read | |

---

## 8. Release procedure (every production release)

1. PR merged to `main` only after CI green and the AI review step (D-15) has no blocking finding.
2. Sunday/holiday window (D-16). Announce in the staff WhatsApp group if teachers are affected.
3. Trigger the backup workflow manually; wait for `backup_runs.verified = true`.
4. Apply migrations with `npx supabase db push --linked --yes` **from Janmejay's machine**, never from an agent session; confirm `supabase migration list` matches the repo.
5. Deploy (Vercel Git integration). Watch Sentry and `job_runs` for 24 hours.
6. Feature flag: `raj@` (canary, real data, `TEST-2026-27` writes only) → pilot users/roles → `director@` and everyone. A flag is never flipped for `director@` in the same step as the deploy.
7. Record the release in `docs/school-one/RELEASES.md` (date, migrations, flags, rollback note).

---

## 9. Still needed from Janmejay (does not block Phase 0)

| Item | Needed by | Worksheet ref |
|---|---|---|
| Confirm D-10 (backup key holder) | P0.4 | L2 |
| Sampark `teachers` + `teacher_subjects` export (phones outside git) | P1.3 | C1 |
| Class-teacher list per class | P1.8 | D4 |
| Academic calendar spreadsheet + exam windows | P1.8, P2.5 | D6, Q |
| Approved AiSensy template names (both apps) | P2.5 | J1 |
| Assessment names and max marks per class group | P4.3 | H3 |
| Confirm the three new role names are final (enum values cannot be removed) | P1.1 | C3 |
| Confirm C4/C5 defaults (D-1, D-2) | P2.4 | C4, C5 |
