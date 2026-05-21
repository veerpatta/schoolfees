# VPPS Dashboard — Complete Mobile UI/UX Revamp
## Precision Codex Implementation Prompt

---

## CONTEXT

The app is **Next.js 16 App Router + TypeScript + React 19 + Tailwind CSS + shadcn/ui**.
Design tokens live in `app/globals.css`. The saffron accent is `hsl(var(--accent))`.

**The one file you will primarily edit is `app/protected/dashboard/page.tsx`.**
All UI components for the dashboard (`HeroKpis`, `QuickActions`, `TodayPanel`,
`FollowUpQueue`, `RecentReceipts`, `ClassPendingChart`, `TrendChart`,
`InstallmentStatus`, `ClassSummaryTable`, `AlertsPanel`, etc.) are defined as
**local functions inside that file**. Modify them in-place.

You will also edit:
- `components/admin/page-header.tsx` — compact on mobile
- `components/ui/kpi-card.tsx` — add horizontal strip variant

**Do NOT edit** any file in `lib/`, `app/api/`, `supabase/`, or `tests/`.
**Do NOT change** any data-fetching, server actions, or routing logic.
Run `npm run check` after all edits — must pass with zero errors.

---

## THE PROBLEM

On a 375px phone screen the dashboard currently looks like this (top-down):

```
[Eyebrow "Workspace"]
[Title "Dashboard" - 22px]
[Description - 2 lines of small text]
[Actions row - session badge + installment badge]
[Updated at timestamp]
[Installment pulse notice]
[2×2 grid of 4 KPI cards — cramped, numbers too small]
[Quick actions — full-width Collect + 3-col grid (too tight)]
[TodayPanel full width]
[↓ lazy-loaded sections: follow-up, receipts, charts, tables]
```

Problems:
- **Header waste**: PageHeader with eyebrow + title + description + badges eats 25% of screen before any data shows.
- **KPI 2×2 grid**: 4 equal-weight cards with small numbers. No visual hierarchy. No "hero number".
- **No clear primary metric**: Staff can't see today's total at a glance — it's buried inside one of 4 equally-sized cards.
- **Quick actions 3-col grid**: Buttons too small on narrow phones. "Add student / Students / Transactions / Defaulters" cramped at ~30vw each.
- **Follow-up queue rows**: 3-part vertical stack (name, amount, 3 buttons) per row — confusing button layout, "Collect" not standing out.
- **Below fold**: Long stack of section cards — charts, tables, matrix — all look the same, hard to navigate.

---

## THE NEW DESIGN

### Visual Blueprint (375px phone)

```
┌─────────────────────────────────────────┐
│ [🏫]  Dashboard    [2026-27▾]  [AK▾]   │  ← MobileHeader (existing, 56px)
├─────────────────────────────────────────┤
│  ─── TODAY  ·  21 May 2026 ────────────│  ← Compact context bar
│                                         │
│   ₹ 47,500            ◯ 68%            │  ← Hero row
│   Today's collection  Collection rate  │
│                                         │
│  [─────────────────────────────────]   │  ← Subtle divider
│  ₹2,15,000 │ ₹23,000 │ 7 receipts     │  ← 3-stat inline row
│   Pending   │ Overdue  │ Today         │
├─────────────────────────────────────────┤
│                                         │
│  ▶ Open Payment Desk           →       │  ← Full-width accent CTA (56px)
│                                         │
│  [👤 Add student] [📋 Defaulters] [📄]│  ← 3 ghost secondary buttons
│                                         │
├─────────────────────────────────────────┤
│  TODAY'S COLLECTION                     │
│  ● Cash        ₹32,500   4 receipts   │
│  ● UPI         ₹15,000   3 receipts   │
├─────────────────────────────────────────┤
│  TOP FOLLOW-UP   [Open all →]           │
│ ┌───────────────────────────────────┐  │
│ │ Ravi Kumar    10A · SR 1042       │  │
│ │              Pending ₹12,500 ↑   │  │
│ │ [📞 Call]  [📋 Copy]  [Collect▶] │  │
│ └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│  RECENT RECEIPTS  [All receipts →]      │
│  SVP-2041 · Amit Sharma · ₹8,500       │
│  SVP-2040 · Priya Patel · ₹5,000       │
├─────────────────────────────────────────┤
│  ▸ Class-wise pending        [chevron] │  ← Collapsible sections
│  ▸ Collection trend          [chevron] │
│  ▸ Installment status        [chevron] │
│  ▸ Class summary             [chevron] │
│  ▸ Attention items           [chevron] │
└─────────────────────────────────────────┘
      [🏠] [👥] [₹] [📋] [📄]
```

On **tablet / desktop**, preserve the existing layout exactly.
All changes are **mobile-only** (`max-md:` or inside a `md:hidden` / `hidden md:block` pattern).

---

## IMPLEMENTATION — STEP BY STEP

### STEP 1 — Compact PageHeader on mobile

**File: `components/admin/page-header.tsx`**

The PageHeader renders eyebrow + title + description + actions. On mobile, this wastes
valuable screen space because the MobileHeader already identifies the screen.

Change: Hide the entire PageHeader on mobile using `hidden sm:block` on the outer `<header>`.
Since the MobileHeader (sticky topbar) already shows "Dashboard" as the page name on mobile
(after the companion shell change), the duplicate full header is not needed.

```tsx
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        // Hide on mobile — the MobileHeader topbar already shows the page name.
        // Show from sm (640px) upward.
        "hidden sm:flex flex-col gap-3 pb-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      {/* ... rest unchanged ... */}
    </header>
  );
}
```

> **Important**: This will hide PageHeader on all pages. Verify all protected pages still
> look correct on tablet (640px+). The page title is always visible at 640px+ via this header.

---

### STEP 2 — New `MobileDashboardHero` component (inside `page.tsx`)

**File: `app/protected/dashboard/page.tsx`**

Add this new component directly above the existing `HeroKpis` function definition.
This renders only on `< md` (mobile) and replaces the cramped KPI grid with a
"mission control" style hero.

```tsx
/**
 * MobileDashboardHero — replaces the 2×2 KPI grid on phones.
 * Shows a full-width hero row (today's collection + rate gauge) plus
 * a 3-stat inline strip (pending | overdue | receipts today).
 */
function MobileDashboardHero({
  collected,
  pending,
  collectionRate,
  receiptsToday,
  followUpCount,
  overdueAmount,
  updatedAt,
  currentInstallmentLabel,
}: {
  collected: number;
  pending: number;
  collectionRate: number;
  receiptsToday: number;
  followUpCount: number;
  overdueAmount: number;
  updatedAt: string;
  currentInstallmentLabel?: string;
}) {
  // Format today's date for the context bar
  const todayLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="sm:hidden -mx-4 bg-card border-b border-border">
      {/* ── Context bar ─────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Today · {todayLabel}
        </p>
        {currentInstallmentLabel && (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[10px] font-semibold text-accent-soft-foreground">
            {currentInstallmentLabel}
          </span>
        )}
      </div>

      {/* ── Hero row: Today's collection + Rate gauge ───── */}
      <div className="flex items-end justify-between gap-4 px-4 pb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Today's collection
          </p>
          <div className="mt-1.5">
            {/* Large hero number — use Money with display size */}
            <Money
              value={collected}
              size="display"
              className="text-[2.25rem] leading-none font-bold tracking-tight text-accent"
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {receiptsToday} receipt{receiptsToday === 1 ? "" : "s"} posted today
          </p>
        </div>
        {/* Rate gauge — larger size for prominence */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <RateGauge value={collectionRate} size="md" />
          <p className="text-[10px] font-medium text-muted-foreground">Collection rate</p>
        </div>
      </div>

      {/* ── 3-stat strip: Pending | Overdue | Receipts ──── */}
      <div className="grid grid-cols-3 border-t border-border">
        {[
          { label: "Pending", value: pending, tone: "warning" as const, subtext: `${followUpCount} students` },
          { label: "Overdue", value: overdueAmount, tone: "danger" as const, subtext: "past due date" },
          { label: "Receipts", value: receiptsToday, tone: "neutral" as const, subtext: "posted today", isCount: true },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className={cn(
              "flex flex-col items-center justify-center px-2 py-3",
              i < 2 && "border-r border-border",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
            <div className="mt-1">
              {stat.isCount ? (
                <span className={cn(
                  "text-lg font-bold tabular text-foreground",
                )}>
                  {stat.value}
                </span>
              ) : (
                <Money
                  value={stat.value}
                  size="lg"
                  tone={stat.tone}
                  className="text-base font-bold"
                />
              )}
            </div>
            <p className="mt-0.5 text-[9px] text-muted-foreground">{stat.subtext}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### STEP 3 — Modify `HeroKpis` to show only on tablet+

**File: `app/protected/dashboard/page.tsx`**

The existing `HeroKpis` function stays unchanged. Just wrap its output in `hidden sm:grid`:

```tsx
function HeroKpis({ ... }: ...) {
  const rateSignal = getCollectionRateHealth(collectionRate);

  return (
    // Was: <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
    // Now: hide on mobile (sm:hidden removed; sm:grid means show from 640px only)
    <div className="hidden sm:grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {/* ... rest of HeroKpis unchanged ... */}
    </div>
  );
}
```

---

### STEP 4 — New `MobileQuickActions` component (inside `page.tsx`)

The existing `QuickActions` component has a layout that mixes mobile/desktop imperfectly.
Add a new `MobileQuickActions` that renders only on mobile with a better layout.

```tsx
/**
 * MobileQuickActions — mobile-only quick action rail with a prominent
 * full-width Collect CTA and compact secondary actions below it.
 */
function MobileQuickActions({
  canWriteStudents,
  canPostPayments,
  sessionLabel,
}: {
  canWriteStudents: boolean;
  canPostPayments: boolean;
  sessionLabel?: string;
}) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  return (
    <div className="sm:hidden space-y-2.5">
      {/* Primary CTA — full width, tall, prominent */}
      {canPostPayments ? (
        <Button
          asChild
          variant="accent"
          className="h-14 w-full justify-between rounded-2xl px-5 text-base font-semibold shadow-sm"
        >
          <Link href={withSession("/protected/payments")}>
            <span className="flex items-center gap-2.5">
              <BadgeIndianRupee className="size-5" aria-hidden="true" />
              Open Payment Desk
            </span>
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
        </Button>
      ) : null}

      {/* Secondary actions — 3 equal columns */}
      <div className="grid grid-cols-3 gap-2">
        {canWriteStudents ? (
          <Button
            asChild
            variant="outline"
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium leading-tight"
          >
            <Link href={withSession("/protected/students/new")}>
              <UsersRound className="size-4.5" aria-hidden="true" />
              Add student
            </Link>
          </Button>
        ) : (
          <Button
            asChild
            variant="outline"
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium leading-tight"
          >
            <Link href={withSession("/protected/students")}>
              <UsersRound className="size-4.5" aria-hidden="true" />
              Students
            </Link>
          </Button>
        )}
        <Button
          asChild
          variant="outline"
          className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium leading-tight"
        >
          <Link href={withSession("/protected/defaulters")}>
            <ClipboardList className="size-4.5" aria-hidden="true" />
            Defaulters
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium leading-tight"
        >
          <Link href={withSession("/protected/transactions")}>
            <ReceiptText className="size-4.5" aria-hidden="true" />
            History
          </Link>
        </Button>
      </div>
    </div>
  );
}
```

---

### STEP 5 — Modify the existing `QuickActions` to hide on mobile

```tsx
function QuickActions({ canWriteStudents, canPostPayments, sessionLabel }: ...) {
  // ... existing code ...
  return (
    // Add `hidden sm:block` — mobile uses MobileQuickActions instead
    <div className="hidden sm:block space-y-2 sm:flex sm:flex-wrap sm:gap-2 sm:space-y-0">
      {/* ... existing JSX unchanged ... */}
    </div>
  );
}
```

---

### STEP 6 — Redesign `TodayPanel` for mobile

The existing `TodayPanel` is fine but the payment modes list can be more visual on mobile.
Keep the existing structure and add a mobile-optimised mode list:

```tsx
function TodayPanel({ amount, receiptCount, monthAmount, refundDue, modes }: ...) {
  return (
    <Section
      title="Today"
      description="Collection posted at the desk for the current school day."
      actions={
        <Badge variant="accent" dot>
          {receiptCount} receipt{receiptCount === 1 ? "" : "s"}
        </Badge>
      }
    >
      <div className="space-y-4">
        {/* Hero total — larger on mobile */}
        <div className="rounded-xl bg-surface-2/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Collected today
          </p>
          <Money value={amount} size="display" className="mt-2" />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              This month: <Money value={monthAmount} size="xs" />
            </span>
            {refundDue > 0 ? (
              <span className="inline-flex items-center gap-1">
                Credit/refund: <Money value={refundDue} size="xs" />
              </span>
            ) : null}
          </div>
        </div>

        {modes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-2/40 px-4 py-3 text-sm text-muted-foreground">
            No payment-mode breakup yet for today.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {modes.map((mode) => (
              <li
                key={mode.paymentMode}
                className="flex items-center gap-3 px-4 py-3.5"
              >
                {/* Color dot per mode */}
                <span className={cn(
                  "size-2 shrink-0 rounded-full",
                  mode.paymentMode.toLowerCase() === "cash" && "bg-success",
                  mode.paymentMode.toLowerCase() === "upi" && "bg-info",
                  mode.paymentMode.toLowerCase() === "bank transfer" && "bg-accent",
                  mode.paymentMode.toLowerCase() === "cheque" && "bg-warning",
                  !["cash","upi","bank transfer","cheque"].includes(mode.paymentMode.toLowerCase()) && "bg-muted-foreground",
                )} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{mode.paymentMode}</p>
                  <p className="text-xs text-muted-foreground">
                    {mode.receiptCount} receipt{mode.receiptCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Money value={mode.amount} size="lg" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
```

---

### STEP 7 — Redesign `FollowUpQueue` for mobile

The follow-up items currently stack as: name+meta row → amount row → 3-button row.
The action buttons are hard to scan. Redesign as a clean card with name+amount on one row
and actions on the next row, with a green phone number pill.

```tsx
function FollowUpQueue({ rows, canPostPayments, sessionLabel }: ...) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  if (rows.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={CheckCircle2}
        title="No defaulters in view"
        description="No outstanding follow-up items in the current dashboard window."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
      {rows.map((row) => (
        <li key={row.studentId} className="px-4 py-4 transition-colors hover:bg-surface-2/40">

          {/* Row 1: Name + Class + Outstanding amount */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground truncate">{row.studentName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.classLabel}
                {row.admissionNo ? ` · SR ${row.admissionNo}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Money value={row.outstandingAmount} size="lg" tone="warning" />
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {row.nextDueDate
                  ? `Due ${formatShortDate(row.nextDueDate)}`
                  : row.statusLabel || "Pending"}
              </p>
            </div>
          </div>

          {/* Row 2: Action chips */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {/* Phone call — most important action for a defaulter screen */}
            {row.fatherPhone ? (
              <a
                href={`tel:${row.fatherPhone}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-foreground min-h-9 transition-colors hover:bg-surface-3 active:bg-surface-3"
                aria-label={`Call ${row.studentName}'s parent at ${row.fatherPhone}`}
              >
                <Phone className="size-3.5 text-success" aria-hidden="true" />
                {row.fatherPhone}
              </a>
            ) : null}
            <CopyReminderButton text={row.reminderText} />
            {/* Collect CTA — flush right, accent pill */}
            <Button
              asChild
              size="sm"
              variant={canPostPayments ? "accent" : "outline"}
              className="ml-auto rounded-full px-4 font-semibold"
            >
              <Link
                href={withSession(
                  `/protected/payments?studentId=${row.studentId}&classId=${row.classId}`,
                )}
              >
                {canPostPayments ? "Collect" : "View"}
              </Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

---

### STEP 8 — Redesign `RecentReceipts` for mobile

Make each receipt a larger tap target with cleaner typography:

```tsx
function RecentReceipts({ rows, sessionLabel }: ...) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  if (rows.length === 0) { /* unchanged */ }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
      {rows.map((row) => (
        <li key={row.receiptId}>
          <Link
            href={withSession(`/protected/receipts/${row.receiptId}`)}
            className="flex items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-surface-2/40 active:bg-surface-2/60"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground text-sm">{row.receiptNumber}</p>
              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                {row.studentName} · {row.classLabel}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatShortDate(row.paymentDate)} · {row.paymentMode}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Money value={row.amount} size="lg" />
              <ChevronRight className="mt-1 size-3.5 text-muted-foreground ml-auto" aria-hidden="true" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

Add `ChevronRight` to the imports at the top of the file (it's already in lucide-react).

---

### STEP 9 — Collapsible below-fold sections on mobile

**File: `app/protected/dashboard/page.tsx`** — inside `DashboardBelowFold`

The charts, installment status, matrix table, and class summary are useful but secondary.
On mobile, wrap each in a `<details>` element so they are collapsed by default but
one tap expands them. This prevents the page from being an overwhelming infinite scroll.

Create a helper wrapper component at the top of the file:

```tsx
/**
 * MobileCollapse — wraps a section in a collapsible <details> on mobile.
 * On tablet+, renders children directly (no wrapper).
 */
function MobileCollapse({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <>
      {/* Mobile: collapsible */}
      <details
        className="group sm:hidden rounded-xl border border-border bg-card overflow-hidden"
        open={defaultOpen}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 font-semibold text-foreground text-sm select-none">
          {title}
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-border px-4 pb-4 pt-3">
          {children}
        </div>
      </details>

      {/* Tablet+: render normally (no collapse) */}
      <div className="hidden sm:block">
        {children}
      </div>
    </>
  );
}
```

Then in `DashboardBelowFold`, wrap the below-fold sections:

```tsx
{/* Charts row — collapsible on mobile */}
<div className="grid gap-5 xl:grid-cols-2">
  <MobileCollapse title="Class-wise pending">
    <ClassPendingChart rows={maxChartCards} />
  </MobileCollapse>
  <MobileCollapse title="Collection trend">
    <TrendChart rows={data.collectionTrend} />
  </MobileCollapse>
  <MobileCollapse title="Installment status" defaultOpen={true}>
    <InstallmentStatus rows={data.installmentSummary} />
  </MobileCollapse>
</div>

<MobileCollapse title="Class × Installment pending matrix">
  <ClassInstallmentMatrixTable matrix={data.classInstallmentMatrix} />
</MobileCollapse>

<MobileCollapse title="Class-wise fee position">
  <ClassSummaryTable rows={data.classSummary} sessionLabel={sessionLabel} />
</MobileCollapse>

<MobileCollapse title="Attention items">
  <AlertsPanel alerts={visibleAlerts.filter(a => a.tone !== "danger" && a.tone !== "warning")} />
</MobileCollapse>
```

Note: the danger/warning alerts should NOT be collapsed — leave those outside the MobileCollapse
since they need immediate visibility.

---

### STEP 10 — Wire up `MobileDashboardHero` and `MobileQuickActions` in the page

**File: `app/protected/dashboard/page.tsx`** — inside `DashboardPage` return JSX

The current above-fold section looks like:

```tsx
<div className="space-y-4 anim-fade-in">
  <HeroKpis ... />
  <InstallmentPulse ... />
  <CriticalAlerts ... />
  <div className="anim-fade-in [animation-delay:60ms]">
    <QuickActions ... />
  </div>
</div>
```

Replace this block with:

```tsx
<div className="space-y-4 anim-fade-in">
  {/* ── Mobile hero (phone only) ── */}
  <MobileDashboardHero
    collected={aboveFold.kpis.todaysCollection}
    pending={aboveFold.kpis.totalPending}
    collectionRate={aboveFold.kpis.collectionRate}
    receiptsToday={aboveFold.kpis.receiptsToday}
    followUpCount={aboveFold.studentsWithPending}
    overdueAmount={aboveFold.kpis.overdueAmount}
    updatedAt={aboveFold.generatedAt}
    currentInstallmentLabel={aboveFold.currentInstallment?.label}
  />

  {/* ── Tablet+ KPI grid (sm and above) ── */}
  <HeroKpis
    collected={aboveFold.kpis.todaysCollection}
    pending={aboveFold.kpis.totalPending}
    collectionRate={aboveFold.kpis.collectionRate}
    receiptsToday={aboveFold.kpis.receiptsToday}
    followUpCount={aboveFold.studentsWithPending}
    overdueAmount={aboveFold.kpis.overdueAmount}
  />

  <InstallmentPulse ... />
  <CriticalAlerts ... />

  {/* ── Mobile quick actions (phone only) ── */}
  <MobileQuickActions
    canWriteStudents={canWriteStudents}
    canPostPayments={canPostPayments}
    sessionLabel={viewSession.sessionLabel}
  />

  {/* ── Tablet+ quick actions ── */}
  <div className="anim-fade-in [animation-delay:60ms]">
    <QuickActions
      canWriteStudents={canWriteStudents}
      canPostPayments={canPostPayments}
      sessionLabel={viewSession.sessionLabel}
    />
  </div>
</div>
```

---

### STEP 11 — Remove the `space-y-5` timestamp on mobile

The `<p className="text-xs text-muted-foreground -mt-5">Updated at ...</p>` line floats
awkwardly between the PageHeader and the hero on mobile. Since the PageHeader is now hidden
on mobile, this timestamp also needs to be hidden:

```tsx
{/* Hide on mobile — PageHeader is hidden there, timestamp looks orphaned */}
<p className="hidden sm:block text-xs text-muted-foreground -mt-5">
  Updated at {formatUpdatedAt(aboveFold.generatedAt)}
</p>
```

---

### STEP 12 — Mobile Section spacing

The outer `<div className="space-y-7">` in the DashboardPage return creates 28px gaps between
all sections. On mobile, reduce this to 16px:

```tsx
// Was:
<div className="space-y-7">

// New:
<div className="space-y-4 sm:space-y-7">
```

---

### STEP 13 — Section header typography on mobile

**File: `components/ui/section.tsx`**

Section headers currently use `text-base sm:text-lg`. On mobile the section description text
is often too long and uses `text-sm leading-6` which takes 2–3 lines. Hide descriptions on
mobile to keep sections lean:

```tsx
{description ? (
  <p className="mt-1 hidden max-w-3xl text-sm leading-6 text-muted-foreground sm:block">
    {description}
  </p>
) : null}
```

---

## SUMMARY OF NEW MOBILE DASHBOARD FLOW

After all changes, on a 375px phone the user sees:

1. **Sticky header** (56px): Logo | "Dashboard" | Session pill | User avatar
2. **Hero card** (full-bleed, card bg): Context bar (today's date + installment) → Big collection number (2.25rem bold saffron) + Rate gauge side by side → 3-stat strip (Pending | Overdue | Receipts)
3. **Action rail**: Tall saffron "Open Payment Desk" CTA (56px) → 3-col grid of secondary buttons (Add student / Defaulters / History)
4. **Today section** (card): Payment mode breakdown with color dots
5. **Top follow-up section** (card): Clean rows with name+amount on line 1, phone+copy+Collect on line 2
6. **Recent receipts section** (card): Simple list with receipt no + student + amount
7. **Collapsible sections** (collapsed by default): Class pending / Trend / Installment status (open) / Matrix / Summary / Alerts

Desktop/tablet: completely unchanged — only `max-md:*` / `sm:hidden` / `hidden sm:*` changes.

---

## FILES TO MODIFY

```
app/protected/dashboard/page.tsx      # Steps 2–13 (primary)
components/admin/page-header.tsx      # Step 1
components/ui/section.tsx             # Step 13
```

## DO NOT MODIFY

```
lib/**
app/api/**
supabase/**
tests/**
components/admin/dashboard-shell.tsx  # Shell layout unchanged
```

---

## VERIFICATION CHECKLIST

- [ ] `npm run check` → zero TypeScript errors, zero lint errors
- [ ] `npm run build` → clean build
- [ ] **Phone (375px)**: Hero card shows large saffron today's collection number
- [ ] **Phone (375px)**: Rate gauge renders to the right of hero number
- [ ] **Phone (375px)**: 3-stat strip shows Pending | Overdue | Receipts in 3 equal columns
- [ ] **Phone (375px)**: "Open Payment Desk" button is 56px tall, full-width, accent color
- [ ] **Phone (375px)**: 3 secondary action tiles are `h-16` with icon + label stacked
- [ ] **Phone (375px)**: PageHeader completely hidden (no "Workspace" eyebrow, no description)
- [ ] **Phone (375px)**: Follow-up rows show phone number as tappable pill + Collect as accent pill
- [ ] **Phone (375px)**: Below-fold sections are collapsed by default (except Installment status)
- [ ] **Phone (375px)**: Collapsible chevron rotates 180° when section opens
- [ ] **Tablet (768px)**: PageHeader visible again (eyebrow + title + description)
- [ ] **Tablet (768px)**: Old 2×2 KPI grid shows (not the new hero card)
- [ ] **Desktop (1024px)**: 4-column KPI grid visible; layout completely unchanged
- [ ] **Print**: All `print:hidden` still works; PageHeader shows in print mode
- [ ] **Test session (TEST-2026-27)**: Purple ring + banner still visible
- [ ] `aria-live` on `InstallmentPulse` and `CriticalAlerts` notices still present
- [ ] `ChevronRight` imported at top of `dashboard/page.tsx`
- [ ] `ChevronDown` imported at top of `dashboard/page.tsx`
- [ ] `cn` import still present in all modified files
- [ ] Money `size="display"` renders `text-3xl` — verify no overflow at 320px (iPhone SE)

---

*End of prompt — implement in the exact order of steps above.*
