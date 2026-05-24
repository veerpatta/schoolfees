# UI/UX + Bug Punch-List — May 2026

Compiled from: live production smoke walk, code-level read of dashboard / discounts / exports / mobile chrome, and three live SQL diagnostic queries against the AY 2026-27 database.

**Read this first.** Two of the items below are **real-money financial bugs** affecting live student records. They are flagged P0 and should be fixed (with audit trail via `payment_adjustments`, per CLAUDE.md hard safety rule #1) before any cosmetic mobile work. If you read no further, jump to **P0-1** and **P0-2**.

---

## Tier P0 — Data correctness (real ₹ on the line)

### P0-1 — `3rd Child Policy` data hygiene (NOT a financial bug — office confirmed)

**Status update (2026-05-24, after owner review):** The 8 students flagged below are **legitimately on the policy** per the school office. The discount amounts are correct. **No deactivation needed. No `payment_adjustments` needed.** The only real issue is internal data hygiene: their `student_family_members` rows weren't backfilled when the data revamp script ran.

**What's still worth fixing (optional, low priority):**

a. **Backfill family group membership** so the automatic policy applicator (`applyThirdChildPolicyForFamilyGroup`) owns these 8 records going forward instead of them being "orphan" manual assignments. Without this, anyone re-running the auto-apply logic could overwrite them.

b. **Add a DB CHECK constraint** on `student_conventional_discount_assignments`: for `policy_code = 'third_child'`, require either `family_group_id IS NOT NULL` or `is_manual_override = true`. Prevents future direct-insert mistakes by scripts that bypass the proper paths.

**The 8 students for reference:**

| Student | SR no | Class | Base → Discounted | Annual ₹ | Receipts |
|---|---|---|---|---|---|
| ANANYA LAKHARA | 2480 | Class 3 | ₹19,000 → ₹6,000 | ₹13,000 | 4 |
| MADAN SINGH | 2235 | Class 2 | ₹18,500 → ₹6,000 | ₹12,500 | 0 |
| MOHIT REBARI | 2443 | Class 4 | ₹19,500 → ₹6,000 | ₹13,500 | 1 |
| NIRALI KANWAR CHUNDAWAT | 2490 | Class 3 | ₹19,000 → ₹6,000 | ₹13,000 | 0 |
| NIYATI RAO | 2492 | Class 3 | ₹19,000 → ₹6,000 | ₹13,000 | 1 |
| TANISHA KANWAR | 2302 | Class 2 | ₹18,500 → ₹6,000 | ₹12,500 | 0 |
| VISHVAPAL SINGH | 2456 | Class 4 | ₹19,500 → ₹6,000 | ₹13,500 | 1 |
| YOGESHWAR SINGH CHUNDAWAT | 2614 | Class 2 | ₹18,500 → ₹6,000 | ₹12,500 | 1 |

**Lesson learned for future bulk imports:** scripts that bypass `saveStudentConventionalDiscountAssignments` must either backfill `student_family_members` or set `is_manual_override = true` with a reason. The DB constraint in (b) above would have surfaced this at import time.

---

### P0-2 — Installment data source has duplicate labels per installment number

**What's wrong.** `v_workbook_installment_balances` returns 2 rows per `(class_id, installment_no)` for every installment in 2026-27. Same `due_date`, but two label variants — e.g., for installment 1 of every class:

- `"Installment 1"` *and* `"Installment 1 (20-04-2026)"`

Multiplied across 4 installments × every class = the source of your "shows 8 installments instead of 4" symptom. The dashboard's `InstallmentTrack` (4-card view) dedupes by `installmentNo` and renders correctly, but **`ClassInstallmentMatrixTable`** (`components/dashboard/class-installment-matrix.tsx` line 25) uses `matrix[0]?.installments` as headers, and the upstream `classMatrixMap` (`lib/dashboard/summary.ts` line 408+) generates one `installments[]` entry per distinct row in the source view. That's where the 8 columns / 2 stacked rows came from.

**Recommended fix (data side, not UI):** dedupe upstream. Two options:

- **Option A (preferred)** — Fix the source. Walk `fee_installment_schedule` (or whatever populates `v_workbook_installment_balances`) and consolidate the two label variants into one. There should be exactly N rows per class for N installments, period.
- **Option B (workaround)** — Patch `lib/dashboard/summary.ts` `classMatrixMap` to key by `installment_no` instead of by `(installment_no + installment_label)`, picking the longer (more descriptive) label deterministically. Cosmetic only; doesn't fix the underlying duplication.

I'd do Option A. The duplicate labels will keep showing up in other places (exports, reports) until the source is clean.

---

## Tier P1 — User-requested improvements

### P1-1 — Collection heatmap: add month toggle

**What's wrong.** `components/dashboard/collection-heatmap.tsx` hardcodes the current month via `getSchoolMonthParts()` (line 13). No props, no state, no prev/next controls. Users can't look at, say, last month's pattern.

**Recommended shape:**
- Lift the `{year, month}` into local state inside `CollectionHeatmap` with a default of "current."
- Two `<` `>` buttons in the header next to "Collection heatmap" title, plus a label like "May 2026."
- The `collections` prop currently fetched for the current month from `lib/dashboard/data.ts` — extend the fetch to take a `(year, month)` arg and refetch on toggle, OR (cheaper) load the trailing 90 days up-front and filter client-side.

I'd go cheaper first: fetch trailing 90 days, slice client-side, no server round-trip on toggle. Upgrade to server-fetch if users start asking for older months.

### P1-2 — Installment progress: dedupe the source so it shows 4, not 8

Same as P0-2 above. Listed here too because the user named it as a UX bug.

### P1-3 — AI export: full-context workbook

**What's wrong.** `app/protected/exports/[exportType]/route.ts` has 3 export types today: `all-students`, `conventional-discount-students`, `class-wise-dues`, `defaulters`, `receipt-register`. Each is a single sheet with ~10 columns. There is no "everything" export.

**Recommended shape:** new export key `ai-context-bundle` (or `everything`). Produces a multi-sheet XLSX:

| Sheet | Contents |
|---|---|
| `Students` | Full student list w/ class, route, phone, status, discounts |
| `Installments` | Per-student per-installment expected/paid/pending/late fee |
| `Payments` | Every receipt with mode, ref, allocation breakdown |
| `Classes` | Class master + fee settings per class |
| `Routes` | Transport route master + fees |
| `Discounts` | Conventional discount policies + active assignments |
| `Defaulters` | Current outstanding follow-up list |
| `Sessions` | Session metadata (current, prior, late fee config) |
| `_README` | One-page natural-language summary the AI can use to orient itself |

The `_README` sheet matters more than people expect — it tells the LLM what the columns mean, what the fee plan is, what 2026-27 means, what `payment_adjustments` is, etc. Without it the AI burns context guessing.

**Implementation note.** XLSX-side, `book_append_sheet` per data type and one summary sheet. Pull from the same `getStudents`, `getOfficeWorkbookData`, etc. helpers the existing exports use — do NOT re-implement the data fetching. Add a UI tile in `Exports → Payments` group (or a new fourth group `For analysis`) labeled "Full AI context" with a `Sparkles` icon.

**Caveat.** A 481-student export with all transactions could be a 5–10MB file. Stream it or warn the user before generating.

### P1-4 — Defaulters / outstanding amounts validation pass

**What's wrong.** User asked to "make sure payment dues are correct for all the students." This is downstream of P0-1 — once the wrongly-applied 3rd Child policy is corrected, those 8 students' tuition projections (and therefore their pending/overdue amounts) will change. Until then, the Defaulters list, Dashboard "pending dues" KPI, and class collection rates all reflect the discounted (lower) expected revenue.

**Recommended fix:** sequence P0-1 first. Re-run `npm run verify-live-fee-health` (the script in `scripts/verify-live-fee-health.mjs`) after the correction lands.

---

## Tier P2 — Mobile UX (code-level analysis; visual validation pending)

**Caveat.** I could not visually validate mobile in this session — the Chrome MCP capped my viewport at 1142px regardless of `resize_window` calls, so the Tailwind `md:` breakpoint stayed active. The items below are from reading the mobile component code (`components/admin/mobile-bottom-nav.tsx`, `components/payments/payment-desk-mobile.tsx`, `mobile-payment-flow-sheet.tsx`, `mobile-payment-mode-sheet.tsx`). You should sanity-check against your own phone before agreeing.

### P2-1 — Mobile bottom-nav looks solid; no action needed

Reading `mobile-bottom-nav.tsx`: 4 primary tabs (Dashboard, Students, Payment Desk, Defaulters relabeled from Dues) + a "More" overflow that opens a full-screen module grid. Touch targets are `min-h-11` (44px). `aria-current` + `aria-expanded` for screen readers. The relabel on line 27–30 (Dues → Defaulters, Receipts → History) is intentional. Looks healthy.

### P2-2 — Payment Desk mobile: confirm 3rd-column form fits below the fold

`payment-desk-mobile.tsx` and `mobile-payment-flow-sheet.tsx` together implement a different layout from desktop — likely a sheet-based stepper rather than the side-by-side. Worth one visual pass when you have a phone in hand to confirm:
- Amount input is the 3xl `bg-accent` styled one (already specified in `mobile-ux-roadmap.test.ts`)
- Haptic on success post is `[50, 30, 80]` pattern
- 44px min touch on all buttons

### P2-3 — Dashboard mobile: verify the secondary KPIs aren't lost

The existing `mobile-ux-roadmap.test.ts` asserts:
- `MobileSecondaryKpis` block exists in `app/protected/dashboard/page.tsx`
- `className="space-y-2 md:hidden"` for the secondary KPI strip
- Mobile FAB to open Payment Desk at bottom

Code grep confirms those strings are present. Once you fix P0/P1, re-test on phone for spacing / overflow.

### P2-4 — Sidebar collapse on tablet (768–1024px)

Not on your list, but worth flagging: at ~800px width the desktop sidebar takes ~180px and leaves little room for the 2-column Payment Desk. Consider a tablet-only collapsed sidebar (icons-only at <1100px). Low priority unless you have tablet users.

---

## Tier P3 — Polish / nice-to-haves (only if everything above is done)

### P3-1 — Receipts under Transactions nav

Cosmetic-ish call-out from last session: when you visit `/protected/receipts`, the topbar title shows "Transactions" because Receipts is grouped under the Transactions nav slot. Either accept it as intentional grouping, or promote Receipts to its own top-level nav. Don't do this just to do it — wait until office staff ask.

### P3-2 — Dashboard double-title cleanup

Page header shows "Dashboard" twice (topbar + H1). Different jobs (topbar = scroll-context, H1 = landmark), but on narrow viewports it feels redundant. Lowest priority.

### P3-3 — Dashboard installment progress percentages

Once P0-2 is fixed, audit whether the per-installment collection-rate badges (e.g., "35% Overdue") are actually meaningful with the corrected data. Right now some show "0% Upcoming" with large pending amounts, which reads weird.

### P3-4 — Brand-voice on the morning brief

`composeMorningBrief()` in `lib/dashboard/morning-brief.ts` is fine but generic ("Today: no collections yet. ₹X still pending across the school."). Could be punchier with the day's actual context (e.g., "Installment 2 due in 57 days — currently 12% collected. Push needed.").

---

## Suggested sequencing

1. **Today / this week** — P0-1 (3rd child policy data correction with audit trail) + P0-2 (dedupe installment labels in source).
2. **Next** — P1-1 (heatmap month toggle, ~1 hour), P1-3 (AI export, ~3 hours). P1-4 is automatic once P0-1 lands.
3. **Then** — P2 mobile pass after grabbing your phone and verifying which P2 items are real vs. theoretical from code.
4. **Eventually** — P3 polish, only if office staff actually ask.

## Riskiest assumption

I'm assuming you want to *correct* the 8 students' 3rd child policy, not *bless* it. If the school decided as policy to grant 3rd child to siblings of larger families regardless of exact count, the fix isn't P0-1 — it's adjusting the policy rule itself. **Please confirm before I touch any of those records.**
