# Full Implementation Prompts — Claude Code

Self-contained prompts covering every actionable item in `docs/ui-refresh/mobile-and-bugs-punchlist.md`. Paste any prompt into a fresh Claude Code session — each is designed to be runnable without prior context from this session.

**Suggested merge order (top → bottom is the recommended sequence):**

1. **P0-2** — Installment dedupe (source-side data fix, blocks accurate display everywhere)
2. **P1-1** — Collection heatmap month toggle (small, isolated, high user value)
3. **P1-3** — AI export multi-sheet workbook (additive, no risk)
4. **P0-1** — 3rd Child Policy data hygiene (low priority — office already confirmed financial correctness; this is preventive)
5. **P2** — Mobile audit (manual phone-in-hand pass; needed before any P2 implementation)
6. **P3** — Polish items, only if everything above is done and office staff are asking

---

## Universal safety reminders (paste at top of every prompt)

```
You're working in C:\Users\janme\Documents\schoolfees — a live single-tenant
fee-management Next.js + Supabase app for Shri Veer Patta Senior Secondary
School (VPPS). 479 students, 136+ payments, AY 2026-27 is the live session.

HARD RULES from CLAUDE.md (non-negotiable):
1. Never directly edit or delete posted `payments` or `receipts` rows. Use
   `payment_adjustments` with audit trail for corrections.
2. Never expose SUPABASE_SERVICE_ROLE_KEY in browser code or NEXT_PUBLIC_*.
3. `/protected` root redirect must never loop back to itself.
4. No alternate payment-posting paths outside Payment Desk (/protected/payments).
5. 2026-27 is live with real school financial records. Use TEST-2026-27 for any
   experimental work. Never add test data or post test payments to 2026-27.
6. Fee Setup publish must preview impact first and protect paid/partial/
   adjusted rows from silent rewrite.

Before declaring done: npm run check (lint + typecheck), npm run test, npm run build.
Commit with a clear message. Push to main; Vercel auto-deploys.
```

---

# P0-2 — Dedupe installment labels at source

## Prompt

```
Read these first:
- CLAUDE.md (project constraints)
- docs/ui-refresh/mobile-and-bugs-punchlist.md (item P0-2 for full context)

PROBLEM:
The view `v_workbook_installment_balances` returns 2 rows per
(class_id, installment_no) for every installment in AY 2026-27. Same due_date,
two different installment_label variants — e.g., for installment 1:
- "Installment 1"
- "Installment 1 (20-04-2026)"

This duplication propagates to:
- components/dashboard/class-installment-matrix.tsx (renders 8 columns instead of 4)
- The InstallmentTrack desktop view dedupes via grid-cols-4 but still receives 8 rows
- Any export / report touching installments

ROOT CAUSE LOCATION:
Walk supabase/migrations/ to find what populates fee_installment_schedule (or
whatever table v_workbook_installment_balances reads from). Look for a recent
data load that may have created the duplicate label variants. Likely culprits:
- A migration that added the "(DD-MM-YYYY)" suffix without deleting the old rows
- A repair script that ran twice
- A workbook regeneration that wrote new labels alongside old ones

FIX (Option A — preferred):
1. Write a one-off SQL script in scripts/dedupe-installment-labels.mjs that:
   a. Identifies all (class_id, installment_no) groups with >1 distinct label
   b. For each, picks the longer/more-descriptive label (the one with the date suffix)
   c. UPDATEs the kept row, DELETEs the duplicate
   d. Logs everything for audit
2. Run the script against the live DB (it's a data correction, not a schema change)
3. Verify `SELECT installment_no, count(distinct installment_label) FROM
   v_workbook_installment_balances WHERE session_label='2026-27' GROUP BY
   installment_no` returns 1 row per installment_no with distinct_labels=1.

FIX (Option B — backup if Option A is risky):
Patch lib/dashboard/summary.ts where the class matrix is built (around line
408–440 — the classMatrixMap reducer and distinctInstallments map). Change
the dedupe key from `installment_label` to `installment_no` only, and pick the
longest label deterministically. This is cosmetic only — doesn't fix the
underlying duplication for exports/reports.

I recommend Option A unless you find it's not safe to delete the duplicates
(e.g., they're referenced by foreign keys in payment_allocations).

ACCEPTANCE CRITERIA:
- After the fix, the dashboard Installment Progress section shows exactly 4 cards
- ClassInstallmentMatrixTable shows exactly 4 columns
- No installment count changes for any class (no class loses an installment)
- All existing payments and receipts still resolve correctly to their installment
- npm run check + npm run test all pass

VALIDATION:
- Run scripts/verify-live-fee-health.mjs after the fix
- Smoke the dashboard in browser at https://schoolfees-two.vercel.app/protected/dashboard
- Verify a paid student's installment history still resolves correctly

SAFETY:
- This touches live financial data. Take a backup of fee_installment_schedule
  (or the source table) before running the dedupe script.
- DRY-RUN mode first: log what would change without actually changing it.
- Wrap the actual UPDATE/DELETE in an explicit transaction.
```

---

# P1-1 — Collection heatmap month toggle

## Prompt

```
Read these first:
- CLAUDE.md (project constraints)
- components/dashboard/collection-heatmap.tsx (the component to upgrade)
- lib/dashboard/summary.ts (where the trend data is shaped)
- lib/dashboard/data.ts (the server-side fetch — find getCollectionHeatmapData
  or similar)
- app/protected/dashboard/page.tsx (where the heatmap is rendered, search for
  CollectionHeatmap)

GOAL:
Today the heatmap is hardcoded to the current month via getSchoolMonthParts().
Add a month toggle so the user can look at prior months too.

DESIGN:
- Header row of the existing card: title "Collection heatmap" with two chevron
  buttons (`<` and `>`) and a label like "May 2026" in the middle.
- Disable `>` when at the current month (no future heatmap to view).
- Disable `<` when at the earliest month that has data (e.g., start of the
  academic session, 2026-04 for AY 2026-27).
- Default state: current month.

IMPLEMENTATION (recommended: client-side filter, no extra server round-trip):
1. Extend the server-side fetch in lib/dashboard/data.ts to load the
   trailing 90 days of receipts (or back to session start, whichever is
   shorter). Pass that full dataset as the `collections` prop.
2. In components/dashboard/collection-heatmap.tsx, lift the visible month
   into useState({year, month}), default to current. Take a new `minMonth`
   prop derived from the earliest date in `collections`.
3. Memo-compute the {year, month, daysInMonth, startOffset, cells} from
   the chosen month + the filtered collections.
4. Render two icon buttons (use ChevronLeft / ChevronRight from lucide-react)
   with aria-labels "Previous month" / "Next month", disabled when at bounds.
5. Use Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }) for
   the label.

ALTERNATIVE (server-side fetch on toggle):
Only do this if the trailing-90-days payload becomes too large (>1MB). Pass
the heatmap selection through URL search params (`?heatmap=2026-04`) and
rebuild on navigation. Avoid this initially.

ACCEPTANCE CRITERIA:
- Default view unchanged (current month, no visual regression)
- `<` and `>` buttons work, disabled appropriately at month boundaries
- Label updates correctly to "April 2026", "March 2026", etc.
- Heatmap cells re-color correctly with each month's data
- No accessibility regressions: buttons have aria-labels, focus rings visible
- Mobile layout (md:hidden) still works

TESTS TO ADD:
- tests/unit/collection-heatmap-month-nav.test.tsx — assert chevron buttons
  exist, disabled-at-bounds behavior, label format
- Snapshot of the cell grid for a non-current month

DO NOT:
- Add date-fns or moment.js — use built-in Date + Intl
- Add localStorage persistence of the selected month (it's an in-session view)
- Add a date picker (out of scope — chevron-only is fine)
```

---

# P1-3 — AI export multi-sheet workbook with README

## Prompt

```
Read these first:
- CLAUDE.md (project constraints)
- app/protected/exports/[exportType]/route.ts (the existing export route)
- app/protected/exports/page.tsx (where the UI tiles are defined)
- lib/students/data.ts, lib/transactions/dues.ts, lib/fees/data.ts (where the
  data is sourced — DO NOT re-implement these; reuse them)

GOAL:
Add a new export type `ai-context-bundle` (label: "Full AI context") that
produces a multi-sheet XLSX file with EVERYTHING an LLM would need to answer
any question about the school's current fee state.

SHEETS REQUIRED:
1. _README — One-page natural-language summary. Orientation for the AI:
   - "This file is a snapshot of the VPPS school fee management system as of <ISO date>"
   - The active academic session label and what it means
   - The fee plan (4 installments, due dates, late fee policy)
   - Conventional discount policies and how they apply
   - Column glossary for every other sheet
   - A "How to interpret this" paragraph
2. Students — all active students with class, route, phone, status, discounts
3. Installments — per-student per-installment expected/paid/pending/late_fee
4. Payments — every receipt with mode, ref no, allocation breakdown, posted_at
5. Classes — class master + fee_settings per class (tuition / academic / books)
6. Routes — transport route master + per-route fees
7. Discounts — conventional discount policies + every active assignment
8. Defaulters — current outstanding follow-up list
9. Sessions — session metadata (current, prior, fee plans for each)

IMPLEMENTATION:
1. In app/protected/exports/[exportType]/route.ts:
   - Add a new branch: `if (exportType === "ai-context-bundle") { ... }`
   - Use xlsx's `book_new`, `json_to_sheet`, `book_append_sheet` per data source
   - REUSE existing helpers from lib/* — do not write new SQL queries inside the route
   - For _README, build a string with line breaks, push as a single-column sheet
2. In app/protected/exports/page.tsx:
   - Add a new export group "For analysis" OR add to the "Payments" group
   - Tile: `{ key: "ai-context-bundle", label: "Full AI context", detail:
     "Multi-sheet workbook with everything an LLM needs.", icon: Sparkles,
     tone: "info" }`
   - Import Sparkles from lucide-react

CAVEATS / SAFETY:
- The file could be 5–10MB for 479 students × 4 installments × 100+ payments.
  Add a streaming buffer (don't load everything into memory if you can avoid it).
- Show the user a warning in the export tile detail text: "Large file — may
  take 10–20 seconds to generate."
- Don't include parent phone numbers in the _README sheet (PII discipline) —
  put them only in the Students sheet where the existing exports already do.

ACCEPTANCE CRITERIA:
- New tile appears on /protected/exports page
- Click downloads VPPS-ai-context-bundle-2026-27-YYYY-MM-DD.xlsx
- Opening the file in Excel/Numbers/Sheets shows 9 sheets in the order above
- _README sheet has at least 30 lines of orientation text
- Every other sheet has a header row + data rows
- npm run check + npm run test + npm run build all pass

TESTS TO ADD:
- tests/integration/ai-context-bundle-export.test.ts — assert the route returns
  an xlsx file, parse it back, verify sheet names and row counts > 0

DO NOT:
- Add a sheet for receipt PDFs (out of scope — too large)
- Add an "AI prompt" sheet that tells the LLM what to do — that's the user's
  job, not the export's
- Add per-student page-break formatting (this is a data export, not a printable)
```

---

# P0-1 (optional) — 3rd Child Policy data hygiene

## Prompt

```
Read these first:
- CLAUDE.md (HARD SAFETY RULES, especially #1 and #6)
- docs/ui-refresh/mobile-and-bugs-punchlist.md (item P0-1 for full status)
- lib/fees/conventional-discounts.ts
- lib/fees/conventional-discount-rules.ts

CONTEXT:
8 students have an active 3rd Child Policy assignment for AY 2026-27 but their
student_family_members rows weren't populated by the bulk data-revamp script
that ran on 2026-05-24. The office has CONFIRMED these 8 assignments are
financially correct — DO NOT deactivate or reverse them.

This is purely a data-hygiene cleanup. There are two parts:

PART A — Backfill family group memberships (optional, ~30 mins):
For each of the 8 students, create (if not exists) a student_family_groups row
matching their family surname, and INSERT a student_family_members row linking
the student to that group with is_policy_candidate=true. This makes the
automatic applyThirdChildPolicyForFamilyGroup logic own the records going
forward, so a future auto-apply run won't overwrite them.

The 8 students:
- ANANYA LAKHARA (SR 2480, Class 3)
- MADAN SINGH (SR 2235, Class 2)
- MOHIT REBARI (SR 2443, Class 4)
- NIRALI KANWAR CHUNDAWAT (SR 2490, Class 3)
- NIYATI RAO (SR 2492, Class 3)
- TANISHA KANWAR (SR 2302, Class 2)
- VISHVAPAL SINGH (SR 2456, Class 4)
- YOGESHWAR SINGH CHUNDAWAT (SR 2614, Class 2)

For each: ask the user for the actual sibling SR numbers in the family. Do not
guess family relationships from surnames alone — Indian surnames are often
shared across unrelated families.

PART B — DB CHECK constraint (recommended, ~15 mins):
Add a migration that enforces: for any row in
student_conventional_discount_assignments where the policy_id resolves to
code='third_child', either family_group_id IS NOT NULL or is_manual_override=true
must be true. This prevents future bulk-import scripts from sneaking through.

CHECK constraint with a subquery isn't directly supported in PostgreSQL — use
a trigger function instead:

  CREATE OR REPLACE FUNCTION enforce_third_child_traceability()
  RETURNS trigger AS $$
  BEGIN
    IF NEW.is_active = true
       AND EXISTS (SELECT 1 FROM conventional_discount_policies p
                   WHERE p.id = NEW.policy_id AND p.code = 'third_child')
       AND NEW.family_group_id IS NULL
       AND COALESCE(NEW.is_manual_override, false) = false
    THEN
      RAISE EXCEPTION 'third_child policy assignment requires family_group_id or is_manual_override=true';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER enforce_third_child_traceability_trg
    BEFORE INSERT OR UPDATE ON student_conventional_discount_assignments
    FOR EACH ROW EXECUTE FUNCTION enforce_third_child_traceability();

Then in supabase/migrations/<timestamp>_third_child_traceability_trigger.sql.

ACCEPTANCE CRITERIA:
- (A) The 8 students appear in student_family_members linked to their actual
  family groups (per office confirmation)
- (B) Trying to INSERT a fresh row with policy_code='third_child' +
  family_group_id=NULL + is_manual_override=false RAISES an exception
- (B) Existing 8 rows are NOT broken by the trigger (it only fires on
  INSERT/UPDATE — pre-existing rows are grandfathered until updated)
- npm run check + tests pass
- Manual override path (saveStudentConventionalDiscountAssignments with
  manualOverrideReason) still works for legitimate exception cases

SAFETY:
- LIVE DATA. Test on a TEST-2026-27 session first.
- Take a DB backup before running the trigger migration.
- Part A: per-student work, verify each link with the office before insert.
- Part B: the trigger applies to ALL future writes including legitimate ones —
  make sure the existing auto-apply path passes the constraint (it does, since
  it sets family_group_id).
```

---

# P2-1, P2-2, P2-3 — Mobile audit + targeted fixes

## Prompt (audit)

```
Read these first:
- CLAUDE.md
- docs/ui-refresh/mobile-and-bugs-punchlist.md (Tier P2 — Mobile UX section)
- components/admin/mobile-bottom-nav.tsx
- components/payments/payment-desk-mobile.tsx
- components/payments/mobile-payment-flow-sheet.tsx
- components/payments/mobile-payment-mode-sheet.tsx
- tests/ui/mobile-ux-roadmap.test.ts (the existing mobile contract)

GOAL:
Manual phone-in-hand audit of the production app. Open https://schoolfees-two.vercel.app
on an actual phone (iOS Safari + Android Chrome both), navigate every workspace
tab, screenshot anything that's misaligned, overflowing, or hard to tap.

CHECKLIST (open each on phone, screenshot anything wrong):
1. /protected/dashboard
   - Top KPI cards stack vertically without horizontal scroll
   - MobileSecondaryKpis strip appears below
   - Morning brief readable in 1 line at typical phone width (390px)
   - Bottom FAB "Open Desk" visible above the bottom nav, not clipping
2. /protected/students
   - Student rows readable; Collect button reachable with thumb
   - Filters card can collapse to save space
3. /protected/payments
   - Two-column desktop view → stepper / sheet flow on mobile
   - Class dropdown, name search, student list all functional
   - Amount input is the large 3xl bg-accent variant
   - Pressing post triggers haptic [50, 30, 80]
4. /protected/transactions
   - Filter pill row scrolls horizontally; no overflow off-screen
   - Receipt rows truncate gracefully
5. /protected/defaulters
   - Filters collapse-by-default on mobile
   - WhatsApp template contact actions render correctly
6. /protected/exports
   - 3 category cards stack
   - Download tiles readable
7. /protected/admin-tools
   - Status banner readable
8. Bottom nav
   - 4 primary tabs + More overflow open/close cleanly
   - Touch targets >= 44px (use Chrome DevTools inspect)
   - "More" overflow tray covers full screen with X close in top-right

DELIVERABLE:
Create docs/ui-refresh/mobile-audit-screenshots.md with:
- One section per screen
- A pasted screenshot URL (or just describe the issue if no screenshot)
- A specific code fix recommendation (file + line)

Then, for any P2 issue you find, write a follow-up PR scoped to that fix only.
Don't bundle them — small surgical PRs per regression so review is easy.

DO NOT:
- Try to validate mobile via Chrome DevTools device emulation in this session
  unless you actually have a phone. Phantom mobile fixes are worse than no fix.
- Push code without phone verification of the actual change.
```

---

# P3 — Polish (do only if everything above is done)

## Prompt

```
Read these first:
- CLAUDE.md
- docs/ui-refresh/mobile-and-bugs-punchlist.md (Tier P3)

These are all small polish items. Do them ONLY if every P0/P1/P2 item is shipped
and verified, AND office staff have specifically asked for them. Don't do polish
just to do polish.

P3-1: Receipts route under Transactions nav
   Decide with the office whether /protected/receipts should be promoted to its
   own top-level nav item, or stay grouped under Transactions. If promoting:
   edit lib/config/navigation.ts to add a top-level entry, drop the receipts
   alias from Transactions.

P3-2: Dashboard double-title cleanup
   Topbar shows page title; H1 shows "Dashboard". On narrow viewports it feels
   redundant. Test: hide H1 when topbar title is identical AND viewport is
   below md. Edit app/protected/dashboard/page.tsx.

P3-3: Installment progress percentage audit
   After P0-2 is fixed, verify the "35% Overdue / 0% Upcoming" badges read
   sensibly with corrected data. Edit lib/dashboard/summary.ts if labels need
   adjustment.

P3-4: Morning brief variations
   composeMorningBrief() in lib/dashboard/morning-brief.ts is generic. Add 3–4
   templated variations based on day-of-week + installment-window-state. Pure
   function, easy to test.

Each P3 item is a 30-min change at most. Don't bundle them.
```

---

## Final notes for whoever picks this up

- **Each prompt is designed to be pasted into a fresh Claude Code session.** No prior context required.
- **The "Universal safety reminders" block** belongs at the top of every prompt — copy it in before pasting the body.
- **Sequencing matters.** P0-2 first (it's a data fix that improves correctness of every downstream report). Then P1-1 + P1-3 in either order. P0-1 can wait. P2 needs a phone. P3 needs office demand.
- **Verification is non-negotiable.** Every prompt ends with `npm run check + npm run test + npm run build` — do not skip these, do not paper over failures.
- **Live data discipline.** Anything touching the database needs a backup + dry-run + transaction wrap. The 2026-27 session is real money.

If anything in this doc becomes stale (e.g., a file got renamed, a test passes differently), update this file as you go. It's a living reference.
