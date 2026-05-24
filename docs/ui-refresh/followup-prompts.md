# UI Refresh — Follow-up Prompts

Five remaining adoption tasks for Claude Code. All are **additive** (no
destructive refactors of live financial flows). The Phase 0-7 primitives
they depend on are already in place and tested.

**How to use this file.** Open Claude Code at the repo root, paste one
prompt, validate, commit, then move on. Order is bottom-up: P1 and P2 are
the smallest/safest; P3 and P4 are bigger architectural moves; P5 is a
small polish that benefits from P3 landing first.

**Constraints repeated in every prompt (do not violate):**
- Never edit/delete posted `payments` or `receipts` rows.
- Never touch the live `2026-27` session for testing; use `TEST-2026-27`.
- No new payment-posting paths outside `/protected/payments`.
- Service-role Supabase client stays server-side only.
- Validation after every PR: `npm run check && npm run test && npm run build`.

---

## P1 — Wire `<StudentRowCollectButton>` into student rows

```
Goal: surface the "Collect" button on every student row (desktop + mobile)
so staff can open the global Collect drawer in one click without typing
into the command palette.

The primitive already exists at
`components/students/student-row-collect-button.tsx`. The drawer + provider
are already mounted in the protected layout. This PR is wiring only — no
new components.

Files to touch:
- `components/students/student-list-table.tsx` — the row component for both
  desktop (`StudentListTable`, around line 246) and mobile
  (`MobileStudentListItem`, around line 150). Each row already has an
  "Open" / "View" action column on desktop and an action area on mobile.
- `app/protected/students/[id]/page.tsx` (or the student header component
  it renders — typically `components/students/student-identity-strip.tsx`)
  — drop the trigger in the right-hand actions slot of the profile header.

What to insert (per row):
    <StudentRowCollectButton
      studentId={student.id}
      studentLabel={student.fullName}
      classLabel={student.classLabel}
      variant="ghost"
      size="sm"
    />

Gate it: only render when the current staff has `payments:write`. The
table already receives a `canWrite` prop (verify the exact name). Re-use
that — don't introduce a new permission check.

Constraints:
- Don't add a `useEffect` or any client-side fetch — the row already has
  every field the trigger needs.
- The mobile row layout is dense; place the button in the existing actions
  cluster rather than adding a new row to the layout. If space is tight,
  drop the text label and use `<CollectTrigger>` directly with an
  icon-only button via aria-label.
- The profile header trigger should be `variant="primary"` (it's the
  primary action there); table rows should be `variant="ghost"` so the
  page doesn't look like a Christmas tree.

Acceptance:
- Students list → row Collect → drawer opens with student pre-filled →
  "Open Payment Desk" routes to /protected/payments?studentId=<id>.
- Same flow from the profile header.
- Read-only staff sees no Collect button anywhere.
- Touch target ≥ 44px on mobile.

Validate: npm run check && npm run test && npm run build
```

---

## P2 — Adopt the table primitives on the four list pages

```
Goal: roll out the Phase 2 primitives (`<TableToolbar>`,
`<SavedViewsTabs>`, `<SummaryRow>`, `<SummaryCell>`, `<SelectionBar>`,
`useRowKeyboardNav`) across the four production list pages, ONE AT A
TIME, ONE PR PER PAGE.

Primitives live in:
- `components/data-table/table-toolbar.tsx`
- `components/data-table/saved-views-tabs.tsx`
- `components/data-table/summary-row.tsx`
- `components/data-table/selection-bar.tsx`
- `lib/data-table/saved-views.ts`
- `lib/data-table/keyboard-nav.ts`

Pages to adopt (in this order — easiest first):
  1. `app/protected/exports/page.tsx`         — read-only, low risk
  2. `app/protected/transactions/page.tsx`   — read-only finance records
  3. `app/protected/students/page.tsx`       — mutates students (write paths)
  4. `app/protected/defaulters/page.tsx`     — high traffic, dense data

For each page:

A. Wrap the existing filters in `<TableToolbar>`:
   - Lift the page's existing search input value into a controlled
     useState in a small client wrapper (if the page is currently a
     server component, introduce a client island for the toolbar).
   - Move existing filter chips into the `filters` slot.
   - Move existing right-side actions (Export, Add, …) into the
     `actions` slot.

B. Add `<SavedViewsTabs>` above the toolbar:
   - Use a `tableKey` of the form `vpps.<page>.views` (e.g. `students`,
     `transactions`, `defaulters`, `exports`).
   - Define a TypeScript type `<Page>ViewState` capturing the filter
     shape the page already serializes into the URL.
   - Pass at least one `builtIns` entry: `{ id: "default", label: "All",
     state: <emptyFilters>, builtIn: true }`.
   - On `onApply`, write the state back into the URL via the existing
     router push pattern so deep links continue to work.

C. Add `<SummaryRow>` at the bottom of the data area (NOT in the page
   footer — inside the panel that contains the table so it sticks to the
   table's scroll context):
   - Students: counts by status (active / archived / total).
   - Transactions: totals by mode for the visible filter (cash + UPI +
     bank + cheque), and grand total.
   - Defaulters: total outstanding for the visible filter + student
     count.
   - Exports: total downloads this week + last download timestamp.

D. Selection: only adopt `<SelectionBar>` where the page already supports
   multi-row actions (Students has bulk archive/import; Defaulters could
   bulk-snooze — but DON'T add new bulk mutation surfaces in this PR,
   only wire the bar for already-supported actions).

E. Keyboard nav: `useRowKeyboardNav({ rowIds, onOpen })` — only on
   Defaulters and Transactions where j/k row-traversal has the highest
   payoff. Skip Students and Exports for now to keep PR scope tight.

Constraints:
- DO NOT change any data-fetching shape, RPC signatures, or URL param
  schemas. Visual + interaction only.
- DO NOT introduce server-side persistence of saved views. localStorage
  via the existing `saved-views.ts` module is fine for this pass.
- DO NOT add column-virtualization yet — pages with <1000 rows don't
  need it; revisit if/when Defaulters exceeds 1000 active rows in
  production.
- Money cells must use the existing `<Money>` primitive.

Acceptance per page:
- Same rows render as before. The page passes its existing
  `tests/integration/<page>-*` and `tests/ui/<page>-*` tests unchanged.
- Saved views survive a refresh, are user-scoped via localStorage, and
  built-in views can't be deleted.
- Summary row totals reconcile to the visible filtered data (assert via
  one integration test per page).
- Density toggle (already in topbar) affects the table row heights via
  the `density-row`/`density-cell` utilities.

Validate per PR: npm run check && npm run test && npm run build
```

---

## P3 — Upgrade Collect drawer from soft drawer → true intercepting route

```
Goal: replace the current Collect "soft drawer" (which navigates into
/protected/payments) with a true intercepting-route drawer that mounts
Payment Desk INSIDE the drawer, so the user never leaves their context
(student row, defaulter triage, dashboard).

Why now, not in Phase 3: the live posting flow was too risky to wrap
into a drawer during the initial sprint. With the soft drawer in
production and the underlying RPCs untouched, we can confidently move
the rendering boundary.

Architecture: Next.js App Router parallel + intercepting routes.

Files to add:
- `app/protected/@drawer/default.tsx`        — null slot when nothing to
                                                show (returns `null`).
- `app/protected/@drawer/(.)payments/page.tsx`
    — Intercepts navigations to /protected/payments from inside
      /protected/* and renders the Payment Desk content inside a
      right-side Sheet. The route's `params` already include
      `searchParams.studentId`, `searchParams.classId`, `searchParams.session`,
      and `searchParams.returnTo` so the existing data loaders in
      `lib/payments/data.ts` work unchanged.
    — Wrap the existing `PaymentEntryClient` in a Sheet (use the existing
      `components/ui/sheet.tsx` primitive, side="right", size="full" on
      mobile).
    — On close, `router.back()` (so the user returns to the row they
      were on). When the URL was a deep link (no history), fall back to
      `router.push(searchParams.returnTo ?? "/protected/dashboard")`.

Files to modify:
- `app/protected/layout.tsx` — add the `@drawer` parallel slot:
    children: React.ReactNode;
    drawer: React.ReactNode;
    Render <DashboardShell>{children}</DashboardShell>{drawer}</...>.
- `components/payments/collect/collect-drawer.tsx` — DELETE THE INTERIM
  Sheet that confirms intent. Replace its "Open Payment Desk" CTA with a
  `router.push(/protected/payments?studentId=…)` — the intercepting
  route catches it.
- `app/protected/payments/page.tsx` — UNCHANGED. The non-intercepted
  (hard-loaded) version stays for direct deep links and bookmarks per
  the safety rule "Payment Desk stays the only posting surface".

Constraints — read carefully:
- The intercept ONLY fires for in-app navigations from /protected/*. A
  hard reload of /protected/payments?studentId=… still renders the
  classic page. Both render the same Payment Desk client.
- DO NOT duplicate the posting flow. Both the intercepted drawer and
  the hard-loaded page MUST mount the same `<PaymentEntryClient>` and
  the same server action. There is one posting code path.
- DO NOT remove the CollectProvider / useCollect / CollectTrigger /
  StudentRowCollectButton plumbing. CollectTrigger now becomes a thin
  alias for `router.push("/protected/payments?studentId=…")`.

Acceptance:
- From Students list row: click Collect → right-side drawer slides in
  with Payment Desk loaded for that student → post payment → receipt
  shown → drawer closes → still on Students list (URL was
  /protected/students throughout).
- From command palette: type "post payment" → drawer opens without
  pre-fill.
- Direct URL load of /protected/payments?studentId=… still works as a
  full page (bookmark scenario).
- /protected/payments retains all existing tests and behavior on direct
  load.

Tests to add:
- tests/integration/payment-intercept-drawer.test.ts — happy path,
  asserting one posting action call, receipt rendered, URL preserved.
- tests/integration/payment-intercept-deep-link.test.ts — deep load of
  /protected/payments?studentId=… still works without the parallel
  drawer slot.

Validate: npm run check && npm run test && npm run build
```

---

## P4 — Build the full Defaulters triage UI on top of cadence + contact log

```
Goal: complete the Defaulters page rewrite that the Phase 5 scaffolding
prepared for. The pure cadence functions, append-only `defaulter_contacts`
table, RLS, and WhatsApp template are all in place. This PR adds the UI
that uses them.

Files in place already (do not modify):
- `lib/defaulters/cadence.ts` — deriveCadence / snoozeIso / tallyCadence
- `lib/defaulters/whatsapp-template.ts` — composeDefaulterDraft
- `supabase/migrations/20260524120000_defaulter_contact_log.sql` — table

Files to add:
- `lib/defaulters/contacts.ts` — server data accessors:
    listLastContacts(studentIds, sessionLabel): Map<studentId, DefaulterContactSummary>
    insertContact({ studentId, sessionLabel, channel, outcome, snoozeUntil, note }): Promise<void>
  Both are RLS-scoped. The insert uses `requireStaffPermission("defaulters:view")`
  and writes append-only via the standard server Supabase client.
- `app/protected/defaulters/actions.ts` — server action `logContactAction`
  that wraps `insertContact`, validates inputs with zod, and calls
  `revalidatePath("/protected/defaulters")`. Idempotency token in the
  form field to prevent double-submission.
- `components/defaulters/contact-popover.tsx` — small inline form:
    channel select (call / whatsapp / sms / in_person / email)
    outcome select (reached / no_answer / promised_pay / dispute / other)
    snooze dropdown ("Don't snooze", "2 days", "5 days", "1 week", "2 weeks")
    optional 1-line note
    "Log contact" submit.
  Driven by `useFormState` against `logContactAction`. Closes on success
  and re-renders the row.
- `components/defaulters/whatsapp-draft-modal.tsx` — for bulk actions:
    Accepts a list of selected students + per-student outstanding amount.
    Renders one preview card per student with the composed text.
    "Copy" button per card. No "Send all" — that's a staff action.
- `components/defaulters/triage-tabs.tsx` — three tabs ("Call today",
  "This week", "Snoozed") backed by `SavedViewsTabs` from P2. Counts in
  badges come from `tallyCadence`.

Files to rewrite:
- `app/protected/defaulters/page.tsx` — keep the existing data fetching;
  layer the triage tabs above the existing filter chips; render the
  contact popover in each row's action area; wire `<SelectionBar>` (from
  P2) for "Mark contacted (no answer) + snooze 2 days" and "Generate
  WhatsApp drafts" bulk actions.

Constraints:
- Append-only. Never UPDATE or DELETE `defaulter_contacts`. A "mistake"
  is a NEW row with outcome='other' and a note.
- Drafts ONLY. The app NEVER sends WhatsApp / SMS. Copy-to-clipboard
  is the maximum integration. (Sending is a future, separate PR with
  channel-side approval.)
- Cadence derivation MUST go through the pure functions in
  `lib/defaulters/cadence.ts`. Do not re-implement.

Tests to add:
- tests/integration/defaulter-contact-log-action.test.ts — server action
  inserts a row, fires revalidate, RLS allows staff insert.
- tests/integration/defaulter-triage-cadence.test.ts — three tabs sum to
  the same set as the existing "all defaulters" view.
- tests/ui/contact-popover.test.tsx — focus trap, validation, success
  state.
- tests/ui/whatsapp-draft-modal.test.tsx — composes one card per
  selected student.

Validate: npm run check && npm run test && npm run build
```

---

## P5 — Sprinkle `<TrustBadge>` onto student profile + Payment Desk

```
Goal: extend the trust-ribbon pattern (already on dashboard KPIs and the
Transactions header) to two more places where staff stare at money
numbers and need confidence in the calculation.

Primitive: `components/trust/trust-badge.tsx`. Reuse — do not extend its
API.

Files to modify:

A. Student profile header (`app/protected/students/[id]/page.tsx` or
   wherever the "Total pending" headline number is rendered — typically
   `components/students/student-identity-strip.tsx` or
   `components/students/student-about-panel.tsx`):
   - Place a `<TrustBadge source="Workbook v1" computedAt={generatedAt} />`
     next to the "Total pending" amount.
   - Use the existing query result's timestamp as `computedAt`. If
     none exists, pass `new Date().toISOString()` and tag a TODO to
     replace with the real one when the workbook query starts returning
     it.

B. Payment Desk drawer header (`components/payments/payment-desk-mobile.tsx`
   and / or `components/payments/payment-desk-desktop.tsx`):
   - In the student summary strip near the top of the drawer, render
     `<TrustBadge source="Workbook v1" computedAt={data.generatedAt}>
        Calculated from the student workbook
      </TrustBadge>`.
   - If the drawer renders an "Amount due" line, place the badge inline
     to its right.

Constraints:
- Don't fetch new data just to populate `computedAt`. If the existing
  fetch result includes a timestamp, use it; otherwise omit `computedAt`
  (the badge handles a missing timestamp gracefully).
- Don't wire `onExplain` yet — that's the "show me the calc" affordance
  and belongs in a follow-up PR with a dedicated explain server function
  (`lib/trust/explain.ts` — the stub was sketched in Phase 6 and never
  implemented; defer to that future PR).
- Don't add `<AuditLink>` here — that's admin-only and Payment Desk is
  accountant-scoped.

Tests to add:
- tests/ui/student-profile-trust-badge.test.tsx — renders the badge in
  the profile header with the source label.
- tests/ui/payment-desk-trust-badge.test.tsx — renders the badge in the
  drawer's student summary strip.

Validate: npm run check && npm run test && npm run build
```

---

## Suggested merge order

```
P1  →  P2 (one PR per page)  →  P5  →  P3  →  P4
```

P1 is trivial unlock. P2 is the highest user-impact change and is the
prerequisite for P4's defaulter row layout. P5 is independent and
low-risk; ship it before P3 so the badges look identical between the
soft drawer and the intercept-drawer transition. P3 lands the
architectural shift. P4 lands the workflow that makes the architecture
worth it.

## What's still deliberately out of scope across all five PRs

- Server-side persistence of saved views (localStorage stays).
- Actual WhatsApp / SMS sending (drafts only).
- A new `lib/trust/explain.ts` server function for "show me the calc" —
  separate ticket once we know what shape staff actually want to see.
- Multi-school / multi-tenant primitives — VPPS is single-tenant by
  design.
- AI-generated dashboard narrative or any LLM in financial paths.
- Role trimming for `accountant` / `read_only_staff` — separate effort
  after admin UX is settled.
