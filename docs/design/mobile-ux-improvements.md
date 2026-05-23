# VPPS Fee Admin — Mobile UX Improvement Roadmap

> **Audience:** Developer / PM  
> **Written:** 2026-05-23  
> **Scope:** Full-stack mobile UX analysis + prioritised improvement ideas for the VPPS fee management app  
> **Context:** Staff-facing internal tool. Primary users are office clerks and accountants at a school, often on Android phones in a busy environment. The app is already deployed to production at `2026-27`.

---

## Executive Summary

The app already has a solid mobile foundation: a bottom nav, a mobile header, a session pill, safe-area CSS variables, a PWA manifest, and a mobile-specific Payment Desk layout. That is genuinely good work. But the foundation needs to become a *complete* mobile-first experience — not just "it doesn't break on phones."

The highest-leverage improvements fall into four categories:

1. **Payment Desk** — the cashier's core workflow; any friction here costs real money and time
2. **Dashboard** — the morning briefing surface; currently hides too much data behind md: breakpoints
3. **Data tables** — five different screens show overflow-x tables that need card-list alternatives on mobile
4. **PWA / Offline** — the manifest has a brand colour mismatch and the service worker is bare-minimum

The ideas below are grouped by surface, ranked roughly by impact, and written with enough specificity to go straight into a task board.

---

## 1. PWA & App Shell

### 1.1 Fix the Brand Colour Mismatch (Quick Win — 20 min)

**Problem:** `manifest.webmanifest` has `"theme_color": "#0ea5e9"` (a blue from a starter template). The actual brand accent is saffron: `hsl(20 86% 41%)` ≈ `#c0521a`. On Android, the system chrome (status bar, task switcher) renders sky-blue — jarring for a school admin app.

**Fix:**
```json
{
  "theme_color": "#c0521a",
  "background_color": "#faf9f6"
}
```

Also fix `background_color` to match `--background: 48 33% 98%` (the "paper" token, ≈ `#faf9f6`).

---

### 1.2 PWA Shortcuts — Role-Aware Start URLs

**Problem:** The three shortcuts in the manifest (`/protected/payments`, `/protected/defaulters`, `/protected/transactions`) are hardcoded but not role-aware. A `read_only_staff` user who taps "Collect Payment" gets a redirect to Dashboard — confusing.

**Fix:** Generate shortcuts dynamically using middleware that reads the staff role cookie, or at minimum remove "Collect Payment" from the generic manifest and serve a `/api/manifest` route that returns role-specific shortcuts.

```json
// Accountant manifest (generated server-side)
"shortcuts": [
  { "name": "Payment Desk", "url": "/protected/payments" },
  { "name": "Today's Receipts", "url": "/protected/transactions" },
  { "name": "Defaulters", "url": "/protected/defaulters" }
]
```

---

### 1.3 Upgrade the Service Worker — Runtime Caching

**Problem:** The current service worker (`service-worker.js`) only caches static assets and the offline fallback page. Every API call (student index, dashboard data, defaulters list) is a fresh network request. On a slow 4G school network this adds perceptible latency.

**Ideas:**
- Add a **stale-while-revalidate** strategy for the student index endpoint (`/protected/payments?studentId=*` and `/protected/students/index`) — data rarely changes mid-day
- Cache the navigation data (class options, session list) with a 1-hour TTL
- Pre-cache the `/offline.html` with a proper offline message tailored for office staff, not a generic error

**Pattern (using Workbox or manual Cache API):**
```js
// In service-worker.js
const STUDENT_INDEX_CACHE = "vpps-student-index-v1";
// Cache student index with 30-min TTL
// Stale-while-revalidate for payment desk class options
```

---

### 1.4 Payment Draft Persistence — Survive App Switches

**Problem:** On mobile, switching apps to check a WhatsApp message or answer a call can unload the tab. Any half-filled payment form is lost. The `loadDraft`/`saveDraft` utilities in `lib/payments/draft-store.ts` already exist — but it's worth ensuring they write to `localStorage` on every keystroke, not just on submit attempt.

**Fix:** Add a `beforeunload` / `visibilitychange` listener in `PaymentDeskClient` that flushes the current draft immediately when the page becomes hidden:

```ts
useEffect(() => {
  const flush = () => saveDraft({ amount: paymentAmountInput, mode: paymentMode, ... });
  document.addEventListener("visibilitychange", flush);
  return () => document.removeEventListener("visibilitychange", flush);
}, [paymentAmountInput, paymentMode]);
```

---

## 2. Payment Desk — Cashier Speed

This is the highest-traffic surface. Every tap saved here compounds across hundreds of daily transactions.

### 2.1 Numeric Keyboard for Amount Input (Quick Win — 15 min)

**Problem:** The payment amount input field renders a default text keyboard on Android. Staff have to tap the `123` key to switch to numbers.

**Fix:**
```tsx
<Input
  type="text"          // keep text to allow decimal
  inputMode="decimal"  // shows numeric + decimal keyboard on Android/iOS
  pattern="[0-9]*"
  autoComplete="off"
/>
```

Same fix for the Quick Discount input field.

---

### 2.2 Reference Number Gets Phone Keyboard

**Problem:** The reference number field (for UPI/cheque/bank transfer) is a text field. UPI references are numeric. When payment mode is `upi` or `bank_transfer`, the reference field should switch to `inputMode="numeric"`.

**Fix:** Derive `inputMode` from the selected payment mode:
```tsx
const referenceInputMode = ["upi", "bank_transfer", "cheque"].includes(paymentMode)
  ? "numeric"
  : "text";
```

---

### 2.3 Haptic Feedback on Payment Success

**Problem:** After a successful receipt post, the only feedback is a sheet animation. On a noisy office counter with a busy clerk, a visual-only confirmation is easy to miss.

**Fix:** Add a haptic pulse at the moment the success sheet opens:
```ts
// In the success handler
if ("vibrate" in navigator) {
  navigator.vibrate([50, 30, 80]); // short-pause-long = "confirmed" pattern
}
```

Use `[50, 30, 80]` — a double tap pattern that feels like a receipt printer stamp.

---

### 2.4 Quick-Amount Chip Sizing

**Problem:** `mobilePresetAmounts = [500, 1000, 2000, 5000, 10000]` exist but the chips may be small. Each quick-amount chip should be at minimum `min-h-11` (44px) and wide enough for a thumb tap with padding.

**Fix:** Ensure the chip component uses:
```tsx
className="min-h-11 min-w-[4rem] rounded-full border px-4 text-sm font-semibold"
```

---

### 2.5 Student Picker — Swipe-to-Dismiss

**Problem:** The mobile student picker opens as a bottom sheet (or modal overlay). On iOS/Android, users expect to be able to swipe it down to dismiss. Currently only the X button or tapping outside closes it.

**Fix:** Add touch-based swipe-down detection on the sheet handle:
- Add a drag handle `<div className="mx-auto h-1 w-12 rounded-full bg-border" />` at the top of the sheet
- Track `touchstart`/`touchmove`/`touchend` — if vertical drag > 80px downward, close the picker
- This is a one-time `useSwipeToDismiss` hook that can be reused everywhere

---

### 2.6 "Collect Another" — Reset Without Full Page Reload

After posting a receipt, the "Collect Another Payment" CTA currently reloads the page. On a slow connection this means a 2-3 second wait before the desk is ready again. Instead:
- Keep the student index in memory (already done via `studentIndex` state)
- Reset only the form fields (amount, mode, reference, remarks)
- Clear the selected student and scroll to the class/student picker

The `resetPaymentDraftForNextPayment` function in `lib/payments/payment-desk-workflow.ts` suggests this is partially implemented — check if it can be called client-side without a navigation.

---

### 2.7 Payment Mode — Persistent Last-Used Selection

**Already partially implemented** (`paymentDeskLastModeStorageKey` in localStorage). Verify this is restoring correctly on page load and after each payment — the saved mode should be the *default* for the next transaction, not `cash` every time.

---

### 2.8 WhatsApp Receipt Sharing

After a payment, staff currently need to verbally tell parents. Add a "Share via WhatsApp" button in the success sheet:

```ts
const msg = `✅ Fee Receipt\nStudent: ${studentName}\nAmount: ₹${amount}\nReceipt: ${receiptNo}\nDate: ${paymentDate}`;
const url = `https://wa.me/${parentPhone}?text=${encodeURIComponent(msg)}`;
window.open(url, "_blank");
```

This is possible because `reminderText` is already built for the defaulters follow-up queue — the same pattern works for receipts. The `fatherPhone` field already exists in student data.

---

### 2.9 Large-Font Amount Display

When a staff member types `₹15,000`, the amount should display in a large readable font below the input so the student/parent standing at the counter can verify it before the receipt is posted. This builds trust.

```tsx
{paymentAmountInput && (
  <p className="font-display text-3xl font-bold text-accent text-center mt-2">
    ₹ {formatInr(Number(paymentAmountInput))}
  </p>
)}
```

---

## 3. Dashboard — Don't Hide Data on Mobile

### 3.1 Secondary KPIs Are Completely Hidden on Mobile

**Problem:** The second KPI column (Total Expected, Total Collected, Active Students, This Month) is `hidden lg:grid` — it only shows on large desktop. On phones, this is invisible. Staff check the dashboard on their phones in the morning.

**Fix Options:**
- **Option A (Recommended):** Collapse these four cards into a horizontally scrollable `<ScrollArea>` strip below the main four KPIs on mobile. Each card is compact (60px tall, text-right). A scroll-hint fade on the right edge signals there's more.
- **Option B:** Show these four as a 2×2 grid on mobile using the same `KpiCard` component. It already supports `hint` content.

```tsx
// Mobile: show 2×2 grid
<div className="grid grid-cols-2 gap-3 lg:hidden">
  <KpiCard label="Total expected" value={<Money ... />} />
  ...
</div>
```

---

### 3.2 Class Summary Table — Replace with a Card List on Mobile

**Problem:** The class summary table has 7 columns and is `hidden md:hidden` on mobile, replaced with a Notice saying "go to Exports." This is a cop-out — the data is useful on mobile for a principal or admin checking on-the-go.

**Fix:** Render a card-list version on mobile instead of hiding the data:

```tsx
// Mobile card for each class
<div className="md:hidden space-y-2">
  {rows.map((row) => (
    <div key={row.classLabel} className="rounded-md border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{row.classLabel}</p>
        <span className="text-sm text-muted-foreground">{formatPercent(row.collectionRate)}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${row.collectionRate}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>Pending <Money value={row.pendingAmount} size="xs" /></span>
        <span>{row.totalStudents} students</span>
      </div>
    </div>
  ))}
</div>
// Desktop: the existing full table
<div className="hidden md:block">...</div>
```

---

### 3.3 Follow-Up Queue — Tap-to-Call on Mobile

**Good news:** `tel:` links already exist in the follow-up queue (`<a href=\`tel:${row.fatherPhone}\`>`). 

**Gap:** The "Collect" button in the follow-up queue deep-links to Payment Desk with `?studentId=...&classId=...`. Verify this URL survives the session param appending and loads the student pre-selected on mobile. If it does, this is already a strong mobile-first workflow.

**Enhancement:** Add a `phone_call_intent` metric when the `tel:` link is clicked — helps understand how often staff actually call from the dashboard.

---

### 3.4 Dashboard — Sticky "Open Desk" FAB on Mobile

On the dashboard, a floating action button pinned above the bottom nav for accountants could save several taps for the primary daily workflow:

```tsx
{canPostPayments && (
  <Link
    href={withSession("/protected/payments")}
    className="fixed bottom-[calc(var(--mobile-bottom-nav-offset)+12px)] right-4 z-50 flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground shadow-md md:hidden"
  >
    <BadgeIndianRupee className="size-4" />
    Open Desk
  </Link>
)}
```

This respects the existing `--mobile-bottom-nav-offset` CSS variable.

---

### 3.5 Collection Trend — Touchable Chart

The collection trend is currently a set of horizontal bar rows (pure HTML, no JS library). This is great for performance. Enhancement: make each row tappable to deep-link to transactions filtered by that date:

```tsx
<Link href={withSession(`/protected/transactions?fromDate=${row.date}&toDate=${row.date}`)}>
  <div className="grid items-center gap-3 ...">...</div>
</Link>
```

---

## 4. Defaulters — Phone-First Workflow

### 4.1 One-Tap WhatsApp Follow-Up

The copy-reminder button (`CopyReminderButton`) copies a templated text to clipboard. On mobile, a WhatsApp share is more direct:

```tsx
<a
  href={`https://wa.me/91${row.fatherPhone?.replace(/\D/g, "")}?text=${encodeURIComponent(row.reminderText)}`}
  target="_blank"
  rel="noopener noreferrer"
  className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
>
  <MessageSquare className="size-3.5" />
  WhatsApp
</a>
```

Condition: only show when `row.fatherPhone` is non-null. This removes the copy-paste step entirely.

---

### 4.2 Defaulters — Inline Call Notes (Future)

The roadmap already has "follow-up/call notes flow for defaulters" planned. From a mobile UX angle:
- Notes should open in a bottom sheet (not a full page navigation) to preserve list context
- Saving a note should optimistically update the row without a page reload
- A "called at HH:MM" timestamp should be auto-inserted

---

### 4.3 Defaulters Filter — Collapsible on Mobile

The filter section (`SectionCard title="Filters"`) is fully expanded on mobile, taking up 40–50% of the viewport before any results appear. On mobile:
- Collapse the filter panel by default with a "Filters (3 active)" summary chip
- Expand only when tapped
- This matches the pattern used by banking apps (Paytm, PhonePe) that Indian office users are familiar with

```tsx
// Mobile: collapsed by default
<details open={hasActiveFilters} className="md:contents">
  <summary className="md:hidden ...">Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}</summary>
  {/* filter form content */}
</details>
```

---

## 5. Students — Data-Intensive Screens

### 5.1 Students List — Mobile Card View vs Desktop Table

The students list is likely a table with columns for name, class, status, admission number. On mobile, render each student as a tappable card row:

```
┌─────────────────────────────────┐
│ Rahul Sharma        Class 10-A  │
│ SR-001234  ·  Active            │
│                         ₹5,000  │  ← pending dues
└─────────────────────────────────┘
```

- Tapping the card opens the student detail page
- A secondary action (⋮ menu) offers "Collect payment" and "Call parent"
- The card shows a red dot badge if the student has overdue dues

---

### 5.2 Student Detail Page — Tab Bar on Mobile

The student detail has tabs: `profile | fee-plan | dues | payments | receipts | notes | history` (7 tabs). On mobile this renders as a horizontal scroll tab bar — verify it does not overflow by cutting off tab labels. Recommendations:
- Use icon + short label on mobile: profile → 👤 Profile, dues → 💰 Dues
- Or collapse to a `<select>` dropdown on very narrow viewports

---

### 5.3 Student Search — Full-Width Search Bar

On the students list, the search bar should be full-width and auto-focused on mobile (without using `autoFocus` which causes keyboard to pop open immediately on page load). Instead, use a "Search" FAB that expands to a full-screen search overlay — similar to how iOS Contacts works.

---

## 6. Transactions (Workbook) — Table to Cards

### 6.1 Transactions Table on Mobile

The transactions workbook likely renders a multi-column table (amount, student, class, date, mode, receipt). On mobile this becomes a horizontal-scroll nightmare.

**Fix:** Detect mobile with a CSS container query or `md:hidden` and render a receipt-card list:

```
┌──────────────────────────────────┐
│ SVP-00123       Cash    ₹12,500  │
│ Rahul Sharma  ·  Class 10-A      │
│ 20 Apr 2026                      │
└──────────────────────────────────┘
```

Each card links to the receipt detail. Amount and receipt number are the two most important pieces of information — they should be visually dominant.

---

### 6.2 Date Range Filter — Date Picker on Mobile

Date inputs (`<input type="date">`) render differently on iOS vs Android vs desktop. On iOS, the native date picker is fine. On Android, use the native picker by keeping `type="date"` — do NOT replace with a custom calendar widget (it breaks accessibility and is slower).

Make sure `fromDate` and `toDate` inputs have:
```html
<input type="date" min="2026-04-01" max="2027-03-31" />
```

This constrains to the active academic year and prevents invalid date entry.

---

## 7. Navigation — The 8-Module Problem

### 7.1 Bottom Nav Has 5 Slots, 8 Modules

The `getMobileBottomNavigation` function returns up to 5 items. The remaining modules (Fee Setup, Exports, Admin Tools) are reachable only by navigating to desktop layout sections. On a phone-only workflow, those modules are effectively "buried."

**Fix — "More" overflow tab:**

Replace the 5th nav slot with a "More" tab that opens a full-screen sheet listing all modules with their icons and descriptions:

```
Bottom Nav: Dashboard | Students | Desk | Defaulters | More ▸

"More" sheet:
  ├── Fee Setup
  ├── Transactions  
  ├── Exports
  └── Admin Tools (admin only)
```

This is the standard pattern used by Twitter/X, YouTube, and most mobile apps with 6+ destinations.

---

### 7.2 Active Route Indicator

The current active state is a 2px line at the top of the nav item (`h-[2px] w-8`). This is subtle — good taste, but may be hard to see in bright office lighting. Consider:
- Filled icon vs outline icon (standard Google/Material pattern)
- Or a pill background on the active icon: `bg-accent/10 rounded-lg`

```tsx
// Active: filled pill background
className={cn(
  "rounded-lg px-3 py-1",
  active ? "bg-accent/10 text-accent" : "text-muted-foreground"
)}
```

---

### 7.3 Session Switcher — Keyboard Trap on Mobile

The `MobileSessionPill` opens a `Sheet` with a list of academic sessions. Verify that:
- Focus is trapped inside the sheet when open
- The back gesture on Android closes the sheet (not the page)
- The `description` prop of the sheet is read by screen readers

---

## 8. Forms — Input Quality

### 8.1 Input Modes Summary (Audit All Fields)

Every form field should have the correct `inputMode` attribute. A quick audit:

| Field | Current | Should Be |
|-------|---------|-----------|
| Payment Amount | `type="text"` | + `inputMode="decimal"` |
| Quick Discount | `type="text"` | + `inputMode="decimal"` |
| Reference Number (UPI) | `type="text"` | + `inputMode="numeric"` |
| Father's Phone | `type="tel"` likely | `type="tel"` ✓ |
| Admission Number | text | `inputMode="numeric"` if numeric |
| Date fields | `type="date"` | `type="date"` ✓ |

---

### 8.2 Auto-Complete Attributes

Payment form fields should have `autoComplete="off"` to prevent browser/password manager from filling fee amounts with old values. The current `PaymentDeskClient` already does this in places — audit the reference number and amount inputs specifically.

---

### 8.3 Fee Setup Forms — Scroll Anchoring on Error

When a large form (Fee Setup, Student Add/Edit) fails validation and shows errors, the page should scroll to the first error field. Add:

```ts
// After server action returns validation errors
const firstErrorField = document.querySelector('[aria-invalid="true"]');
firstErrorField?.scrollIntoView({ behavior: "smooth", block: "center" });
```

---

## 9. Typography & Performance

### 9.1 Font Display Strategy

`Source Serif 4` is loaded as a display/heading font. If it hasn't loaded when the page first paints, text shifts (CLS). Add `font-display: swap` or `optional` in the font loading config:

```ts
// In app/layout.tsx (next/font)
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});
```

This prevents invisible text during font load (FOIT) on slow connections.

---

### 9.2 Money Component — Tabular Numbers

The `<Money>` component (used heavily across all screens) should use tabular number spacing so amounts don't shift as data loads. Verify `font-variant-numeric: tabular-nums` is applied. The CSS already has `.tabular` utilities — make sure `Money` always renders with this class.

---

### 9.3 Skeleton Screens — Show Something Immediately

`DashboardBelowFoldSkeleton` and `PaymentDeskSkeleton` exist. Verify skeleton dimensions match real content to prevent layout shift on load. Mismatched skeletons cause content jumps that feel janky on mobile.

---

## 10. Receipts & Printing

### 10.1 Receipt Print on Mobile

`window.print()` on mobile is a poor experience — it opens a system print dialog that most users don't know how to use. For the **success sheet** after a payment:

**Better mobile flow:**
1. **WhatsApp Share** → pre-filled message with receipt details (described in §2.8)
2. **Save as PDF** → use `window.print()` with a `@media print` stylesheet that renders a clean receipt layout, then "Save to Files" on iOS / "Save as PDF" on Android
3. **Download Receipt** → a `/protected/receipts/[id]/pdf` route that returns a proper PDF via the existing PDF generation infrastructure

Add these three options to the success sheet instead of a single "Print" button.

---

### 10.2 Receipt Page — Share Button

The receipt detail page (`/protected/receipts/[receiptId]`) should have a native Share button on mobile using the Web Share API:

```ts
if (navigator.share) {
  await navigator.share({
    title: `Fee Receipt ${receiptNumber}`,
    text: `VPPS Fee Receipt\nStudent: ${studentName}\nAmount: ₹${amount}`,
    url: window.location.href,
  });
}
```

Fall back to copy-to-clipboard if `navigator.share` is not supported.

---

## 11. Accessibility on Mobile

### 11.1 Touch Target Audit

Most interactive elements use `min-h-11` (44px) — this matches WCAG 2.5.8 (Target Size minimum). Exceptions to verify:
- The "Show all classes" `<details><summary>` in ClassSummaryTable — needs `min-h-11`
- The session pill button (`h-8`) — at 32px, this is below the 44px target. Use `h-11` instead.
- Bottom nav items — currently `min-h-11` ✓

---

### 11.2 Error Messages — Visible Without Colour

The success/error/warning `ActionNotice` component uses background colour as the sole indicator. Add an icon to each state so colour-blind users can distinguish:

```tsx
// Error state: add an X icon
// Warning state: add a ⚠ icon  
// Success state: add a ✓ icon
```

The `Notice` component already uses `tone` + icon — `ActionNotice` should follow the same pattern.

---

### 11.3 Focus Ring Visibility

The CSS has a `focus-ring` utility. Verify it is visible on all interactive elements — especially on the payment amount input and the student search field, where staff use keyboards for fast data entry.

---

## 12. Micro-Interactions & Polish

### 12.1 Pull-to-Refresh on Dashboard and Defaulters

Dashboard data is fetched server-side on page load. On mobile, staff expect to be able to swipe down to refresh. Implement a pull-to-refresh gesture on the main scroll container:

```ts
// useEffect: track touchstart/touchmove/touchend on <main>
// If drag distance > 80px downward from top-of-scroll: trigger router.refresh()
// Show a spinner during the refresh
```

---

### 12.2 Empty States — Actionable on Mobile

Empty states (no students, no receipts) should have a single large CTA button, not just text + a link. On a phone, inline text links are easy to miss. The `EmptyState` component already accepts an `action` prop — verify all empty states use it with a proper `<Button>` not a plain `<Link>`.

---

### 12.3 Loading Skeleton — Match Content Height

The `LoadingBlock` used in `DashboardBelowFoldSkeleton` renders generic grey rectangles. Improve by:
- Matching the approximate height of the content it replaces
- Using a shimmer animation (already available via `tailwindcss-animate` which is in the config)
- Avoiding layout shift when content loads

---

### 12.4 Back Navigation — Preserve Scroll Position

`ScrollRestoringMain` component already exists. Verify it is working correctly on the Students list → Student detail → back to Students list flow. Losing scroll position is one of the most frustrating mobile regressions.

---

## 13. Dark Mode (Future, Low Priority)

The design system has `darkMode: ["class"]` in `tailwind.config.ts` — it's ready for dark mode but not yet implemented. School offices often work in bright daylight, so dark mode is low priority. Do not block any of the above improvements for dark mode.

However: **do not hardcode any colours** in the improvements above. Use CSS tokens (`text-foreground`, `bg-surface`, `text-accent`) exclusively, so dark mode can be added later without rework.

---

## 14. Prioritised Implementation Plan

### Phase 1: Quick Wins (1–2 days each, no UX risk)
| # | Improvement | File | Effort |
|---|-------------|------|--------|
| 1 | Fix PWA theme_color to saffron | `public/manifest.webmanifest` | 5 min |
| 2 | `inputMode="decimal"` on amount inputs | `payment-desk-mobile.tsx` | 15 min |
| 3 | `inputMode="numeric"` for reference field | `payment-desk-mobile.tsx` | 15 min |
| 4 | Haptic feedback on payment success | `payment-desk-mobile.tsx` | 20 min |
| 5 | Font display swap for Source Serif | `app/layout.tsx` | 15 min |
| 6 | WhatsApp share on success sheet | `success-receipt-sheet.tsx` | 30 min |
| 7 | Session pill height bump h-8 → h-11 | `mobile-session-pill.tsx` | 5 min |

### Phase 2: Medium Effort (1–3 days)
| # | Improvement | Files | Effort |
|---|-------------|-------|--------|
| 8 | Secondary KPIs visible on mobile (2×2 grid) | `dashboard/page.tsx` | 1h |
| 9 | Class summary mobile card list | `dashboard/page.tsx` | 2h |
| 10 | Student list mobile card view | `components/students/` | 1 day |
| 11 | Defaulters filter collapsible on mobile | `components/defaulters/` | 2h |
| 12 | "More" overflow tab in bottom nav | `mobile-bottom-nav.tsx` + `navigation.ts` | 3h |
| 13 | Dashboard sticky FAB for accountants | `dashboard/page.tsx` | 1h |
| 14 | WhatsApp follow-up on defaulters | `defaulters/page.tsx` | 1h |

### Phase 3: Larger UX Investments (3–7 days)
| # | Improvement | Notes |
|---|-------------|-------|
| 15 | Swipe-to-dismiss on student picker sheet | `useSwipeToDismiss` hook |
| 16 | Transactions table → card list on mobile | Requires redesign of workbook view |
| 17 | Pull-to-refresh on dashboard | `useEffect` + `router.refresh()` |
| 18 | Role-aware PWA manifest | Server-rendered `/api/manifest` route |
| 19 | Service worker runtime caching | Upgrade `service-worker.js` |
| 20 | Receipt PDF / Share flow | New `/receipts/[id]/pdf` route |

---

## 15. What NOT to Build (Anti-patterns)

- **Do not add a native mobile app.** The PWA is the right foundation for an internal staff tool. Build on it.
- **Do not add a custom date picker.** The native `<input type="date">` is excellent on modern Android/iOS. Custom pickers are slower and break accessibility.
- **Do not add swipe-between-tabs** on the student detail page. Tab switching via swipe conflicts with browser back gestures and causes navigation confusion.
- **Do not lazy-load the payment desk student index.** It is already pre-loaded at page mount — keeping it in memory is the right call for cashier speed.
- **Do not hide data on mobile with `md:hidden` and a "see it on desktop" notice.** The Class Summary table fix is the biggest example of this anti-pattern in the current codebase.

---

## Appendix: Existing Mobile Infrastructure Inventory

Already implemented (do not rebuild):

| Component | Location | Status |
|-----------|----------|--------|
| `MobileBottomNav` | `components/admin/mobile-bottom-nav.tsx` | ✅ Good |
| `MobileHeader` | `components/admin/app-topbar.tsx` | ✅ Good |
| `MobileSessionPill` | `components/admin/mobile-session-pill.tsx` | ✅ Good (fix height) |
| Mobile CSS vars | `app/globals.css` | ✅ Comprehensive |
| PWA manifest | `public/manifest.webmanifest` | ⚠️ Fix theme_color |
| Service worker | `public/service-worker.js` | ⚠️ Needs upgrade |
| Draft persistence | `lib/payments/draft-store.ts` | ✅ Exists, verify |
| `useMediaQuery` | `hooks/use-media-query.ts` | ✅ In use |
| `useScrollIntoView` | `hooks/use-scroll-into-view.ts` | ✅ In use |
| Mobile preset amounts | `payment-desk-mobile.tsx` const | ✅ Exists |
| `tel:` links | Dashboard follow-up queue | ✅ Good |
| Safe area insets | `globals.css` | ✅ Comprehensive |
| Landscape mode CSS | `globals.css` line 358 | ✅ Good |
| PWA shortcuts | `manifest.webmanifest` | ⚠️ Not role-aware |

---

*This document is a living spec. Update it as improvements are implemented. Tag each completed item with a commit ref.*
