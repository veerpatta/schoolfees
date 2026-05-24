# UI/UX Refresh — Claude Code Prompts

Sequenced prompts for Claude Code to modernize the VPPS school-fees admin app
without rewriting financial logic or touching live `2026-27` data.

**How to use this file.** Open Claude Code at the repo root and paste one
phase at a time. Wait for green `npm run check && npm run test && npm run build`
before moving to the next. Phases are ordered so later ones can lean on earlier
primitives.

**Scope right now.** Admin role only (full access). Role-gated trimming for
`accountant` and `read_only_staff` happens in a later pass — don't introduce
new permission checks beyond what already exists in
`lib/auth/roles.ts` and `lib/config/navigation.ts`.

**Hard constraints (applies to every phase).**
- Never edit/delete posted `payments` or `receipts` rows.
- Never touch the live `2026-27` session for testing; use `TEST-2026-27`.
- No new payment-posting paths outside `/protected/payments`.
- Service-role Supabase client stays server-side only.
- Validation sequence after every phase: `typecheck → lint → test → build`.

---

## Phase 0 — Design foundation (tokens, dark mode, shared primitives)

```
Foundation pass for the UI refresh. Goal: make the design system ready to support
command palette, drawers, dense tables, and trust ribbons in later phases — without
shipping any visible feature yet beyond a working dark-mode toggle.

Files to touch:
- app/globals.css — finalize CSS-variable tokens for dark mode (use the existing
  "Ledger Calm" palette already present; add the dark counterparts in
  `.dark { … }`). Add semantic tokens for `--surface-muted`, `--surface-raised`,
  `--ring-strong`, `--ring-soft`, `--num-positive`, `--num-pending`,
  `--num-credit`, and a `--scrim` for drawer/dialog overlays.
- tailwind.config.ts — expose the new tokens via `theme.extend.colors`.
- components/ui/theme-toggle.tsx — NEW. Tri-state (light/dark/system) using
  `next-themes`. Add `next-themes` to dependencies; wrap the protected layout
  with `<ThemeProvider attribute="class" defaultTheme="system" />`.
- components/admin/header.tsx (or wherever the topbar lives) — add the toggle on
  the right side near user menu.
- components/ui/density.tsx — NEW. Context provider + hook + 2-position toggle
  (cozy / compact). Persist choice in localStorage under
  `vpps.density`. Default = cozy.
- components/ui/money.tsx — NEW. `<Money value={paise} tone="default|positive|pending|credit" />`.
  Renders tabular figures, ₹ prefix, Indian-system grouping (lakh/crore).
  Single source of truth for amount rendering across the app.
- components/ui/empty-state.tsx — NEW. Props: icon, title, body, primary CTA,
  secondary link. Used by every empty list later.
- components/ui/section-header.tsx — NEW. Eyebrow + title + description +
  trailing actions slot. Replaces ad-hoc page headers.

Acceptance criteria:
- Dark mode toggle works on every protected page, no flash on first paint.
- Density toggle stored and respected (no usage yet — just the primitive).
- `<Money>` renders ₹1,23,456 not $123,456 and never goes scientific on
  very large amounts.
- All new components have a story-style example in
  components/ui/__examples__/<name>.example.tsx for quick visual review.
- No unrelated edits. Existing pages must look identical in light mode.

Validate: npm run typecheck && npm run lint && npm run test && npm run build
```

---

## Phase 1 — Command palette (Cmd/Ctrl+K)

```
Add a global command palette. This is the single highest-leverage UX change for
office staff — they remember concepts, not routes (note the route aliases for
/dues, /receipts, /ledger all pointing to Transactions).

Files to touch:
- components/command/command-palette.tsx — NEW. Wraps shadcn's `cmdk` Command
  primitive in a Dialog. Opens on Cmd/Ctrl+K (and `/` when no input is focused).
- components/command/providers.tsx — NEW. Pluggable provider interface:
    type CommandProvider = {
      id: string;
      label: string;
      fetch: (query: string, signal: AbortSignal) => Promise<CommandItem[]>;
    }
- components/command/providers/students.ts — search by name, admission #,
  parent phone. Uses an existing server action or new RPC at
  app/api/search/students/route.ts (server route, RLS-respecting).
- components/command/providers/receipts.ts — search by receipt number (SVP-…).
- components/command/providers/actions.ts — static list of admin actions:
  "Post a payment" → /protected/payments, "Open defaulters" → /protected/defaulters,
  "Export collections" → /protected/exports, "Switch session", "Toggle theme",
  "Toggle density", "Open keyboard shortcuts".
- components/command/providers/nav.ts — every item from lib/config/navigation.ts
  (respecting role visibility via requireAuthenticatedStaff on the API side; in
  client just filter by what the layout already received).
- lib/command/recents.ts — NEW. localStorage-backed "recently visited" list,
  capped at 8. Items: { kind: 'student'|'receipt'|'route', id, label, at }.
- app/protected/layout.tsx — mount <CommandPalette /> once, wire a `useEffect`
  for the keyboard shortcut, expose context for pushRecent().
- components/ui/keyboard-shortcuts.tsx — NEW. `?` opens a small sheet that lists
  all current shortcuts. Read from a single registry at lib/command/shortcuts.ts.

Behavior:
- Debounced 150ms search across providers in parallel; show grouped results.
- Arrow keys + Enter; Esc to close; ⌘+number to jump to top N results.
- Empty query state shows: recently viewed + pinned + top 5 actions.
- "Pin" star appears on hover of any student/receipt row; pinned list persists
  per user (server-side later; localStorage now is fine).
- All searches respect RLS — no admin-only data leaks.

Out of scope:
- Posting payments from the palette. The palette navigates to the Payment Desk
  drawer (Phase 3), it does not call post_student_payment itself.

Acceptance criteria:
- Cmd+K opens anywhere under /protected; no layout shift.
- Typing "ramesh" finds students; typing "SVP-2026-0123" finds the receipt.
- Recent items survive a refresh.
- All new code typed end-to-end. Tests:
    tests/unit/command/providers.test.ts (provider contract)
    tests/integration/command-palette.test.ts (open/close, keyboard nav)
    tests/ui/command-palette.test.tsx (renders, focus trap, esc closes)

Validate: npm run typecheck && npm run lint && npm run test && npm run build
```

---

## Phase 2 — Table upgrade kit (applies to every list page)

```
Replace the ad-hoc table patterns with a single dense-data primitive used by
Students, Transactions, Defaulters, Exports history, and Admin Tools logs.

Files to touch:
- components/data-table/data-table.tsx — NEW. Built on @tanstack/react-table.
  Required features:
    * Column virtualization via @tanstack/react-virtual (only for tables that
      pass `virtualize` prop, since some lists are short).
    * Sticky header AND sticky footer summary row (footer rendered when the
      caller passes `summary` cells).
    * Density-aware row heights (uses Phase 0 density context).
    * Row keyboard nav: j/k moves cursor, Enter triggers `onRowOpen`, e
      triggers `onRowEdit` (caller-provided).
    * Multi-select with Shift-click range; selection toolbar slides up from
      the bottom of the table area (NOT a full-screen sheet) showing count
      and bulk actions passed by the caller.
    * Column visibility menu (saved per-table per-user in localStorage).
- components/data-table/saved-views.tsx — NEW. Tabs across the top of any
  list page that store {filters, sort, columns, density} as a "view". Stored
  under `vpps.views.<tableKey>` in localStorage. "Default", "Mine", and
  user-created views. Rename / delete inline. No server sync yet.
- components/data-table/toolbar.tsx — NEW. Search input + filter chips +
  density toggle + column menu + "Save view" button.
- Refactor list pages to use the new primitive (one PR per page is fine, but
  do all of them in this phase):
    app/protected/students/page.tsx
    app/protected/transactions/page.tsx
    app/protected/defaulters/page.tsx
    app/protected/exports/page.tsx
- For each refactored page, add a sticky summary row showing the relevant
  aggregate(s): Students → counts by class; Transactions → total in / out for
  the visible filter; Defaulters → total outstanding for the visible filter;
  Exports → total downloads this week.

Constraints:
- DO NOT change any data-fetching shape or RPC signatures. The refactor is
  visual + interaction only.
- DO NOT add a server-side "saved views" table yet. localStorage is fine for
  this pass — note it as follow-up.
- Money cells must use the <Money> primitive from Phase 0.

Acceptance criteria:
- Same rows render as before but with sticky header/footer, density toggle,
  saved views, keyboard nav, and a bottom selection toolbar.
- Lighthouse: list pages remain ≥ 90 performance on a 5k-row Transactions list.
- Tests:
    tests/unit/data-table/saved-views.test.ts
    tests/ui/data-table.test.tsx (keyboard nav, sticky footer, density)
    tests/integration/transactions-table.test.ts (filters survive view switch)

Validate: npm run typecheck && npm run lint && npm run test && npm run build
```

---

## Phase 3 — Payment Desk as a slide-in drawer (context-preserving)

```
Make payment collection a right-side drawer that opens over whatever page the
user is on, with the student pre-filled. The full-page /protected/payments
route stays for the "post a payment from scratch" entry point and for direct
deep links — but 80% of usage moves to drawer-from-context.

This is a non-destructive refactor: existing post_student_payment RPC,
preview_workbook_payment_allocation RPC, idempotency, and receipt linkage
are unchanged.

Files to touch:
- components/payments/collect-drawer.tsx — NEW. Wraps the existing payment-desk
  form components inside a shadcn Sheet anchored right, width 540px desktop /
  full-screen mobile. Steps stay the same (student → installment(s) → mode →
  amount → preview → confirm). Sticky footer with primary "Post payment" CTA;
  the confirm step shows the preview allocation diff (uses the existing
  preview RPC).
- components/payments/collect-trigger.tsx — NEW. Small button + hook
  `useCollect()` that opens the drawer with an optional pre-filled studentId
  and pre-selected installment ids.
- Integrate triggers in:
    app/protected/students/[id]/* — "Collect" button in the student header
    app/protected/defaulters/page.tsx — "Collect" in row actions and the bulk
      action bar (bulk = open drawer once per selected student, queued)
    components/command/providers/actions.ts — "Post a payment" opens the drawer
      with no pre-fill instead of navigating
- app/protected/payments/page.tsx — keep working. Now it just renders the
  drawer in always-open mode anchored into the page layout (so deep links and
  bookmarks still work, and the route remains the only payment-posting surface
  per the safety rule).
- lib/payments/collect-context.tsx — NEW. Client context that owns
  `{ open, studentId, installmentIds, defaults }` and the open/close handlers.

Constraints:
- The drawer MUST call the same server actions / RPCs the page already calls.
  No new posting code paths.
- Drawer closes only after a successful post OR explicit cancel; never on
  outside click while the form is dirty (use unsaved-changes guard).
- Preview MUST run before confirm and display: installment allocation, late
  fee impact, adjusted amount due, resulting credit/refund balance.
- After post: drawer shows the receipt preview (PDF or in-app render) with
  "Print", "Download", "Share via WhatsApp" actions, then auto-closes on
  "Done".

Acceptance criteria:
- From Students list → row "Collect" → drawer opens with student pre-filled →
  post → receipt shown → drawer closes → list unchanged behind.
- Cmd+K → "Post a payment" → drawer opens without student.
- /protected/payments still renders the same drawer inline for deep links.
- Tests:
    tests/integration/payment-drawer-workflow.test.ts (the full happy path,
      mirroring the existing payment-desk-workflow test)
    tests/integration/payment-drawer-idempotency.test.ts (re-clicking confirm
      doesn't double-post)
    tests/ui/collect-drawer.test.tsx (unsaved-changes guard, focus trap)

Validate: npm run typecheck && npm run lint && npm run test && npm run build
```

---

## Phase 4 — Dashboard as a morning brief (not a KPI wall)

```
Reshape /protected/dashboard from a stat grid into a "what should I do today"
control tower. Admin role lands here by default.

Layout:
- Top: a one-line server-rendered narrative.
    "Today: ₹84,200 collected across 12 receipts. 47 students still owe Q1.
     3 receipts need an adjustment review."
  Generated by a new server function at
  lib/dashboard/morning-brief.ts that pulls from existing views
  (v_workbook_student_financials, v_student_financial_state, etc.) — no new
  schema, no RPC changes.
- Middle: exactly THREE action cards, each opens the relevant module pre-filtered:
    1. "Chase defaulters" — count + "Open queue" → /protected/defaulters
       with filter `cadence=today`
    2. "Reconcile yesterday" — count of unmatched cash/UPI entries (if 0, show
       a calm "All clear" state)
    3. "Next due date" — countdown to next installment + % students unpaid
- Right rail (desktop) / collapsed sheet (mobile): live activity feed —
  last 20 payments + adjustments posted, each with timestamp, staff name,
  amount (using <Money>), and a deep link to the receipt drawer.
- Below: a compact KPI strip (today / WTD / MTD / YTD collections, with sparkline)
  using <Money> and tabular figures. Keep this — but make it secondary, not the headline.

Files to touch:
- app/protected/dashboard/page.tsx — top-level rewrite using the new sections.
- components/dashboard/morning-brief.tsx — NEW. Server component, renders the
  one-liner.
- components/dashboard/action-card.tsx — NEW. icon + count + label + CTA.
- components/dashboard/activity-feed.tsx — NEW. Client component, polls every
  60s using a server action; row click opens the receipt or student via
  existing drawer triggers from Phase 3.
- lib/dashboard/morning-brief.ts — NEW. Server function that composes the
  narrative deterministically — DO NOT use an LLM here. Trust requires
  predictable numbers.
- components/dashboard/kpi-strip.tsx — refactor existing stat cards into a
  single horizontal strip.

Acceptance criteria:
- Page load shows the brief sentence above the fold on a 13" laptop.
- Action card counts match the underlying filtered queries (write an
  integration test that asserts the dashboard's "47 owe Q1" matches the
  Defaulters page count for cadence=today).
- Activity feed updates without a full page refresh.
- No new server actions other than the polling one for the feed.

Validate: npm run typecheck && npm run lint && npm run test && npm run build
```

---

## Phase 5 — Defaulters as a triage queue

```
Replace the flat defaulters list with a triage workflow that mirrors how the
office actually chases parents.

Files to touch:
- app/protected/defaulters/page.tsx — rewrite around three tabs (saved views
  from Phase 2):
    "Call today" — outstanding ≥ 0 AND (never_contacted OR snooze_until ≤ today)
    "This week" — snooze_until between today and today+7
    "Snoozed" — snooze_until > today+7
- lib/defaulters/cadence.ts — NEW. Pure functions for cadence derivation;
  fully unit-tested.
- supabase/migrations/<next>_defaulter_contact_log.sql — NEW. Append-only
  contact log table:
    defaulter_contacts(
      id uuid pk,
      student_id uuid fk,
      session text,
      contacted_at timestamptz default now(),
      contacted_by uuid fk staff,
      channel text check (channel in ('call','whatsapp','sms','in_person','email')),
      outcome text check (outcome in ('reached','no_answer','promised_pay','dispute','other')),
      snooze_until date,
      note text,
      created_at timestamptz default now()
    )
  RLS: same pattern as other staff-scoped tables. Index on (student_id, contacted_at desc).
- Row actions: "Log contact" (opens a small popover form, posts a contact row,
  optionally snoozes), "Collect" (opens Phase 3 drawer), "Open student".
- Bulk actions: "Mark contacted (no answer) + snooze 2 days", "Generate
  WhatsApp drafts" (opens a modal with one templated message per selected
  student, copy-to-clipboard one at a time).
- components/defaulters/contact-popover.tsx — NEW.
- components/defaulters/whatsapp-drafts.tsx — NEW. Uses a single template
  string with {studentName}, {className}, {amount}, {dueDate}, {schoolName}
  placeholders. Template editable in Admin Tools (Phase 7).

Constraints:
- DO NOT send WhatsApp/SMS from the app — generate the message and copy-to-
  clipboard. Sending requires staff action. (You can wire a real channel in a
  future phase.)
- Contact log is append-only — no edits, no deletes. Mistakes get a new row
  with outcome='other' and a note.

Acceptance criteria:
- The three tabs sum to the same set as the existing "all defaulters" view.
- Logging a contact updates cadence within one refetch.
- Tests:
    tests/unit/defaulters/cadence.test.ts
    tests/integration/defaulter-contact-log.test.ts (insert, query, snooze
      moves row between tabs)
    tests/db/defaulter_contacts_rls.test.ts (RLS prevents cross-role mischief)

Validate: npm run typecheck && npm run lint && npm run test && npm run build
```

---

## Phase 6 — Trust ribbons + audit visibility

```
Every money number in the app should show its work. Build the primitive once,
apply in five places.

Files to touch:
- components/trust/trust-badge.tsx — NEW. Small chip with timestamp
  ("as of 10:42 AM") + info icon. On hover/click opens a popover/drawer
  showing:
    * The source of the number (which view/RPC produced it)
    * The calculation breakdown (workbook rows, late fees, adjustments)
    * A link to the immutable audit trail (payments + payment_adjustments
      rows that contributed)
- lib/trust/explain.ts — NEW. Server functions:
    explainStudentPending(studentId, session): WorkbookBreakdown
    explainCollectionTotal(filter): { payments: ..., adjustments: ... }
  Both read from existing views, no new schema.
- Apply <TrustBadge> next to:
    1. Dashboard KPI strip totals (Phase 4)
    2. Defaulter row amount (Phase 5)
    3. Student profile "Total pending" header (app/protected/students/[id])
    4. Payment Desk drawer "Amount due" line (Phase 3)
    5. Transactions table footer summary (Phase 2)
- components/trust/audit-link.tsx — NEW. Renders a "View audit trail" anchor
  on any record that resolves to /protected/admin-tools/audit?recordId=...
  (admin-only route — already gated).

Acceptance criteria:
- Clicking any trust badge surfaces a breakdown whose numbers reconcile to
  the displayed total (assert this in an integration test).
- No double-fetch: the breakdown is fetched lazily on open, not on every
  render of the badge.

Validate: npm run typecheck && npm run lint && npm run test && npm run build
```

---

## Phase 7 — Polish pass (empty states, sticky form footers, validation explainers, settings)

```
Final sweep — small things that compound into "feels like a real product."

A. Empty states everywhere
- Audit every list and replace any raw "No records" with <EmptyState> (Phase 0).
  Each must include: icon, one-line "what this view shows when populated",
  primary CTA appropriate to the page (e.g. "Add student" on Students,
  "Adjust filters" on Defaulters), and a doc link when relevant.

B. Sticky action footers on long forms
- Wrap Fee Setup editor and any multi-step form with a SaveBar component:
  components/forms/save-bar.tsx — NEW. Slides up from the bottom when the
  form is dirty, shows "X unsaved changes", primary Save + Discard, and a
  spinner during save. Disappears when clean.

C. Inline validation explainers
- components/forms/why-disabled.tsx — NEW. Small "Why is this disabled?" link
  next to any disabled primary action; opens a popover that lists the
  gating reasons (e.g. "Amount exceeds balance", "Cheque number required",
  "Receipt date in the future").
- Apply at minimum on:
    Payment Desk drawer "Post payment" CTA
    Fee Setup "Publish" CTA
    Student import "Commit valid rows" CTA

D. Settings page
- app/protected/settings/page.tsx — NEW. Single page with three sections:
    Appearance (theme, density)
    Defaults (preferred session, default Payment Desk mode)
    Templates (WhatsApp defaulter template from Phase 5)
- Wire from the user menu and from Cmd+K "Open settings".

E. Onboarding hint
- First-time admin sees a single dismissable tip card at the top of the
  dashboard: "Press Cmd+K to jump anywhere." Dismissal stored in localStorage
  under vpps.hints.cmdk.

Acceptance criteria:
- No raw "No data" strings remain in the app (grep for the literal in
  components/ and app/).
- Save bar appears within 150ms of a dirty form.
- Every disabled primary CTA in the surfaces above has a why-disabled link.
- Settings page is reachable from user menu and Cmd+K.

Validate: npm run typecheck && npm run lint && npm run test && npm run build
```

---

## Out of scope for this refresh (deliberately deferred)

- Server-side persistence of saved views, pinned items, and recent items
  (localStorage is fine for now; revisit when multi-device staff use cases
  arise).
- Real WhatsApp/SMS sending (drafts only; channel integration is a separate
  decision).
- Role trimming for `accountant` and `read_only_staff` — handle in a dedicated
  follow-up after admin UX is settled.
- AI-generated dashboard narrative — the morning brief must stay deterministic
  so totals are auditable.
- Bulk payment posting — every payment continues through the existing single
  drawer / single RPC path per the safety rule.
