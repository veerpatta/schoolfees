# VPPS Fee App — Performance Improvement Playbook

> Audit date: 23 May 2026 · Stack: Next.js 16 App Router + Supabase + Vercel

This document is split into three tiers by effort. Start with **Tier 1** — each fix is a single file change and delivers immediate, measurable speed gains. Work down the tiers as time allows.

---

## What's Already Good (Don't Break It)

Before the problems, a quick inventory of what the codebase is already doing right:

- `Promise.all` parallelises every multi-query fetch in dashboard and payment desk — no sequential waterfalls.
- `cacheSafeUnstableCache` (wrapping Next.js `unstable_cache`) caches expensive Supabase queries across requests.
- Dashboard has an above-fold / below-fold `Suspense` split — KPI cards stream first, heavy tables load after.
- Payment Desk wraps its data loader in `Suspense` with a skeleton — users see the form frame instantly.
- `optimizePackageImports` in `next.config.ts` tree-shakes lucide-react and all radix-ui packages.
- Materialized views migration (`20260523130000`) just landed — `v_workbook_student_financials` and `v_workbook_installment_balances` are now pre-computed tables, not live view queries.
- XLSX is already lazy-imported (`await import('xlsx')`) in the exports route.
- Optimistic UI is used for the session pill and the today-collection counter in Payment Desk.

---

## Tier 1 — Quick Wins (each < 2 hours)

### 1. Nuclear Cache Invalidation is Killing Tab-Switch Speed

**File:** `lib/system-sync/finance-revalidation.ts`

**Problem:** `revalidateCoreFinancePaths` calls `revalidatePath` on 14 routes after every payment post, fee-setup change, or import. This means the first person to open *any* of those 14 tabs after a payment pays the full cold-render cost — every one of them has to re-query Supabase from scratch.

```ts
// Current — blasts 14 paths on every payment
const CORE_FINANCE_PATHS = [
  "/protected",
  "/protected/dashboard",
  "/protected/students",       // ← not touched by a payment
  "/protected/payments",
  "/protected/collections",
  "/protected/transactions",
  "/protected/receipts",
  "/protected/defaulters",
  "/protected/reports",
  "/protected/ledger",
  "/protected/fee-setup",       // ← definitely not touched by a payment
  "/protected/fee-setup/generate",
  "/protected/imports",         // ← not touched by a payment
  "/protected/dues",
];
```

**Fix:** Split into two functions — one narrow (payments only), one wide (fee-setup changes only). Call only what the action actually changed.

```ts
// lib/system-sync/finance-revalidation.ts

// After posting a single payment — only these pages change
const PAYMENT_AFFECTED_PATHS = [
  "/protected/dashboard",
  "/protected/transactions",
  "/protected/receipts",
  "/protected/defaulters",
] as const;

// After a fee-setup publish or student import — broader invalidation
const FULL_FINANCE_PATHS = [
  "/protected/dashboard",
  "/protected/students",
  "/protected/transactions",
  "/protected/receipts",
  "/protected/defaulters",
  "/protected/dues",
  "/protected/ledger",
] as const;

export function revalidateAfterPaymentPosting(studentIds: readonly string[] = []) {
  for (const path of PAYMENT_AFFECTED_PATHS) {
    revalidatePath(path);
  }
  for (const studentId of new Set(studentIds.filter(Boolean))) {
    revalidatePath(`/protected/students/${studentId}`);
    revalidatePath(`/protected/students/${studentId}/statement`);
    revalidateTag(`student:${studentId}`);
  }
}

export function revalidateCoreFinancePaths(studentIds: readonly string[] = []) {
  for (const path of FULL_FINANCE_PATHS) {
    revalidatePath(path);
  }
  for (const studentId of new Set(studentIds.filter(Boolean))) {
    revalidatePath(`/protected/students/${studentId}`);
    revalidatePath(`/protected/students/${studentId}/statement`);
    revalidateTag(`student:${studentId}`);
  }
}
```

**Impact:** After a payment, only 4 paths lose cache instead of 14. Students, Fee Setup, Imports, and Exports tabs remain fully cached — opening them after a payment is instant.

---

### 2. Fix XLSX Static Import in Parser and Templates

**Files:** `lib/import/parser.ts`, `lib/import/templates.ts`

**Problem:** Both files have `import * as XLSX from "xlsx"` at the top. xlsx is a ~700 KB library. Even though these are server-only files, they are included in the server bundle for every route that transitively imports them. The imports page is the only place this is needed.

```ts
// Current — runs at module load time for any server that touches this file
import * as XLSX from "xlsx";
```

**Fix:** Dynamic import inside the function body.

```ts
// lib/import/parser.ts — only at the top
// Remove: import * as XLSX from "xlsx";

export async function parseImportFile(/* ... */) {
  const XLSX = await import("xlsx");   // ← lazy, bundled separately
  // rest of function unchanged
}
```

Same pattern in `lib/import/templates.ts`. This moves xlsx out of the main server chunk into a lazy chunk loaded only when parsing/generating import files.

---

### 3. Add Explicit `revalidate` TTLs to Dashboard Queries

**File:** `lib/dashboard/data.ts`

**Problem:** Several `cacheSafeUnstableCache` calls have no `revalidate` option, which means they cache **indefinitely** until a tag is invalidated. If a tag invalidation is missed for any reason (e.g., a bug in revalidation logic, a direct DB change from scripts, a bootstrap run), the dashboard shows stale data forever.

```ts
// Current — no TTL on financials or installments
return cacheSafeUnstableCache(
  async () => getWorkbookStudentFinancials({ sessionLabel, activeOnly: true }),
  ["dashboard-financials-active", sessionLabel],
  { tags: [sessionTag(sessionLabel)] },   // ← no revalidate
)();
```

**Fix:** Add a safety-net TTL so data never goes stale beyond a reasonable window, even if tag invalidation is missed.

```ts
return cacheSafeUnstableCache(
  async () => getWorkbookStudentFinancials({ sessionLabel, activeOnly: true }),
  ["dashboard-financials-active", sessionLabel],
  {
    tags: [sessionTag(sessionLabel)],
    revalidate: 300, // 5 minutes safety net — tag invalidation is still the fast path
  },
)();
```

Recommended TTLs:
- `dashboard-financials-active` → `300` (5 min)
- `dashboard-installments` → `300` (5 min)
- `dashboard-sync-health` → already has `120` ✓
- `dashboard-raw-student-count` → already has `120` ✓

---

### 4. Add `prefetch={true}` to Sidebar Navigation Links

**File:** `components/admin/sidebar-nav.tsx` (or wherever `SidebarNav` renders its links)

**Problem:** Next.js App Router prefetches `<Link>` targets on *hover* in production. Staff use keyboard and muscle memory — they click directly without hovering first, so no prefetch fires before navigation. Switching from Dashboard to Payment Desk feels slow because the RSC payload fetch starts only after the click.

**Fix:** Eagerly prefetch the three highest-traffic links on mount.

```tsx
// In SidebarNav or wherever the nav items are rendered
import Link from "next/link";

// For the most-used routes, add prefetch={true}
<Link href="/protected/payments" prefetch={true}>
  Payment Desk
</Link>
<Link href="/protected/dashboard" prefetch={true}>
  Dashboard
</Link>
<Link href="/protected/students" prefetch={true}>
  Students
</Link>
```

**Impact:** The RSC payload for Payment Desk, Dashboard, and Students is fetched and cached in the browser as soon as the sidebar mounts. Clicking any of these tabs feels near-instant because the data is already in the browser's RSC cache.

Don't add `prefetch={true}` to every link — Exports, Admin Tools, and Fee Setup are infrequent enough that on-hover prefetch is fine.

---

### 5. Remove Sequential `await` in Payment Desk Data Chain

**File:** `lib/payments/data.ts`

**Problem:** Scanning the data file, several internal fetches use sequential `await` where the calls are independent:

```ts
// Pattern found in data.ts — sequential reads that could be parallel
const hasActiveClass = await getPaymentDeskHasActiveClass(payload.sessionLabel);
// ... then later ...
const policy = await getFeePolicyForSession(payload.sessionLabel);
```

If these two calls don't depend on each other's results, they should run in parallel.

**Fix:** Audit every place in `lib/payments/data.ts` where two or more `await` calls appear back-to-back with no dependency between them, and wrap them in `Promise.all`.

```ts
const [hasActiveClass, policy] = await Promise.all([
  getPaymentDeskHasActiveClass(payload.sessionLabel),
  getFeePolicyForSession(payload.sessionLabel),
]);
```

Even if each call only takes 50ms, eliminating 3 sequential waits saves 150ms off the Payment Desk load time.

---

## Tier 2 — Architecture Wins (each 1–3 days)

### 6. Replace Full-Row Dashboard Fetch with a KPI Aggregation RPC

**File:** `lib/dashboard/data.ts` + new Supabase migration

**Problem:** `loadDashboardFinancialRows` fetches **every student's financial row** for the session from `v_workbook_student_financials` and then computes KPIs (total collected, total pending, paid count, overdue count, etc.) in JavaScript. With 400–500 students, this transfers thousands of rows over the Supabase wire just to produce ~10 numbers.

**Fix:** Create a lightweight Postgres function that returns the aggregated KPIs directly.

```sql
-- supabase/migrations/[timestamp]_dashboard_kpi_rpc.sql
create or replace function get_dashboard_kpis(p_session_label text)
returns json
language sql stable security definer
as $$
  select json_build_object(
    'total_students',       count(*),
    'total_due',            sum(total_due),
    'total_collected',      sum(total_paid),
    'total_pending',        sum(outstanding_amount),
    'paid_count',           count(*) filter (where status_label = 'PAID'),
    'overdue_count',        count(*) filter (where overdue_installment_count > 0),
    'not_started_count',    count(*) filter (where status_label = 'NOT STARTED'),
    'partly_paid_count',    count(*) filter (where status_label = 'PARTLY PAID')
  )
  from v_workbook_student_financials
  where session_label = p_session_label
    and record_status = 'active';
$$;
```

Then in `lib/dashboard/data.ts`, call this RPC for the KPI card numbers instead of loading all rows. Only fetch the full row list for things that genuinely need student-level data (follow-up queue, class breakdown table).

**Impact:** Dashboard KPI cards load from a single aggregate query returning ~200 bytes instead of fetching 400+ rows. Cold-start dashboard load time drops significantly.

---

### 7. Add `React.cache()` for Request-Level Deduplication

**File:** `lib/fees/policy.ts`, `lib/supabase/session.ts`

**Problem:** `getFeePolicySummary()` and `requireAuthenticatedStaff()` are called in multiple places during a single request (layout + page + data functions). `unstable_cache` deduplicates across requests, but within a single server-render request, if the same function is called 3 times, it hits the cache 3 times (cheap but not free — cache lookup + deserialization still happens).

**Fix:** Wrap with `React.cache()` for true per-request memoization (zero cost on the second call within the same render).

```ts
// lib/fees/policy.ts
import { cache } from "react";
import { unstable_cache } from "next/cache";

// React.cache() deduplicates within a single render pass
export const getFeePolicySummary = cache(async () => {
  // existing implementation
});
```

```ts
// lib/supabase/session.ts
import { cache } from "react";

export const requireAuthenticatedStaff = cache(async () => {
  // existing implementation
});
```

`React.cache()` is request-scoped and garbage-collected after the response is sent — zero memory leaks.

---

### 8. Split the 1117-Line `transactions-client-shell.tsx`

**File:** `components/transactions/transactions-client-shell.tsx`

**Problem:** This is a 1117-line client component. The entire file — including all its imports — is included in the client JS bundle for the Transactions page. Views like the installment breakdown table or the export panel are not visible on initial load but their code is still parsed and executed.

**Fix:** Lazy-load the heavy sub-panels.

```tsx
// components/transactions/transactions-client-shell.tsx
import dynamic from "next/dynamic";

const InstallmentBreakdownView = dynamic(
  () => import("./installment-breakdown-view"),
  { loading: () => <TableSkeleton />, ssr: false }
);

const ExportPanel = dynamic(
  () => import("./export-panel"),
  { loading: () => null, ssr: false }
);
```

Split the component along view boundaries (the tab/view switcher already exists in the code). Each view becomes its own file and is only downloaded when the user switches to that tab.

---

### 9. Client-Side Student Search in Payment Desk

**File:** `components/payments/payment-desk-mobile.tsx`

**Problem:** Selecting a student in the Payment Desk currently changes the URL (`?studentId=...`) and triggers a full server-side re-render of the page. The whole page re-renders just to show one student's dues, even though the student list, class options, and policy data are already in the browser.

**Fix:** Move student selection to a client-side state update. Fetch the student's dues via a dedicated API route (the `/protected/payments/student-summary/route.ts` already exists for this) using `fetch()` in the client component instead of navigating.

```tsx
// In payment-desk-mobile.tsx
async function handleStudentSelect(studentId: string) {
  setLoadingStudent(true);
  const res = await fetch(`/protected/payments/student-summary?studentId=${studentId}`);
  const data = await res.json();
  setSelectedStudent(data);
  setLoadingStudent(false);
  // Update URL without navigation (no re-render)
  window.history.replaceState({}, '', `?studentId=${studentId}`);
}
```

**Impact:** Student selection goes from ~800ms (full SSR round-trip) to ~200ms (single JSON API call). The Payment Desk form remains mounted — no flash, no skeleton.

---

### 10. Preload Data for the Next Likely Tab

**File:** `components/admin/dashboard-shell.tsx`

**Problem:** Staff workflow is predictable. Accountants almost always go: Dashboard → Payment Desk → Dashboard. Reading staff at Dashboard → Defaulters → Dashboard. The app can use this to preload data in the background.

**Fix:** After the dashboard above-fold renders, fire a background prefetch for Payment Desk data.

```tsx
// In dashboard page or a client component mounted on dashboard
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function DashboardPrefetcher() {
  const router = useRouter();
  useEffect(() => {
    // Prefetch the most common next destination based on role
    router.prefetch("/protected/payments");
    router.prefetch("/protected/defaulters");
  }, [router]);
  return null;
}
```

Mount this lightweight client component inside the dashboard page. Zero cost to the user — just queues background RSC fetches.

---

## Tier 3 — Database-Level (each 1+ week, coordinate with Supabase)

### 11. Auto-Refresh Materialized Views on Data Change

**Problem:** The materialized view migration (`20260523130000`) was a great call. But materialized views in Postgres don't update automatically — they only refresh when `REFRESH MATERIALIZED VIEW` is called. Currently, data changes (new payments, student updates) don't refresh the views until the next full rebuild. This means the views can serve stale data between refreshes.

**Fix:** Add statement-level triggers that queue a refresh after DML on the source tables. Since `REFRESH MATERIALIZED VIEW CONCURRENTLY` can't run inside a trigger, use a lightweight notify+worker pattern:

```sql
-- Trigger to notify a background worker to refresh
create or replace function notify_workbook_refresh()
returns trigger language plpgsql as $$
begin
  perform pg_notify('workbook_refresh', '{}');
  return null;
end;
$$;

create trigger trg_notify_refresh_on_payment
after insert or update on public.payments
for each statement execute function notify_workbook_refresh();
```

Then use a Supabase Edge Function or a pg_cron job to do:
```sql
-- pg_cron job every 2 minutes
select cron.schedule('refresh-workbook-views', '*/2 * * * *', $$
  refresh materialized view concurrently public.v_workbook_student_financials;
  refresh materialized view concurrently public.v_workbook_installment_balances;
$$);
```

**Impact:** After a payment is posted, the materialized view data is fresh within 2 minutes. Dashboard loads always hit the pre-computed view, never the live computation.

---

### 12. Add a Covering Index on the Most-Hit Dashboard Query

**Problem:** The dashboard fetches from `v_workbook_student_financials` filtered by `session_label` and `record_status = 'active'`. Even with the materialized view, a full-table scan happens if there's no index on the view's underlying storage.

**Fix:**
```sql
-- After creating the materialized view
create index idx_v_workbook_financials_session_status
  on public.v_workbook_student_financials (session_label, record_status);

create index idx_v_workbook_installments_session
  on public.v_workbook_installment_balances (session_label);
```

These let Postgres use index-only scans for the dashboard query instead of scanning all rows.

---

### 13. Paginate Defaulters and Transactions Server-Side

**Files:** `lib/defaulters/data.ts`, `lib/transactions/dues.ts`

**Problem:** Both defaulters and transactions load all matching rows and return them to the client for display. With 300+ defaulters or 1000+ transactions, this creates large server responses and slow initial renders.

**Fix:** Add `limit` + `offset` parameters to both queries and implement cursor-based pagination in the UI. The Students page already does this correctly — apply the same pattern to Defaulters and Transactions.

```ts
// lib/defaulters/data.ts
const { data, count } = await supabase
  .from("v_workbook_student_financials")
  .select("...", { count: "exact" })
  .eq("session_label", sessionLabel)
  .gt("outstanding_amount", minAmount)
  .range(pageOffset, pageOffset + PAGE_SIZE - 1)   // ← server-side page
  .order("outstanding_amount", { ascending: false });
```

---

## Quick Reference: What to Build First

| # | Change | File(s) | Time | Impact |
|---|--------|---------|------|--------|
| 1 | Slim `revalidateCoreFinancePaths` | `finance-revalidation.ts` | 30 min | Tab switching stays fast after payments |
| 2 | Lazy XLSX in parser/templates | `import/parser.ts`, `import/templates.ts` | 30 min | Smaller server bundle |
| 3 | Add `revalidate` TTLs to dashboard cache | `dashboard/data.ts` | 20 min | Prevents infinite stale cache |
| 4 | `prefetch={true}` on top nav links | `sidebar-nav.tsx` | 20 min | Instant tab switching feel |
| 5 | Parallelise sequential `await` in payment data | `payments/data.ts` | 1 hr | –150ms Payment Desk load |
| 6 | Dashboard KPI aggregation RPC | New migration + `dashboard/data.ts` | 2 days | Dashboard cold start 2–5× faster |
| 7 | `React.cache()` on policy + session | `fees/policy.ts`, `supabase/session.ts` | 1 hr | Eliminates redundant cache hits per request |
| 8 | Split `transactions-client-shell.tsx` | New component files | 1 day | Smaller Transactions JS bundle |
| 9 | Client-side student select in Payment Desk | `payment-desk-mobile.tsx` | 2 days | Student load: 800ms → 200ms |
| 10 | Prefetch next tab on Dashboard mount | `dashboard/page.tsx` | 30 min | Zero-cost background prefetch |
| 11 | pg_cron refresh of materialized views | New migration | 1 day | Always-fresh view data |
| 12 | Covering indexes on materialized views | New migration | 30 min | Faster view scans |
| 13 | Paginate Defaulters + Transactions | Data files + UI | 2 days | Large-dataset page loads |

---

## How to Measure

Before making changes, establish a baseline so you know what actually moved:

```bash
# 1. Use Next.js built-in timing — already in the codebase!
#    dashboard/data.ts already logs: [dashboard-above-fold] loaded in Xms
#    Add similar logs to payments/data.ts and defaulters/data.ts

# 2. Check Supabase query times in the Supabase Dashboard → 
#    Database → Query Performance

# 3. Run Lighthouse on the deployed Vercel URL:
#    - Performance score
#    - LCP (Largest Contentful Paint) — target < 2.5s
#    - FID / INP — target < 200ms

# 4. In Chrome DevTools → Network tab → filter "fetch" —
#    watch the RSC payload size when switching tabs.
#    Target: < 50KB per navigation RSC payload.
```

The existing `console.log('[dashboard-above-fold] loaded in ${Date.now() - _t0}ms')` in `lib/dashboard/data.ts` is already a solid timing hook — add the same pattern to `getPaymentEntryPageData` and `getDefaultersPageData` to get a clear before/after baseline.
