# Dashboard

Five analytical boards behind a switcher, under a money band that stays put.

| | |
|---|---|
| Route | `/protected/dashboard?view=overview\|collection\|recovery\|classes\|latefee` |
| Components | `src/modules/dashboard/ui/` — `money-band.tsx`, `view-switcher.tsx`, `boards.tsx`, `tiles.tsx` (desk) · `mobile-dashboard-screen.tsx`, `mobile-boards.tsx`, `mobile-board-charts.tsx` (phone) |
| Lib | `src/modules/dashboard/` — `analytics.ts`, `data.ts`, `summary.ts`, `kpi-delta.ts`, `mobile-derived.ts` |
| DB | `get_dashboard_summary`, `get_dashboard_fee_split`, `get_dashboard_analytics` |

## The money band

Four numbers, identical on every board:

**Collected today** (with a delta against the same weekday's average) ·
**Collected this year**, read against the year's target with the rate ·
**Fees pending** · **Late fee pending**

The last two are deliberately adjacent and deliberately separate, with a caption saying so.
Both are money owed; they behave nothing alike; adding them together is what the app used
to do.

## The boards

| Board | What it answers |
|---|---|
| **Overview** | What needs me today — installment progress, where the roll stands, today's payment mix, who is worth a call |
| **Collection** | How collection is going — monthly trend with a run-rate projection, payment mix over time, families paying |
| **Recovery** | How bad the debt is — how old it is, whether it is concentrated in a few families or spread thin, old-balance recovery |
| **Classes** | One ranked list by fees pending, replacing three overlapping surfaces that used to say similar things differently |
| **Late fee** | Charged / waived / still owed, split by who waived it, and what accrues on the next due date |

## The phone

Same five boards, same `?view=`, same `ViewSwitcher` — a dashboard link opens the same board
whichever screen it is tapped on. What differs is the shape: one column of cards
(`mobile-boards.tsx`) instead of a three-up grid of tiles.

Above the switcher the phone home carries what the desk's money band carries — the day's
money on the ink band, then **Pace to year end**, then the three pots and the next action.
Pace is the one figure neither surface stores: `computePaceToYearEnd` sums every installment
already past its due date, a **step function, not a linear ramp**, because money is due on a
stated date and a ramp would put a number on screen the school never agreed to.

Two phone-only rules:

- **The Collection board's daily series comes from `collectionHeatmap`, not
  `collectionTrend`.** The latter is `order by payment_date desc limit 14` — the last 14 days
  that *had a receipt*, not 14 calendar days. The heatmap is keyed by date and omits quiet
  days entirely, so `buildDailySeries` / `buildWeekdayAverages` zero-fill before averaging;
  without that, "average per day" is really "average per day that had a receipt".
- **It says "money taken", never "fees collected".** The series sums `receipts.total_amount`,
  which includes late fee. Rule 8 constrains labels as much as columns.

`?days=14|30` picks the window, resolved by `resolveCollectionWindow`. It is a link like
`?view=`, for the same reason, and only the Collection board carries it.

## Rules

**Boards are `?view=` links, not client tab state.** A board stays linkable, back works, and
it survives with JavaScript off. `scroll={false}` — these are tabs, not page navigations, and
`<Link>`'s default scroll-to-top threw the reader off what they were reading.

**The boards fetch nothing.** `DashboardBelowFold` loads the page data, the analytics and the
EMI summary once and passes them down. `unstable_cache` does not de-duplicate concurrent
callers, so a loader inside a board fires a second Mumbai round trip alongside the first on
every cold cache. `tests/ui/dashboard-mobile-boards.test.tsx` asserts there is exactly one
`getDashboardAnalytics(` call in the route.

**There is no charting library and there cannot be one.** `/protected/dashboard` sits under
a gzip ceiling in `quality/route-bundle-baseline.json`; recharts is roughly 100 KB against
single-digit KB of headroom. Every chart is hand-rolled SVG in `tiles.tsx`, on the
`--chart-1…5` tokens the design system had defined and never used. The whole five-board
rebuild cost +87 gzip bytes.

**A tile is one label, one number, one visual, at most one short footnote.** No
`description` prop in the grid. A titled section with a paragraph under it is exactly what
buried the charts in the previous design.

**Counts are not money.** `StatTile` and `MiniDonut` take `format="count"`. Rendering "19
classes" through `<Money>` produces "₹19" on a screen whose entire job is money — that
shipped once and had to be fixed.

**Every money field in `DashboardAnalytics` is fees-only unless its name says late fee.**
The type's header comment says so; keep it true.

## Caching

`get_dashboard_summary` and `get_dashboard_analytics` are cached with
`cacheSafeUnstableCache`, keyed by `(session, school day)` and tagged `session:{label}` —
the tag `revalidateSessionFinance` already busts after every posting. Once one board has
loaded, switching boards does no database work at all.

Two consequences:

- **Anything that moves money must bust that tag.** Refunds in Finance Controls called
  `revalidatePath` only, which clears rendered routes but not tagged data, so they served
  pre-refund numbers until the next posting happened to clear it.
- **A cached object's shape outlives the deploy that wrote it.** The analytics cache key
  carries a shape version, and `normalizeAnalytics` runs on the way *out* of the cache, not
  only on a fresh fetch. Adding a field without bumping the version means old-shaped entries
  are still being served — that took the whole below-fold area down behind an error boundary
  once.

## Why one query

`get_dashboard_analytics` returns debt age, the late-fee ledger, monthly collection with the
payment mix, class recovery, route recovery and debt concentration in a single round trip.
This is the same lesson `20260726172238` applied to `get_dashboard_summary`, which had been
shipping ~2,100 installment rows from Mumbai to compute seven integers — and getting two of
them wrong on the way. Route recovery was folded in later for the same reason: it was
shipping 507 student rows to produce twenty.

## Tests

`tests/integration/dashboard-summary.test.ts` · `tests/ui/dashboard-boards.test.tsx` ·
`tests/ui/dashboard-waterfall.test.tsx` (asserts auth resolves before any data fetch, and
that the independent fetches stay concurrent) · `tests/ui/dashboard-mobile-boards.test.tsx`
(renders all five phone boards, asserts tokens-only colour and one analytics fetch) ·
`tests/unit/dashboard-mobile-derived.test.ts` (the pace and daily-series arithmetic) ·
`tests/unit/dashboard-view-params.test.ts` (`?view=` and `?days=`).
