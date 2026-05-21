# Dashboard Analytics Revamp — Codex Implementation Prompt

## Context

You are working on **VPPS Fee Management** — an internal admin app for Shri Veer Patta Senior Secondary School. Stack: Next.js 16 App Router + TypeScript + React 19 + Tailwind CSS + shadcn/ui. Design system: "Ledger Calm" (warm paper background, ink foreground, saffron accent).

The primary file for this task is **`app/protected/dashboard/page.tsx`**. All components in this file are local (defined inline in the same file). Do not create separate component files unless explicitly told to.

Read `CLAUDE.md` before starting. Never use `npm install` — no new packages allowed. All charts must use pure SVG and CSS only.

---

## Goal

Transform the dashboard from a mixed list+stats page into a **pure analytics powerhouse** — dense with visual data, easy to read at a glance, useful for anyone (technical or not) wanting to improve fee collection. Works beautifully on both desktop and mobile.

**Remove:** The `FollowUpQueue` component (defaulters list) and `RecentReceipts` component (recent transactions list). These are already one click away via the bottom nav / sidebar — they waste dashboard real estate.

**Add:** Visual-first analytics: collection funnel, payment mode breakdown, installment progress, class leaderboard, student status ring, daily momentum tracker, and compact quick-jump links to replace the removed lists.

---

## Data Available (No New DB Queries)

All data already flows through two existing fetchers:

```typescript
// Fast, above the fold
getDashboardAboveFoldData(sessionLabel) → { kpis: DashboardKpis, installments: DashboardInstallmentSummaryRow[] }

// Heavier, in Suspense
getDashboardPageData(sessionLabel) → {
  classSummary: DashboardClassSummaryRow[],
  trendData: DashboardTrendPoint[],
  paymentModeBreakdown: DashboardPaymentModeBreakdown[],
  classInstallmentPending: DashboardClassInstallmentPendingRow[],
  alerts: DashboardAlert[],
}
```

Key types (from `lib/dashboard/summary.ts`):

```typescript
type DashboardKpis = {
  totalStudents: number;
  totalExpectedFees: number;
  totalCollected: number;
  totalPending: number;
  overdueAmount: number;
  todaysCollection: number;
  thisMonthCollection: number;
  receiptsToday: number;
  collectionRate: number; // 0–100
};

type DashboardClassSummaryRow = {
  classId: string;
  classLabel: string;
  totalStudents: number;
  studentsWithGeneratedDues: number;
  missingDuesStudents: number;
  expectedAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  overdueStudents: number;
  studentsWithPending: number;
  collectionRate: number; // 0–100
};

type DashboardInstallmentSummaryRow = {
  installmentNo: number;
  installmentLabel: string;
  dueDate: string; // ISO date string
  studentCount: number;
  expectedAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  collectionRate: number;
};

type DashboardTrendPoint = { date: string; amount: number; receiptCount: number };
type DashboardPaymentModeBreakdown = { paymentMode: string; amount: number; receiptCount: number };
type DashboardClassInstallmentPendingRow = {
  classId: string;
  classLabel: string;
  installments: { installmentNo: number; installmentLabel: string; pendingAmount: number }[];
  totalPendingAmount: number;
};
```

Derive what you need. For example:
- **Students fully paid** = `totalStudents - studentsWithPending` (sum across classSummary)
- **Students with any pending** = sum of `studentsWithPending` across classSummary
- **Days to next installment** = diff between today and the next upcoming installment dueDate

---

## Changes — Step by Step

### STEP 1 — Remove `FollowUpQueue` Component

Delete the entire `FollowUpQueue` function component from `app/protected/dashboard/page.tsx`.

Remove its usage from `DashboardBelowFold` (or wherever it's rendered in the JSX).

### STEP 2 — Remove `RecentReceipts` Component

Delete the entire `RecentReceipts` function component from `app/protected/dashboard/page.tsx`.

Remove its usage from `DashboardBelowFold` (or wherever it's rendered in the JSX).

### STEP 3 — Add `CollectionFunnelBar` Component

Add this new local component above `DashboardPage`:

```tsx
function CollectionFunnelBar({
  expected,
  collected,
  pending,
  overdue,
}: {
  expected: number;
  collected: number;
  pending: number;
  overdue: number;
}) {
  if (expected === 0) return null;
  const collectedPct = Math.round((collected / expected) * 100);
  // overdue is a subset of pending — show overdue as a distinct segment inside pending
  const overdueWithinPending = Math.min(overdue, pending);
  const normalPending = pending - overdueWithinPending;
  const pendingPct = Math.round((normalPending / expected) * 100);
  const overduePct = Math.round((overdueWithinPending / expected) * 100);
  // small rounding guard
  const unaccountedPct = Math.max(0, 100 - collectedPct - pendingPct - overduePct);

  return (
    <Section
      title="Collection Funnel"
      description="Where fees stand this academic year"
      variant="card"
    >
      <div className="space-y-4">
        {/* Stacked bar */}
        <div className="relative h-8 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="absolute left-0 top-0 h-full bg-emerald-500 transition-all duration-700"
            style={{ width: `${collectedPct}%` }}
            title={`Collected: ${collectedPct}%`}
          />
          <div
            className="absolute top-0 h-full bg-amber-400 transition-all duration-700"
            style={{ left: `${collectedPct}%`, width: `${pendingPct}%` }}
            title={`Pending: ${pendingPct}%`}
          />
          <div
            className="absolute top-0 h-full bg-red-500 transition-all duration-700"
            style={{ left: `${collectedPct + pendingPct}%`, width: `${overduePct}%` }}
            title={`Overdue: ${overduePct}%`}
          />
          {unaccountedPct > 0 && (
            <div
              className="absolute top-0 h-full bg-muted-foreground/20"
              style={{ left: `${collectedPct + pendingPct + overduePct}%`, width: `${unaccountedPct}%` }}
            />
          )}
          {/* Percentage label inside bar */}
          {collectedPct >= 12 && (
            <span className="absolute inset-0 flex items-center pl-3 text-xs font-semibold text-white">
              {collectedPct}% collected
            </span>
          )}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="font-medium text-foreground">Collected</span>
            </div>
            <Money amount={collected} size="sm" tone="success" className="pl-4" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
              <span className="font-medium text-foreground">Pending</span>
            </div>
            <Money amount={pending} size="sm" tone="warning" className="pl-4" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
              <span className="font-medium text-foreground">Overdue</span>
            </div>
            <Money amount={overdue} size="sm" tone="danger" className="pl-4" />
          </div>
        </div>
      </div>
    </Section>
  );
}
```

Render it in the above-fold section of `DashboardPage`, immediately after the `HeroKpis` block:

```tsx
<CollectionFunnelBar
  expected={kpis.totalExpectedFees}
  collected={kpis.totalCollected}
  pending={kpis.totalPending}
  overdue={kpis.overdueAmount}
/>
```

### STEP 4 — Add `DailyMomentumCard` Component

Add this new local component:

```tsx
function DailyMomentumCard({
  todaysCollection,
  receiptsToday,
  totalPending,
  installments,
}: {
  todaysCollection: number;
  receiptsToday: number;
  totalPending: number;
  installments: DashboardInstallmentSummaryRow[];
}) {
  // Find next upcoming installment that hasn't been fully collected
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = installments
    .filter((i) => new Date(i.dueDate) >= today && i.pendingAmount > 0)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const nextInstallment = upcoming[0] ?? null;
  let dailyTarget: number | null = null;
  let daysLeft: number | null = null;

  if (nextInstallment) {
    const due = new Date(nextInstallment.dueDate);
    due.setHours(0, 0, 0, 0);
    daysLeft = Math.max(1, Math.ceil((due.getTime() - today.getTime()) / 86_400_000));
    dailyTarget = Math.ceil(nextInstallment.pendingAmount / daysLeft);
  }

  const onTrack = dailyTarget !== null && todaysCollection >= dailyTarget;

  return (
    <Section title="Today's Momentum" variant="card">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Collected Today
          </span>
          <Money amount={todaysCollection} size="md" tone={todaysCollection > 0 ? "success" : "muted"} />
          <span className="text-xs text-muted-foreground">{receiptsToday} receipt{receiptsToday !== 1 ? "s" : ""}</span>
        </div>

        {dailyTarget !== null && daysLeft !== null && nextInstallment && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Daily Target
              </span>
              <Money amount={dailyTarget} size="md" tone={onTrack ? "success" : "warning"} />
              <span className="text-xs text-muted-foreground">to clear {nextInstallment.installmentLabel}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Days Left
              </span>
              <span className={`text-2xl font-bold tabular-nums ${daysLeft <= 7 ? "text-red-600" : daysLeft <= 14 ? "text-amber-600" : "text-foreground"}`}>
                {daysLeft}
              </span>
              <span className="text-xs text-muted-foreground">to {new Date(nextInstallment.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pace
              </span>
              <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold w-fit ${
                onTrack
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}>
                {onTrack ? "✓ On Track" : "↓ Behind"}
              </div>
              <span className="text-xs text-muted-foreground">
                {nextInstallment.installmentLabel} target
              </span>
            </div>
          </>
        )}

        {dailyTarget === null && (
          <div className="col-span-3 flex items-center text-sm text-muted-foreground">
            All upcoming installments are on track — no pending dues detected.
          </div>
        )}
      </div>
    </Section>
  );
}
```

Render in the above-fold section after `CollectionFunnelBar`:

```tsx
<DailyMomentumCard
  todaysCollection={kpis.todaysCollection}
  receiptsToday={kpis.receiptsToday}
  totalPending={kpis.totalPending}
  installments={installments}
/>
```

### STEP 5 — Replace `TodayPanel` with Enhanced `TodayBreakdown` (with Payment Mode Donut)

Replace the existing `TodayPanel` component with `TodayBreakdown`. This adds a multi-segment SVG donut chart for payment mode breakdown right next to today's totals.

Delete the old `TodayPanel` function and add:

```tsx
function PaymentModeDonut({
  modes,
  totalAmount,
}: {
  modes: DashboardPaymentModeBreakdown[];
  totalAmount: number;
}) {
  if (modes.length === 0 || totalAmount === 0) return null;

  // SVG donut: r=36, circumference=226.19
  const R = 36;
  const CIRC = 2 * Math.PI * R;
  const SIZE = 96;
  const CX = SIZE / 2;

  const PALETTE = ["#f97316", "#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#64748b"];

  let offset = 0;
  const segments = modes.map((m, i) => {
    const frac = totalAmount > 0 ? m.amount / totalAmount : 0;
    const dash = frac * CIRC;
    const seg = { ...m, dash, offset, color: PALETTE[i % PALETTE.length] };
    offset += dash;
    return seg;
  });

  return (
    <div className="flex items-center gap-4">
      {/* Donut */}
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0 -rotate-90">
        <circle
          cx={CX} cy={CX} r={R}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={10}
        />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={CX} cy={CX} r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={10}
            strokeDasharray={`${seg.dash} ${CIRC - seg.dash}`}
            strokeDashoffset={-seg.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="flex flex-col gap-1.5 min-w-0">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-sm min-w-0">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="truncate text-muted-foreground">{seg.paymentMode}</span>
            <span className="ml-auto shrink-0 font-medium tabular-nums">
              {Math.round((seg.amount / totalAmount) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TodayBreakdown({
  kpis,
  paymentModeBreakdown,
}: {
  kpis: DashboardKpis;
  paymentModeBreakdown: DashboardPaymentModeBreakdown[];
}) {
  const hasActivity = kpis.todaysCollection > 0 || kpis.receiptsToday > 0;

  return (
    <Section title="Today" variant="card">
      {!hasActivity ? (
        <p className="text-sm text-muted-foreground">No collections recorded yet today.</p>
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
          {/* Totals */}
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                Total Collected
              </p>
              <Money amount={kpis.todaysCollection} size="lg" tone="success" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                Receipts Issued
              </p>
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {kpis.receiptsToday}
              </span>
            </div>
          </div>

          {/* Divider */}
          {paymentModeBreakdown.length > 0 && (
            <>
              <div className="hidden h-full w-px bg-border sm:block" />
              <div className="flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
                  By Payment Mode
                </p>
                <PaymentModeDonut
                  modes={paymentModeBreakdown}
                  totalAmount={kpis.todaysCollection}
                />
              </div>
            </>
          )}
        </div>
      )}
    </Section>
  );
}
```

Update `DashboardBelowFold` to render `<TodayBreakdown kpis={kpis} paymentModeBreakdown={pageData.paymentModeBreakdown} />` where `TodayPanel` was called. Remove the old `TodayPanel` usage.

### STEP 6 — Replace `TrendChart` with `SVGTrendBarChart`

Delete the old `TrendChart` component and replace with:

```tsx
function SVGTrendBarChart({ trendData }: { trendData: DashboardTrendPoint[] }) {
  if (!trendData.length) return null;

  const CHART_H = 120;
  const CHART_W = 600; // viewBox width — scales with container
  const BAR_AREA_TOP = 10;
  const BAR_AREA_BOTTOM = 80;
  const BAR_AREA_H = BAR_AREA_BOTTOM - BAR_AREA_TOP;
  const LABEL_AREA_H = CHART_H - BAR_AREA_BOTTOM;

  const maxAmount = Math.max(...trendData.map((d) => d.amount), 1);
  const n = trendData.length;
  const slotW = CHART_W / n;
  const barW = Math.max(4, slotW * 0.55);

  // Truncate label to 5 chars (e.g. "21 Ma")
  const formatLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }).slice(0, 6);
  };

  const formatAmount = (v: number) =>
    v >= 100_000
      ? `₹${(v / 100_000).toFixed(1)}L`
      : v >= 1_000
      ? `₹${(v / 1_000).toFixed(0)}K`
      : `₹${v}`;

  return (
    <Section title="Collection Trend" description="Daily fee receipts" variant="card">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full"
          style={{ minWidth: "260px", height: "auto" }}
          aria-hidden="true"
        >
          {/* Horizontal guide lines */}
          {[0.25, 0.5, 0.75, 1].map((frac) => {
            const y = BAR_AREA_BOTTOM - frac * BAR_AREA_H;
            return (
              <line
                key={frac}
                x1={0} y1={y} x2={CHART_W} y2={y}
                stroke="hsl(var(--border))"
                strokeWidth={0.8}
                strokeDasharray="4 4"
              />
            );
          })}

          {trendData.map((point, i) => {
            const barH = Math.max(2, (point.amount / maxAmount) * BAR_AREA_H);
            const x = i * slotW + slotW / 2;
            const barX = x - barW / 2;
            const barY = BAR_AREA_BOTTOM - barH;
            const isToday =
              point.date === new Date().toISOString().slice(0, 10);

            return (
              <g key={i}>
                {/* Bar */}
                <rect
                  x={barX}
                  y={barY}
                  width={barW}
                  height={barH}
                  rx={2}
                  fill={isToday ? "hsl(var(--accent))" : "hsl(var(--primary) / 0.65)"}
                />
                {/* Amount label above bar (only if bar is tall enough) */}
                {barH > 16 && (
                  <text
                    x={x}
                    y={barY - 3}
                    textAnchor="middle"
                    fontSize={7}
                    fill="hsl(var(--muted-foreground))"
                  >
                    {formatAmount(point.amount)}
                  </text>
                )}
                {/* Date label below bar area */}
                <text
                  x={x}
                  y={BAR_AREA_BOTTOM + 10}
                  textAnchor="middle"
                  fontSize={7}
                  fill="hsl(var(--muted-foreground))"
                >
                  {formatLabel(point.date)}
                </text>
                {/* Receipt count */}
                {point.receiptCount > 0 && (
                  <text
                    x={x}
                    y={BAR_AREA_BOTTOM + 20}
                    textAnchor="middle"
                    fontSize={6}
                    fill="hsl(var(--muted-foreground) / 0.7)"
                  >
                    {point.receiptCount}r
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </Section>
  );
}
```

Replace usages of `<TrendChart ... />` with `<SVGTrendBarChart trendData={pageData.trendData} />`.

### STEP 7 — Add `InstallmentTrack` Component

Delete the old `InstallmentStatus` component and replace with:

```tsx
function InstallmentTrack({ installments }: { installments: DashboardInstallmentSummaryRow[] }) {
  if (!installments.length) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getStatus = (row: DashboardInstallmentSummaryRow) => {
    const due = new Date(row.dueDate);
    due.setHours(0, 0, 0, 0);
    if (row.collectionRate >= 95) return "done";
    if (due < today) return "overdue";
    if (due <= new Date(today.getTime() + 30 * 86_400_000)) return "current";
    return "upcoming";
  };

  const statusConfig = {
    done: { ring: "border-emerald-500 bg-emerald-500", text: "text-emerald-700", label: "Cleared", dotColor: "#10b981" },
    overdue: { ring: "border-red-500 bg-red-50", text: "text-red-700", label: "Overdue", dotColor: "#ef4444" },
    current: { ring: "border-amber-500 bg-amber-50", text: "text-amber-700", label: "Due Soon", dotColor: "#f59e0b" },
    upcoming: { ring: "border-muted bg-muted/40", text: "text-muted-foreground", label: "Upcoming", dotColor: "#94a3b8" },
  };

  return (
    <Section title="Installment Progress" description="Across all 4 due dates" variant="card">
      {/* Desktop: horizontal track — Mobile: vertical list */}
      <div className="hidden sm:block">
        {/* Connector line */}
        <div className="relative">
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-border" />
          <div className="relative grid grid-cols-4 gap-2">
            {installments.map((inst) => {
              const status = getStatus(inst);
              const cfg = statusConfig[status];
              const pct = Math.round(inst.collectionRate);
              return (
                <div key={inst.installmentNo} className="flex flex-col items-center gap-2">
                  {/* Circle node */}
                  <div
                    className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold ${cfg.ring}`}
                  >
                    {status === "done" ? (
                      <span className="text-white text-sm">✓</span>
                    ) : (
                      <span className={cfg.text}>{inst.installmentNo}</span>
                    )}
                  </div>

                  {/* Label + date */}
                  <div className="text-center">
                    <p className="text-xs font-semibold text-foreground leading-tight">
                      {inst.installmentLabel}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(inst.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: cfg.dotColor }}
                    />
                  </div>

                  {/* Percentage + status */}
                  <div className="text-center">
                    <span className={`text-sm font-bold tabular-nums ${cfg.text}`}>{pct}%</span>
                    <p className={`text-[10px] font-medium ${cfg.text}`}>{cfg.label}</p>
                  </div>

                  {/* Pending amount */}
                  {inst.pendingAmount > 0 && (
                    <Money amount={inst.pendingAmount} size="xs" tone="warning" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile: vertical cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {installments.map((inst) => {
          const status = getStatus(inst);
          const cfg = statusConfig[status];
          const pct = Math.round(inst.collectionRate);
          return (
            <div key={inst.installmentNo} className="flex items-center gap-3">
              {/* Node */}
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${cfg.ring}`}
              >
                {status === "done" ? (
                  <span className="text-white">✓</span>
                ) : (
                  <span className={cfg.text}>{inst.installmentNo}</span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {inst.installmentLabel}
                  </span>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${cfg.text}`}>{pct}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: cfg.dotColor }}
                  />
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    Due {new Date(inst.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                  {inst.pendingAmount > 0 && (
                    <Money amount={inst.pendingAmount} size="xs" tone="warning" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
```

Replace `<InstallmentStatus ... />` with `<InstallmentTrack installments={installments} />`.

### STEP 8 — Replace `ClassPendingChart` with `ClassLeaderboard`

Delete `ClassPendingChart`. Add:

```tsx
function ClassLeaderboard({ classSummary }: { classSummary: DashboardClassSummaryRow[] }) {
  if (!classSummary.length) return null;

  // Sort by collectionRate descending
  const sorted = [...classSummary].sort((a, b) => b.collectionRate - a.collectionRate);
  const maxPending = Math.max(...sorted.map((r) => r.pendingAmount), 1);

  const getRateColor = (rate: number) =>
    rate >= 75 ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444";

  const getRateBg = (rate: number) =>
    rate >= 75 ? "bg-emerald-50 text-emerald-700" : rate >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";

  return (
    <Section
      title="Class Leaderboard"
      description="Ranked by collection rate — red needs attention"
      variant="card"
    >
      <div className="space-y-2.5">
        {sorted.map((row, idx) => {
          const rate = Math.round(row.collectionRate);
          const pendingBarPct = Math.round((row.pendingAmount / maxPending) * 100);
          return (
            <div key={row.classId} className="flex items-center gap-3">
              {/* Rank */}
              <span className="w-5 text-right text-xs font-bold text-muted-foreground shrink-0">
                {idx + 1}
              </span>

              {/* Class name */}
              <span className="w-20 shrink-0 text-sm font-medium text-foreground truncate">
                {row.classLabel}
              </span>

              {/* Bar */}
              <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{
                    width: `${rate}%`,
                    backgroundColor: getRateColor(rate),
                  }}
                />
              </div>

              {/* Rate badge */}
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold tabular-nums ${getRateBg(rate)}`}>
                {rate}%
              </span>

              {/* Pending (hidden on small mobile) */}
              <div className="hidden sm:block shrink-0 w-24 text-right">
                {row.pendingAmount > 0 ? (
                  <Money amount={row.pendingAmount} size="xs" tone="warning" />
                ) : (
                  <span className="text-xs text-emerald-600 font-medium">Cleared</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary row */}
      <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <span>
          {sorted.filter((r) => r.collectionRate >= 75).length} classes above 75%
        </span>
        <span>
          {sorted.filter((r) => r.collectionRate < 50).length} classes below 50%
        </span>
      </div>
    </Section>
  );
}
```

Replace `<ClassPendingChart ... />` with `<ClassLeaderboard classSummary={pageData.classSummary} />`.

### STEP 9 — Add `StudentStatusRing` Component

Add after `ClassLeaderboard`:

```tsx
function StudentStatusRing({ classSummary, totalStudents }: { classSummary: DashboardClassSummaryRow[]; totalStudents: number }) {
  if (!classSummary.length || totalStudents === 0) return null;

  const studentsWithPending = classSummary.reduce((sum, r) => sum + r.studentsWithPending, 0);
  const studentsOverdue = classSummary.reduce((sum, r) => sum + r.overdueStudents, 0);
  const studentsFullyPaid = totalStudents - studentsWithPending;
  const studentsNormal = studentsWithPending - studentsOverdue; // pending but not overdue
  const missingDues = classSummary.reduce((sum, r) => sum + r.missingDuesStudents, 0);

  // SVG ring: r=40, CIRC=251.33
  const R = 40;
  const CIRC = 2 * Math.PI * R;
  const SIZE = 104;
  const CX = SIZE / 2;

  const segments = [
    { count: studentsFullyPaid, color: "#10b981", label: "Fully Paid" },
    { count: studentsNormal, color: "#f59e0b", label: "Pending" },
    { count: studentsOverdue, color: "#ef4444", label: "Overdue" },
  ].filter((s) => s.count > 0);

  let offset = 0;
  const rings = segments.map((seg) => {
    const frac = seg.count / totalStudents;
    const dash = frac * CIRC;
    const r = { ...seg, dash, offset };
    offset += dash;
    return r;
  });

  return (
    <Section title="Student Status" description="Payment standing of all students" variant="card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
        {/* Ring */}
        <div className="relative flex items-center justify-center">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
            <circle cx={CX} cy={CX} r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={12} />
            {rings.map((seg, i) => (
              <circle
                key={i}
                cx={CX} cy={CX} r={R}
                fill="none"
                stroke={seg.color}
                strokeWidth={12}
                strokeDasharray={`${seg.dash} ${CIRC - seg.dash}`}
                strokeDashoffset={-seg.offset}
              />
            ))}
          </svg>
          {/* Center label */}
          <div className="absolute flex flex-col items-center">
            <span className="text-xl font-bold tabular-nums text-foreground">{totalStudents}</span>
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">students</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-col sm:gap-2.5">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold tabular-nums text-foreground">{seg.count}</span>
                  <span className="text-xs text-muted-foreground">
                    ({Math.round((seg.count / totalStudents) * 100)}%)
                  </span>
                </div>
                <p className="text-[11px] font-medium text-muted-foreground">{seg.label}</p>
              </div>
            </div>
          ))}
          {missingDues > 0 && (
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400" />
              <div>
                <span className="text-base font-bold tabular-nums text-foreground">{missingDues}</span>
                <p className="text-[11px] font-medium text-muted-foreground">No dues generated</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
```

Render in `DashboardBelowFold`:

```tsx
<StudentStatusRing
  classSummary={pageData.classSummary}
  totalStudents={kpis.totalStudents}
/>
```

### STEP 10 — Add `QuickJumpLinks` Component (Replaces Removed Lists)

The removed lists left a navigation gap. Replace them with two compact tappable tiles that show live counts and link to the full pages:

```tsx
function QuickJumpLinks({
  kpis,
  classSummary,
}: {
  kpis: DashboardKpis;
  classSummary: DashboardClassSummaryRow[];
}) {
  const overdueStudents = classSummary.reduce((s, r) => s + r.overdueStudents, 0);

  const links = [
    {
      href: "/protected/defaulters",
      icon: <UsersRound className="h-5 w-5 text-red-500" />,
      label: "Defaulters",
      value: overdueStudents,
      unit: "students overdue",
      amount: kpis.overdueAmount,
      tone: "danger" as const,
      accent: "border-red-200 hover:border-red-400",
    },
    {
      href: "/protected/transactions",
      icon: <ReceiptText className="h-5 w-5 text-primary" />,
      label: "Transactions",
      value: kpis.receiptsToday,
      unit: "receipts today",
      amount: kpis.todaysCollection,
      tone: "success" as const,
      accent: "border-primary/20 hover:border-primary/50",
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className={`group flex items-center gap-4 rounded-xl border-2 bg-card p-4 transition-colors ${link.accent}`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            {link.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{link.label}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-bold text-foreground tabular-nums">{link.value}</span>{" "}
              {link.unit}
            </p>
            <Money amount={link.amount} size="xs" tone={link.tone} />
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </a>
      ))}
    </div>
  );
}
```

Render after `StudentStatusRing`:

```tsx
<QuickJumpLinks kpis={kpis} classSummary={pageData.classSummary} />
```

### STEP 11 — Rebuild `DashboardBelowFold` Layout

Replace the body of `DashboardBelowFold` with the following layout. This gives both desktop and mobile optimal presentation — two-column grid on desktop, single column on mobile:

```tsx
async function DashboardBelowFold({
  sessionLabel,
  kpis,
  installments,
}: {
  sessionLabel: string;
  kpis: DashboardKpis;
  installments: DashboardInstallmentSummaryRow[];
}) {
  const pageData = await getDashboardPageData(sessionLabel);

  return (
    <div className="space-y-4 md:space-y-6">

      {/* Alerts — full width */}
      {pageData.alerts.length > 0 && (
        <AlertsPanel alerts={pageData.alerts} />
      )}

      {/* Row 1 — Today + Student Status */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <TodayBreakdown kpis={kpis} paymentModeBreakdown={pageData.paymentModeBreakdown} />
        <StudentStatusRing classSummary={pageData.classSummary} totalStudents={kpis.totalStudents} />
      </div>

      {/* Row 2 — Installment Track — full width */}
      <InstallmentTrack installments={installments} />

      {/* Row 3 — Trend + Leaderboard */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <SVGTrendBarChart trendData={pageData.trendData} />
        <ClassLeaderboard classSummary={pageData.classSummary} />
      </div>

      {/* Row 4 — Class Summary Table (existing) */}
      <ClassSummaryTable classSummary={pageData.classSummary} />

      {/* Row 5 — Quick Jump Links */}
      <QuickJumpLinks kpis={kpis} classSummary={pageData.classSummary} />

    </div>
  );
}
```

### STEP 12 — Rebuild Above-Fold Layout in `DashboardPage`

In the `DashboardPage` server component, update the above-fold section so `CollectionFunnelBar` and `DailyMomentumCard` appear directly below `HeroKpis` and `QuickActions`:

```tsx
{/* Above fold */}
<div className="space-y-4 md:space-y-6">
  <HeroKpis kpis={kpis} />
  <QuickActions role={role} />
  <CollectionFunnelBar
    expected={kpis.totalExpectedFees}
    collected={kpis.totalCollected}
    pending={kpis.totalPending}
    overdue={kpis.overdueAmount}
  />
  <DailyMomentumCard
    todaysCollection={kpis.todaysCollection}
    receiptsToday={kpis.receiptsToday}
    totalPending={kpis.totalPending}
    installments={installments}
  />
</div>

{/* Below fold (Suspense boundary) */}
<Suspense fallback={<LoadingBlock />}>
  <DashboardBelowFold
    sessionLabel={sessionLabel}
    kpis={kpis}
    installments={installments}
  />
</Suspense>
```

### STEP 13 — Lucide Icon Audit

Ensure the import line at the top of `app/protected/dashboard/page.tsx` includes every icon used. The required set after this revamp:

```tsx
import {
  ArrowRight,
  BadgeIndianRupee,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Inbox,
  ReceiptText,
  TrendingUp,
  UsersRound,
  AlertTriangle,
} from "lucide-react";
```

Remove any icons that were only used by the deleted `FollowUpQueue` or `RecentReceipts` components and are no longer referenced elsewhere (e.g. `Phone`, `BadgeIndianRupee` if unused).

---

## Mobile Layout Notes

These components are **server-rendered** (no `"use client"`) and use Tailwind responsive prefixes only. Mobile-specific rules:

- `CollectionFunnelBar` — full width, legend is 3-column grid, works well at 375px
- `DailyMomentumCard` — 2-column grid on mobile (`grid-cols-2`), 4-column on `sm:`
- `TodayBreakdown` — stacks vertically on mobile; `PaymentModeDonut` shows below totals
- `InstallmentTrack` — shows as vertical card list on mobile (`sm:hidden` for horizontal track)
- `SVGTrendBarChart` — SVG with `overflow-x-auto`, minimum width 260px — scrolls horizontally on small screens
- `ClassLeaderboard` — pending column hidden on mobile (`hidden sm:block`), bar+badge visible
- `StudentStatusRing` — ring + stats grid, uses `flex-col → sm:flex-row`
- `QuickJumpLinks` — `grid-cols-1 sm:grid-cols-2` — full width tiles on mobile

---

## What NOT to Do

- Do **not** `npm install` any new package
- Do **not** add any new DB queries or server functions — use existing `getDashboardAboveFoldData` and `getDashboardPageData` only
- Do **not** add `"use client"` to any of the new components — they are pure server components
- Do **not** create new files — all components stay in `app/protected/dashboard/page.tsx`
- Do **not** modify `lib/dashboard/summary.ts` or any data fetchers
- Do **not** remove `HeroKpis`, `QuickActions`, `AlertsPanel`, or `ClassSummaryTable`
- Do **not** leave any TypeScript errors — run `npm run typecheck` before finishing

---

## Verification Checklist

After implementation, confirm:

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `FollowUpQueue` component is gone — no reference to it anywhere
- [ ] `RecentReceipts` component is gone — no reference to it anywhere
- [ ] `CollectionFunnelBar` renders with correct color segments (green/amber/red)
- [ ] `DailyMomentumCard` shows "On Track" / "Behind" based on today's pace
- [ ] `PaymentModeDonut` SVG renders; each mode segment has correct proportional arc
- [ ] `InstallmentTrack` shows horizontal timeline on `sm:` and vertical on mobile
- [ ] `SVGTrendBarChart` renders bars; today's bar is accent-colored
- [ ] `ClassLeaderboard` sorted descending by collection rate; colors green/amber/red
- [ ] `StudentStatusRing` donut segments sum to totalStudents; center label shows total
- [ ] `QuickJumpLinks` two tiles present; both links navigate correctly
- [ ] Desktop: 2-column grid rows render side-by-side at `md:` breakpoint
- [ ] Mobile (375px): all sections stack vertically, no horizontal overflow except trend chart scroll area
- [ ] No console errors in browser
