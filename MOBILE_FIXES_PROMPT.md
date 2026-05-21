# Mobile Fixes & Bugs — Codex Implementation Prompt

## Context

**VPPS Fee Management** — internal admin app for Shri Veer Patta Senior Secondary School.
Stack: Next.js 16 App Router + TypeScript + React 19 + Tailwind CSS + shadcn/ui.
Read `CLAUDE.md` before starting. Run `npm run typecheck && npm run lint` before finishing.
Never `npm install` new packages. Work only in the files listed in each step.

---

## Fix 1 — Students Filter: Collapsible Smart Filter Panel on Mobile

**File:** `components/students/student-filters.tsx`

**Problem:** All 5 filter fields (Search, Academic Year, Class, Route, Status) stack vertically on mobile, consuming most of the screen before the student list appears.

**Fix:** Keep the Search input always visible. Move the remaining 4 filters (AY, Class, Route, Status) behind a collapsible "Filters" toggle button. Show a count badge when any of those 4 are active. The filter panel opens/closes with a smooth `grid-rows` CSS transition.

Replace the entire file with:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

import { AutoSubmitForm } from "@/components/office/auto-submit-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STUDENT_STATUSES } from "@/lib/students/constants";
import type {
  StudentClassOption,
  StudentListFilters,
  StudentRouteOption,
  StudentSessionOption,
} from "@/lib/students/types";

type StudentFiltersProps = {
  filters: StudentListFilters;
  sessionOptions: StudentSessionOption[];
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function StudentFilters({
  filters,
  sessionOptions,
  classOptions,
  routeOptions,
}: StudentFiltersProps) {
  const activeCount = [
    filters.classId,
    filters.transportRouteId,
    filters.status,
    // sessionLabel is always set — only count it if it's a non-default value
    sessionOptions.length > 1 &&
      filters.sessionLabel !== sessionOptions[0]?.value,
  ].filter(Boolean).length;

  const [open, setOpen] = useState(activeCount > 0);

  return (
    <AutoSubmitForm method="get" className="space-y-2">
      {/* Always-visible row: Search + Filters toggle */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="query" className="sr-only sm:not-sr-only">Search</Label>
          <Input
            id="query"
            name="query"
            placeholder="Name, SR no, or phone"
            defaultValue={filters.query}
            className="mt-0 h-10 sm:mt-2"
          />
        </div>

        {/* Filters toggle — mobile only */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-input bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 sm:hidden"
          aria-expanded={open}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="11" y1="18" x2="13" y2="18"/>
          </svg>
          Filters
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>

        {/* Clear — always visible on desktop */}
        <div className="hidden sm:block shrink-0">
          <Label className="sr-only">Clear</Label>
          <Button type="button" variant="outline" className="mt-2 h-10" asChild>
            <Link href="/protected/students">Clear</Link>
          </Button>
        </div>
      </div>

      {/* Collapsible panel — always open on sm+, toggled on mobile */}
      <div
        className={[
          "overflow-hidden transition-all duration-200",
          "sm:block sm:overflow-visible",
          open ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0 sm:max-h-none sm:opacity-100",
        ].join(" ")}
      >
        <div className="grid gap-2 pt-1 sm:grid-cols-2 md:grid-cols-4">
          {sessionOptions.length > 1 && (
            <div>
              <Label htmlFor="sessionLabel">Academic year</Label>
              <select
                id="sessionLabel"
                name="sessionLabel"
                defaultValue={filters.sessionLabel}
                className={`${selectClassName} mt-1`}
              >
                {sessionOptions.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
          {sessionOptions.length <= 1 && (
            <input type="hidden" name="sessionLabel" value={filters.sessionLabel} />
          )}

          <div>
            <Label htmlFor="classId">Class</Label>
            <select
              id="classId"
              name="classId"
              defaultValue={filters.classId}
              className={`${selectClassName} mt-1`}
            >
              <option value="">All classes</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="transportRouteId">Transport route</Label>
            <select
              id="transportRouteId"
              name="transportRouteId"
              defaultValue={filters.transportRouteId}
              className={`${selectClassName} mt-1`}
            >
              <option value="">All routes</option>
              {routeOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.routeCode ? `${r.label} (${r.routeCode})` : r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={filters.status}
              className={`${selectClassName} mt-1`}
            >
              <option value="">All statuses</option>
              {STUDENT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Clear — mobile only (inside panel) */}
        <div className="mt-2 sm:hidden">
          <Button type="button" variant="outline" className="h-10 w-full" asChild>
            <Link href="/protected/students">Clear all filters</Link>
          </Button>
        </div>
      </div>
    </AutoSubmitForm>
  );
}
```

**Important:** The component uses `"use client"` because of the `useState` toggle. The `AutoSubmitForm` still drives the GET submission on change.

---

## Fix 2 — Payment Desk: Late Fee Waiver Always Visible on Mobile

**File:** `components/payments/payment-desk-mobile.tsx`

**Problem:** The late fee waiver toggle button is inside a `flex overflow-x-auto` chip row containing all the quick amount chips. On mobile, when there are many chips, the waiver button gets scrolled off-screen requiring horizontal scroll to find it.

**Fix:** Move the waiver button out of the horizontal scroll row and put it on its own dedicated row, always visible.

Find this block in the mobile payment card section (inside `div.md:hidden` → `div.overflow-hidden.rounded-xl.border.border-border.bg-card`). Look for the `div` with class `flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2` that contains `quickAmounts.map(...)` and the late fee waiver button.

**Step 2a — Remove the waiver button from the chips row:**

Find:
```tsx
{/* Quick amount chips + waiver chip + mobile discount */}
<div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
  {quickAmounts.map((qa) => (
      <Button
        key={`mobile-chip-${qa.key}`}
        ...
      >
        {getQuickAmountChipLabel(qa)}
      </Button>
    ))}
  {pendingLateFeeAmount > 0 ? (
    <button
      type="button"
      className={cn(
        "shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
        waiveFullLateFee
          ? "border-info bg-info-soft text-info-soft-foreground"
          : "border-border bg-surface text-muted-foreground hover:bg-surface-2",
      )}
      onClick={() => {
        setWaiveFullLateFee((prev) => !prev);
        setFormError(null);
      }}
    >
      {waiveFullLateFee ? "✓ " : ""}
      Waive late {formatInr(pendingLateFeeAmount)}
    </button>
  ) : null}
</div>
```

Replace with (chips row — waiver removed):
```tsx
{/* Quick amount chips */}
<div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2 scroll-smooth momentum-scroll">
  {quickAmounts.map((qa) => (
    <Button
      key={`mobile-chip-${qa.key}`}
      type="button"
      size="sm"
      variant={qa.key === "clear" ? "ghost" : qa.key === "full" ? "accent" : getQuickAmountChipVariant(qa)}
      disabled={qa.disabled}
      className={getQuickAmountChipClassName(qa)}
      onClick={() => {
        setFormError(null);
        setPaymentAmountInput(qa.amount === null ? "" : String(qa.amount));
      }}
    >
      {getQuickAmountChipLabel(qa)}
    </Button>
  ))}
</div>
```

**Step 2b — Add a dedicated waiver row immediately after the chips row:**

After the chips row closing `</div>`, add:
```tsx
{pendingLateFeeAmount > 0 ? (
  <button
    type="button"
    className={cn(
      "flex w-full items-center justify-between border-b border-border px-3 py-3 text-sm font-medium transition-colors",
      waiveFullLateFee
        ? "bg-info-soft text-info-soft-foreground"
        : "bg-surface text-muted-foreground hover:bg-surface-2",
    )}
    onClick={() => {
      setWaiveFullLateFee((prev) => !prev);
      setFormError(null);
    }}
    aria-pressed={waiveFullLateFee}
  >
    <span className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded border-2 text-xs transition-colors",
          waiveFullLateFee
            ? "border-info bg-info text-white"
            : "border-border bg-card",
        )}
        aria-hidden="true"
      >
        {waiveFullLateFee ? "✓" : ""}
      </span>
      Waive late fee
    </span>
    <span className="tabular-nums">{formatInr(pendingLateFeeAmount)}</span>
  </button>
) : null}
```

This gives a full-width tappable row (44px+ touch target) that is always visible, with a clear checkbox-style indicator and the amount on the right.

---

## Fix 3 — Payment Desk Collect Tab: Guided Auto-Flow on Mobile

**File:** `components/payments/payment-desk-mobile.tsx`

**Goal:** When the user opens the Collect tab on mobile:
1. Automatically present the class picker (a sheet) so the first gesture is class selection, not typing a student name
2. After selecting a class, auto-scroll to the student search input and focus it
3. After selecting a student, auto-focus the amount input (which will open the numeric keypad)

### Step 3a — Add a `classMobilePickerOpen` state and auto-open the class sheet on mount

Add a new state near the top of `PaymentDeskClient`:
```tsx
const [classMobilePickerOpen, setClassMobilePickerOpen] = useState(false);
```

Add a `useEffect` that opens the class picker when the page loads on mobile with no class/student selected:
```tsx
useEffect(() => {
  // Only trigger once on mobile when nothing is pre-selected
  if (
    typeof window !== "undefined" &&
    window.innerWidth < 768 &&
    !selectedClassId &&
    !selectedStudent &&
    mounted
  ) {
    // Small delay so the page renders fully before the sheet opens
    const t = setTimeout(() => setClassMobilePickerOpen(true), 300);
    return () => clearTimeout(t);
  }
}, [mounted]); // eslint-disable-line react-hooks/exhaustive-deps
```

### Step 3b — Build the class picker as a Sheet

Add a new local function `MobileClassPickerSheet` inside the component render (before the return), or inline it. Add after the `quickAmounts` declaration:

```tsx
const MobileClassPickerSheet = classMobilePickerOpen ? (
  <div className="fixed inset-0 z-50 flex items-end md:hidden">
    <button
      type="button"
      className="absolute inset-0 bg-foreground/30"
      onClick={() => setClassMobilePickerOpen(false)}
      aria-label="Close"
    />
    <div className="relative z-10 w-full rounded-t-2xl border-t border-border bg-card pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4 shadow-xl anim-slide-up">
      {/* Drag handle */}
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
      <div className="px-4 pb-2">
        <h2 className="text-base font-semibold text-foreground">Select Class</h2>
        <p className="text-sm text-muted-foreground">Choose a class to see its students</p>
      </div>
      <div className="divide-y divide-border border-t border-border">
        {classOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={cn(
              "flex min-h-12 w-full items-center px-5 text-left text-sm font-medium transition-colors hover:bg-surface-2",
              selectedClassId === opt.id ? "bg-accent-soft text-accent font-semibold" : "text-foreground",
            )}
            onClick={() => {
              handleClassChange(opt.id, "mobile");
              setClassMobilePickerOpen(false);
              // Scroll to student search and focus it after a tick
              setTimeout(() => {
                studentSearchSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                setTimeout(() => mobileStudentSearchInputRef.current?.focus(), 200);
              }, 100);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  </div>
) : null;
```

Render `{MobileClassPickerSheet}` at the very end of the returned JSX, just before the closing `</form>` or after `SuccessReceiptSheet`.

### Step 3c — Show "Tap to select class" button prominently when class is not yet selected

Find the `div ref={classSectionRef}` block. Inside the `SectionCard` for "1. Select Class", immediately after the `<select>` element, add a mobile-only "tap to pick" button that triggers the sheet:

```tsx
{/* Mobile tap-to-pick button */}
<button
  type="button"
  className="mt-2 flex w-full items-center justify-between rounded-xl border-2 border-dashed border-border bg-surface-2 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:bg-accent-soft/20 md:hidden"
  onClick={() => setClassMobilePickerOpen(true)}
>
  <span>{selectedClassId ? (classOptions.find(o => o.id === selectedClassId)?.label ?? "Class selected") : "Tap to select a class →"}</span>
  {selectedClassId && (
    <span className="text-xs text-accent font-semibold">Change</span>
  )}
</button>
```

### Step 3d — After class is selected, auto-scroll to student search

In `handleClassChange` (the existing function), add at the end, inside the `mode === "mobile"` branch:

```tsx
if (mode === "mobile") {
  // existing logic...
  // ADD THIS:
  setTimeout(() => {
    studentSearchSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => mobileStudentSearchInputRef.current?.focus({ preventScroll: true }), 250);
  }, 100);
}
```

### Step 3e — After student is selected, auto-focus the amount input

Find the `selectStudent` function. After the student summary loads and `scrollAmountInputIntoView()` is called, also focus the input. In the `useEffect` that watches `[selectedStudent, studentSummaryLoading]` (the one that calls `scrollAmountInputIntoView`):

```tsx
useEffect(() => {
  if (!selectedStudent || studentSummaryLoading || !isMobileView) {
    return;
  }
  // Existing scroll call
  scrollAmountInputIntoView({ behavior: "smooth", block: "center" });
  // NEW: focus the mobile amount input to pop the numeric keyboard
  setTimeout(() => {
    const mobileAmountInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Mobile amount received"]',
    );
    if (mobileAmountInput) {
      mobileAmountInput.focus({ preventScroll: true });
    }
  }, 400);
}, [amountInputRef, isMobileView, scrollAmountInputIntoView, selectedStudent, studentSummaryLoading]);
```

Also ensure the mobile amount input has `type="text" inputMode="numeric"` (it currently has `type="number"` which can be inconsistent). Change the mobile amount input's `type` attribute from `"number"` to `"text"` and ensure `inputMode="numeric"` and `pattern="[0-9]*"` are set — this reliably triggers the numeric keypad on iOS and Android.

---

## Fix 4 — Session Switching: Scrollless Bug on Mobile

**Files:**
- `components/admin/mobile-session-pill.tsx`
- `components/ui/sheet.tsx`

**Problem:** After switching sessions on mobile, `document.body.style.overflow` remains `"hidden"` (set by the Sheet's scroll-lock), making the whole app appear frozen/scrollless. Root cause: `router.refresh()` during `startNavTransition` can cause React to remount the tree before the Sheet's cleanup effect fires, leaving the overflow lock in place.

### Fix 4a — Explicit overflow reset in `MobileSessionPill.selectSession`

In `components/admin/mobile-session-pill.tsx`, in the `selectSession` function, before calling `router.replace`:

```tsx
startNavTransition(() => {
  // Reset overflow BEFORE navigation to prevent the stuck-lock bug
  document.body.style.overflow = "";
  router.replace(targetHref, { scroll: false });
  router.refresh();
  setOpen(false);
});
```

### Fix 4b — Cleanup guard in `MobileSessionPill` on pathname change

Add a `useEffect` to `MobileSessionPill` that ensures overflow is always cleared after navigation completes:

```tsx
// Add this useEffect inside MobileSessionPill, after the existing ones
useEffect(() => {
  // Whenever pathname changes (i.e., navigation completed), ensure scroll is unlocked
  document.body.style.overflow = "";
}, [pathname]);
```

### Fix 4c — Make Sheet cleanup more robust

In `components/ui/sheet.tsx`, add an additional cleanup that runs on unmount regardless of the `open` state:

```tsx
// Add this new useEffect inside the Sheet component, AFTER the existing one
useEffect(() => {
  // Safety net: always restore overflow on unmount
  return () => {
    if (lockScroll) {
      document.body.style.overflow = "";
    }
  };
}, [lockScroll]);
```

This ensures that even if the Sheet is unmounted mid-transition, the overflow is always restored.

### Fix 4d — Prevent the "disappearing session pill" bug

In `components/admin/mobile-session-pill.tsx`, during session switching the pill shows `opacity-75`. If the session switch takes >2s, users may think the UI is frozen. Add a timeout fallback that resets the switching state:

```tsx
// Inside selectSession function, add a safety timeout
const safetyTimer = setTimeout(() => {
  setIsSwitching(false);
  setOptimisticLabel(null);
  document.body.style.overflow = "";
}, 8000); // 8-second failsafe

void (async () => {
  try {
    // ... existing try block
  } catch {
    setIsSwitching(false);
    setOptimisticLabel(null);
  } finally {
    clearTimeout(safetyTimer);
  }
})();
```

---

## Fix 5 — Dashboard Overdue Stat: Always Shows Zero

**File:** `lib/dashboard/data.ts` — function `getDashboardAboveFoldData`

**Problem:** The above-fold data fetcher builds the dashboard summary with `overdueInstallments: []` (hardcoded empty array). This means `kpis.overdueAmount` is always 0 in the KPI cards, even when real overdue amounts exist.

**Root cause code** (find this block in `getDashboardAboveFoldData`):
```ts
const summary = buildDashboardSummary({
  financialRows,
  studentRows: activeStudents,
  classRows: [],
  installmentRows: [],
  overdueInstallments: [],   // ← THIS IS THE BUG
  transactions,
  todayTransactions,
  rawStudentCount: rawStudentCount || activeStudents.length,
});
```

**Fix:** Compute overdue amount from `financialRows` directly. The `financialRows` each have a `statusLabel` field (`"OVERDUE"`, `"PAID"`, etc.) and `outstandingAmount`. Build synthetic overdue entries from them.

Replace the above block with:

```ts
// Derive overdue from the student-level financial rows.
// financialRows have statusLabel === "OVERDUE" for students with at least one overdue installment.
// We use outstandingAmount as the overdue amount (approximation — actual installment breakdown
// is loaded in getDashboardPageData where the exact figure is available).
const syntheticOverdueInstallments = financialRows
  .filter((row) => row.statusLabel === "OVERDUE" && row.outstandingAmount > 0)
  .map((row) => ({
    // Only pendingAmount is used by buildDashboardSummary for kpis.overdueAmount
    pendingAmount: row.outstandingAmount,
    // Required fields from WorkbookInstallmentBalance — set safe defaults
    sessionLabel: row.sessionLabel,
    classId: row.classId,
    studentId: row.studentId,
    installmentNo: 0,
    installmentLabel: "",
    dueDate: "",
    balanceStatus: "overdue" as const,
    expectedAmount: 0,
    paidAmount: 0,
    adjustmentAmount: 0,
    finalLateFee: 0,
    outstandingAmount: row.outstandingAmount,
  }));

const summary = buildDashboardSummary({
  financialRows,
  studentRows: activeStudents,
  classRows: [],
  installmentRows: [],
  overdueInstallments: syntheticOverdueInstallments,
  transactions,
  todayTransactions,
  rawStudentCount: rawStudentCount || activeStudents.length,
});
```

**Note:** If `WorkbookInstallmentBalance` has required fields that differ, cast the object: `as WorkbookInstallmentBalance`. The only field actually used for `kpis.overdueAmount` is `pendingAmount`, so any safe defaults for the other fields are fine for the above-fold data. The exact installment-level breakdown remains in `getDashboardPageData` where it's computed with full accuracy.

**Verify:** After this fix, the Overdue KPI card in the dashboard should show a non-zero value when students have overdue installments. The exact number may differ slightly from the `getDashboardPageData` version (which uses installment-level rows) but will be correct in direction and order of magnitude.

---

## Fix 6 — Receipt Mobile View: Clean Up Overlapping Layouts

**File:** `components/receipts/receipt-document.tsx`

**Problems:**
1. The 4-stat grid (`Total Fee Due`, `Paid Till Date`, `Paid Today`, `Balance Due`) uses `grid gap-2 sm:grid-cols-4` — on phones between 375–640px it's a single column which is fine, but makes the receipt very tall.
2. The installment details table has 4 columns with long bilingual headers — overflows on mobile.
3. The `md:grid-cols-[1fr_auto]` header section stacks on mobile with the receipt number box full-width, which is fine but can look like two unrelated blocks.
4. The `md:grid-cols-[1fr_0.82fr]` Student + Payment details section: at mobile the student grid `sm:grid-cols-3` only kicks in at 640px — for phones 375–640px all fields stack as single column.

### Fix 6a — 4-stat grid: 2 columns on mobile

Find:
```tsx
<section className="grid gap-2 sm:grid-cols-4">
```
Change to:
```tsx
<section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
```

This gives a 2×2 grid on mobile — much more compact without sacrificing readability.

### Fix 6b — Receipt header: keep receipt number inline on mobile

Find the header block:
```tsx
<div className="grid gap-3 md:grid-cols-[1fr_auto]">
```
Change to:
```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
```

And wrap the receipt number box in:
```tsx
<div className="shrink-0 rounded-lg border border-border bg-surface-2 px-4 py-3 text-right sm:text-right">
```

This keeps school logo+info on the left and receipt number on the right even on mobile (flex-row on sm+ and stacked but clearly separated on xs).

### Fix 6c — Installment details table: scrollable on mobile

Wrap the `<div className="overflow-hidden rounded-md border border-border">` that contains the installment table:

```tsx
{/* Before: */}
<div className="overflow-hidden rounded-md border border-border">
  <table ...>

{/* After: */}
<div className="overflow-x-auto rounded-md border border-border" style={{ WebkitOverflowScrolling: "touch" }}>
  <table className="w-full min-w-[480px] text-left text-xs">
```

Adding `min-w-[480px]` ensures the table columns don't squeeze, and `overflow-x-auto` lets the user scroll the table horizontally if needed.

### Fix 6d — Shorten bilingual headers to prevent overflow

In the installment table `<thead>`, the headers `"Pending Before / पहले बकाया"` and `"Allocated / आज जमा"` are very long. Shorten:

```tsx
{/* Before */}
<th className="px-2 py-2">Installment / किस्त</th>
<th className="px-2 py-2">Due Date / देय दिनांक</th>
<th className="px-2 py-2 text-right">Pending Before / पहले बकाया</th>
<th className="px-2 py-2 text-right">Allocated / आज जमा</th>

{/* After */}
<th className="px-2 py-2 whitespace-nowrap">Installment / किस्त</th>
<th className="px-2 py-2 whitespace-nowrap">Due / देय</th>
<th className="px-2 py-2 text-right whitespace-nowrap">Before / पहले</th>
<th className="px-2 py-2 text-right whitespace-nowrap">Paid / जमा</th>
```

### Fix 6e — Student details grid: 2 columns on mobile

Find:
```tsx
<div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
```
Change to:
```tsx
<div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
```

This gives a 2-column layout on mobile for Name/SR/Class/Father/Phone/Route — fits nicely on a 375px screen.

### Fix 6f — Fee Breakup section: "Amount in Words" font size on mobile

The amount-in-words block can have a very long string. Add truncation protection:

Find:
```tsx
<p>
  <span className="font-semibold">Amount in Words / राशि शब्दों में:</span>{" "}
  {amountInWords(receipt.totalAmount)}
</p>
```

Wrap in:
```tsx
<p className="break-words">
  <span className="font-semibold">Amount in Words / राशि शब्दों में:</span>{" "}
  <span className="text-sm">{amountInWords(receipt.totalAmount)}</span>
</p>
```

---

## Verification Checklist

Run these after all fixes:

- [ ] `npm run typecheck` — zero errors
- [ ] `npm run lint` — zero errors
- [ ] `npm run build` — builds successfully

### Fix 1 — Students Filter
- [ ] On mobile (375px), only the Search input and the Filters toggle button are visible by default
- [ ] Tapping "Filters" expands the 4 filter selects with a smooth animation
- [ ] When any filter is active, the count badge shows on the Filters button
- [ ] On desktop (1024px+), all filters are visible inline in a grid with no toggle button
- [ ] Changing any select still auto-submits the form via `AutoSubmitForm`

### Fix 2 — Late Fee Waiver
- [ ] When a student has a pending late fee, a full-width "Waive late fee | ₹X,XXX" row appears in the mobile payment card
- [ ] Tapping it toggles on/off with a visible checkbox indicator
- [ ] No horizontal scrolling is required to find the waiver option
- [ ] The waiver row only appears when `pendingLateFeeAmount > 0`

### Fix 3 — Collect Tab Auto-Flow
- [ ] Opening Collect tab on mobile (with no pre-selected student) triggers the class picker sheet after ~300ms
- [ ] Selecting a class from the sheet closes it and scrolls to the student search input
- [ ] Student search input auto-focuses after class selection
- [ ] Selecting a student auto-scrolls to the amount input and opens the numeric keypad
- [ ] The mobile amount input uses `type="text" inputMode="numeric"` for consistent keypad behaviour

### Fix 4 — Session Switching
- [ ] Switching sessions from the pill on mobile completes without leaving the page scrollless
- [ ] After switching, the app scrolls normally on all pages
- [ ] The session pill shows a loading spinner during the switch and returns to normal after
- [ ] If the switch takes unusually long, the 8-second failsafe resets the UI

### Fix 5 — Overdue Stat
- [ ] The Overdue KPI card on the dashboard shows a non-zero amount when students have overdue dues
- [ ] The value is consistent with what the Defaulters page shows as total overdue
- [ ] No TypeScript errors related to `syntheticOverdueInstallments` shape

### Fix 6 — Receipt Mobile View
- [ ] At 375px, the 4 stat tiles show as a 2×2 grid (not single column)
- [ ] School logo + receipt number are side by side on mobile (not stacked as two full-width blocks)
- [ ] The installment table scrolls horizontally on mobile without breaking the outer layout
- [ ] Student details show as 2-column grid on mobile
- [ ] Long "Amount in Words" strings wrap without overflowing their container
- [ ] Receipt still prints correctly in print mode (test with browser print preview)
