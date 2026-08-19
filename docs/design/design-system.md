# Design system & UX rationale

This document is the source of truth for the **Ledger Calm** visual system used
across the Veer Patta Fees admin app, plus the per-screen UX decisions made
during the redesign. Read this before adding new screens or revisiting existing
ones so the bar stays where it is.

---

## 1. Design language at a glance

| Property | Value |
|---|---|
| Mood | Trustworthy, calm, accountancy-credible — *not* generic SaaS |
| Surface | Warm off-white paper (`--background`), white cards |
| Primary | Deep ink near-black (`--primary`) — solid CTAs, navigation |
| Accent | Saffron `#C2410C` (`--accent`) — used <5% of the surface |
| Type | Inter (UI), Source Serif 4 (brand mark only) |
| Numerals | `font-variant-numeric: tabular-nums` body-wide |
| Density | 8pt grid, 20pt default card padding |
| Radius | 4 values only: `sm 8` · `md 10` · `lg 12` · `xl 16` |
| Shadows | Border at rest, soft shadow on hover/elevated, deeper on modals |
| Animation | 4 canonical keyframes: `fade-in · slide-up · scale-in · shimmer-x` |

All visual values flow from `app/globals.css` (HSL tokens) and
`tailwind.config.ts` (semantic color names). Pages **must** consume the
semantic names — never raw Tailwind hues. The migration scripts in
`scripts/_archive/design-tokens-migration/` prove this was enforceable — they are
archived now that the migration is done.

Phase E adds a formal token registry in `lib/design/office-tokens.ts`. The
registry maps office-friendly token names to the CSS variables in
`app/globals.css`, and quality tests verify that each registered variable exists
before visual work is treated as complete.

---

## 2. Component reference (when to use what)

### Surfaces
- `<Card>` — atomic bordered surface. `flat` (default), `raised` for elevated
  panels, `ghost` for borderless blocks. Use `interactive` only when wrapping
  a `<Link>`.
- `<Section>` — card-with-header. Used for every titled block on a page.
  Replaces the legacy `SectionCard` (which now delegates to `<Section>`).
- `<KpiCard>` — single hero metric. `label` + `value` + optional `hint` and
  `accent` left rule.

### Inputs
- `<Input>` — single-line text input. Default 36px desktop / 44px mobile.
  `aria-invalid="true"` switches to destructive border + ring.
- `<Textarea>` — same visual recipe as Input, auto-grows.
- `<Label>` — supports `required` and inline `hint`.
- `<Checkbox>` — token-driven, supports indeterminate state.
- `<Select>` — use the Radix Select or a native `<select>` styled with
  `border-input bg-surface rounded-md`. Either is fine; pick the right tool
  for the situation.

### Actions
- `<Button variant="primary">` — most save / confirm actions.
- `<Button variant="accent">` — *one per screen*, the hero CTA (saffron).
- `<Button variant="outline">` — most secondary actions.
- `<Button variant="soft">` — tonal accent surface, for mid-importance actions.
- `<Button variant="ghost">` — toolbars, compact secondary actions.
- `<Button variant="destructive">` — destructive primary action.
- All buttons support `loading={true}` + `loadingText` for pending states.
- Sizes: `sm 32` · `default 36` · `lg 40` · `mobile 44`. The `default`
  size auto-jumps to 44px on `max-md:`.

### Feedback
- `<Notice tone="info|success|warning|danger|neutral">` — inline alert with
  icon + title + body + optional action.
- `<Badge variant="…" dot>` — pill with semantic tonal background, optional
  colored dot. Status uses the dot+label pattern.
- `<StatusBadge tone="good|warning|neutral|accent|danger|info">` — convenience
  wrapper over Badge.

### Data
- `<Money value={…} size="…" tone="…">` — every currency cell. Tabular-nums.
  Auto-colors negatives as destructive when `tone="auto"`.
- `<CountUp value={…}>` — animated number transition. *Use sparingly* on hero
  KPIs only; not on every Money cell. Respects `prefers-reduced-motion`.

### Empty & loading
- `<EmptyState>` — single icon, single headline, single CTA.
- `<Skeleton>` — atomic translate-x shimmer block.
- `<LoadingBlock>` — page-level skeleton card.
- `<LoadingTableRows>` — for table fallbacks.
- `<LoadingProgress>` — thin indeterminate top bar (used inside a section).

### Navigation
- `<RouteProgress>` — global thin top progress bar fired on every URL change.
  Mounted once at the top of `<DashboardShell>`.

### Overlays
- `<Sheet>` — lightweight bottom drawer (or right drawer with `side="right"`).
  Use for mobile sheets like the Payment Mode picker.
- `<DropdownMenu>` — Radix dropdown for menus, e.g. the avatar menu in the topbar.

---

## 3. Per-screen UX rationale

For each significant screen, decisions were made against four questions:

1. **Main job** — what's the user actually here for?
2. **Notice first** — what should hit the eye in 0.3s?
3. **Secondary** — supporting context that should be visible but quieter.
4. **Hide / collapse / simplify** — what was buried by the previous design
   and what gets buried by the new one.

### 3.1 Dashboard (`/protected/dashboard`)

- **Main job:** "What needs me today?" + "How is collection going?"
- **Notice first:** The money band — one ink surface carrying four numbers that
  are true on every board: Collected today · Collected this year (against the
  year's target, with the rate) · Fees pending · Late fee pending. The last two
  are deliberately adjacent and deliberately separate, with a caption saying so.
- **Secondary:** A switcher picking one of **five boards**, each a grid of tiles:
  Overview · Collection · Recovery · Classes · Late fee.
- **Hidden:** Nothing is hidden. What went away is repetition — the previous
  design stacked fourteen full-width sections, each with a title *and* a
  paragraph, and three of them restated the same KPIs. `HeroKpis`,
  `DesktopSecondaryKpis`, `CollectionFunnelBar`, `OldBalanceRecoveryCard` and
  `InstallmentPulse` were deleted outright.

**Rules the rebuild had to obey, and any change here still does:**

- **Boards are `?view=` links, not client tab state.** A board stays linkable,
  back works, and it costs no bundle. `scroll={false}` — these are tabs, not page
  navigations, and the default scroll-to-top threw the reader off what they were
  reading.
- **No charting library.** `/protected/dashboard` sits under a gzip ceiling in
  `quality/route-bundle-baseline.json` with single-digit KB of headroom; recharts
  is ~100 KB. Every chart is hand-rolled SVG in `components/dashboard/tiles.tsx`
  on the `--chart-1…5` tokens, which had been defined and unused since the token
  migration.
- **A tile is one label, one number, one visual, at most one short footnote.**
  No `description` prop in the grid — a titled section with a paragraph under it
  is what buried the charts last time.
- **Counts are not money.** `StatTile` and `MiniDonut` take `format="count"`;
  rendering "19 classes" through `<Money>` produced "₹19" on a screen whose whole
  job is money.
- The board area keeps a height floor so switching cannot collapse the page and
  push it back down when the next board streams in.

Detail: `docs/modules/dashboard.md`.

### 3.2 Payment Desk (`/protected/payments`)

- **Main job:** Select a student → review dues → collect payment → print receipt.
- **Notice first:** The student picker + the selected student's dues summary.
  Everything else is a supporting workflow.
- **Secondary:** Amount entry, payment mode selection, allocation preview.
- **Hidden:** Diagnostic details collapsed under a `<details>` *for admins
  only*. Tab "selected" state now uses a calm ink fill (no more black slab on
  every page).
- **Deferred (see §5):** Splitting the (now 3,515-line, budget 3,520) client into composable
  pieces — high reward but high risk for an append-only financial flow. To be
  tackled as a focused follow-up with regression tests in place.

### 3.3 Students list (`/protected/students`)

- **Main job:** Find a student fast. Either by name, admission number, or class.
- **Notice first:** Class tabs + search input.
- **Secondary:** A compact table with admission no, class, route, status. Row
  hover shows tinted background; click navigates to the student detail.
- **Hidden:** Bulk import is one button in the page header, not a giant card
  on the page.

### 3.4 Student detail (`/protected/students/[id]`)

- **Main job:** Find a receipt and confirm what was paid. Not "see one
  student's full picture" — that framing is what produced a 2,150px page with
  ~40 money figures above the tabs and receipts 1,100px down.
- **Notice first:** A one-row identity bar (name, class, SR, status) carrying
  the *single* primary action, "Collect ₹X"; then the money band — one status
  ribbon and exactly four figures: Outstanding, Paid this session, Session fee,
  Last receipt.
- **Secondary:** Four tabs, **Receipts first and default** (receipts and their
  allocation lines together), then Dues, Fees & plan, Record.
- **Hidden:** Conventional-discount and exception editing stay on the edit page.
  Family, sharing and record history live in the Record tab.

**Rules this page is held to.** Every money figure has exactly one canonical
home — if a number appears twice under the same label, one of them is wrong.
Figures come off the workbook projection (`v_workbook_installment_balances`),
never the policy resolver or `ledger.totalPayments`, so `Paid + Outstanding =
Total` holds. The status ribbon renders exactly one state. There is no side
rail: it was taller than the content beside it, so it set the page length.

### 3.4a Student edit (`/protected/students/[id]/edit`)

- **Main job:** Correct one field and save.
- **Notice first:** Any blocking problem, as a `<Notice>` above the form.
- **Secondary:** Five visible `<Section>` groups — Student, Parent details and
  address, Conventional discounts, Fee exceptions, Record status.
- **Hidden:** Nothing. **No `<details>` on this page**, enforced by
  `tests/ui/interaction/student-form-nothing-collapsed.test.tsx`.

Collapsing was tried and cost real money: 19 of 27 controls sat behind three
closed disclosures, one holding the fee overrides. A student was charged
₹14,000 for transport the route picker said they did not have, and the error
summary's `#fieldName` anchors could point into a hidden panel. Twenty-seven
controls is not too many for a desk screen; twenty-seven controls with eight
visible is the defect.

### 3.5 Defaulters (`/protected/defaulters`)

- **Main job:** Daily phone-call follow-up.
- **Notice first:** Filter bar — class, route, overdue window — and a count
  of who's in view.
- **Secondary:** A scannable list with name, class, parent phone, outstanding
  amount, and "Copy reminder" + "Call" + "Open student" actions per row.
- **Hidden:** Detailed financial breakdown moves to the student detail page
  — defaulters is for triage, not analysis.

### 3.6 Transactions (`/protected/transactions`)

- **Main job:** Look up a receipt or scan recent activity. Read-only.
- **Notice first:** Date range + search.
- **Secondary:** A receipt list with tabular numerals, payment mode, student.
- **Hidden:** Adjustment/correction flow lives under Finance Controls — this
  screen is intentionally read-only. The page header carries that label.

### 3.7 Receipts (`/protected/receipts/[id]`)

- **Main job:** Confirm, reprint, or share a posted receipt.
- **Notice first:** Receipt number + amount + student name in a single block.
- **Secondary:** Reprint button (saffron primary), all the receipt fields
  laid out for screen and print.
- **Hidden:** The historical rainbow gradient strip at the top of the print
  document is replaced with a single ink rule — premium, low-noise.

### 3.8 Fee Setup (`/protected/fee-setup`)

- **Main job:** Configure or publish the yearly fee policy.
- **Notice first:** A progress strip showing where you are in the editor.
- **Secondary:** Each fee head as its own collapsible block. Values use
  `<ValueStatePill>` tones (editable / calculated / locked / policy / review)
  so the staff member instantly knows what can be touched.
- **Hidden:** The compute-impact preview is shown *before* publish, never
  silently applied to paid/partial rows (project safety rule).

### 3.9 Imports (`/protected/imports`)

- **Main job:** Upload a spreadsheet → review what's valid → commit safe rows.
- **Notice first:** Upload card + the most recent batch.
- **Secondary:** Anomaly queue, row-by-row review, column mapping.
- **Hidden:** The full batch list collapses to a scannable table; row
  detail opens in a card next to the table, not as a giant inline expansion.

### 3.10 Admin Tools (`/protected/admin-tools`)

- **Main job:** Rare admin actions — staff, settings, lists, day close,
  troubleshooting.
- **Notice first:** Section cards each owning a discrete capability.
- **Secondary:** Fee Data Troubleshooting is anchored deep-linkable from the
  dashboard's "Open Fee Data Troubleshooting" button.
- **Hidden:** None — this is the hub for low-frequency-but-important tasks,
  so nothing collapses by default.

### 3.11 Exports (`/protected/exports`)

- **Main job:** Download an Excel file for office paperwork.
- **Notice first:** A clean card per export type with the label and a single
  "Download" CTA.
- **Secondary:** Filter inputs above each card where applicable.
- **Hidden:** No multi-step wizards — one card = one file = one click.

---

## 4. Motion grammar

| Trigger | Animation | Duration | Easing |
|---|---|---|---|
| Page mount | `anim-fade-in` on the shell content wrapper | 180ms | `out-expo` |
| Sheet open | `anim-slide-up` | 220ms | `out-expo` |
| Toast exit | `anim-toast-out` (fade + 8px drop) | 180ms | `out-expo` |
| Skeleton | `anim-shimmer` translate-x gradient | 1500ms | linear cycle |
| Route progress | top hairline bar fades in/out | 380ms window | linear |
| KPI mount | `<CountUp>` ease-out cubic | 600ms | ease-out cubic |
| Hover (clickable surface) | color + border 150ms | 150ms | `ease-out` |
| Button active | `translate-y-[0.5px]` | instant | — |

**`prefers-reduced-motion: reduce`** silences every animation including the
legacy aliases.

---

## 5. Documented follow-ups (Phase 6 items deferred)

These were considered, scoped, and not shipped in this redesign — either
because the risk-to-reward ratio didn't justify pulling them into the same
diff, or because they need an independent design pass.

### 5.1 Split the Payment Desk client (high reward, medium risk)

`components/payments/payment-desk-mobile.tsx` remains the current large Payment
Desk state owner. Phase B started the split by routing `payment-entry-client.tsx`
through a single client instance, extracting cache helpers, and moving reusable
desktop layout framing into `components/payments/payment-desk/payment-desk-layout.tsx`.
The next split should continue separating shared cashier state from mobile and
desktop layout pieces. Suggested split:

- `<StudentPicker>` — class filter, search, recent-students list, virtualized
  combobox.
- `<StudentDuesBreakdown>` — installment table, credit/refund state.
- `<AmountForm>` — amount input, quick amounts, mode picker, received-by, notes.
- `<ConfirmSheet>` — confirmation summary + success / duplicate / error sheets.
- `<ReceiptPreview>` — latest-receipt panel + print/share links.

Each split should be covered by the existing integration tests in
`tests/integration/payment-desk-workflow.test.ts` before any state moves.

### 5.2 Dark mode

Tokens are already dark-ready (`darkMode: ["class"]` is configured, all
semantic names route through `--*` variables). A `:root.dark { … }` block can
be added in one pass once design has signed off on the dark palette.
Suggested starting points:

- `--background 222 25% 6%`
- `--surface 222 24% 9%`
- `--surface-2 222 22% 12%`
- `--foreground 48 24% 95%`
- `--border 222 14% 18%`
- accent stays `20 86% 41%` (saffron reads as warm and clear on ink)
- Verify focus-ring contrast — may need `--ring 20 86% 55%` in dark mode.

### 5.3 Optimistic UI

Deliberately not added. Posting a payment is append-only and financially
binding; optimistically rendering "success" before the server confirms would
risk false confirmations. The current pattern (server action with `useActionState`
+ skeleton + success sheet on confirmation) is the correct trade-off for a
finance app. Optimistic UI is appropriate for non-financial mutations
(student edits, fee setup drafts, follow-up notes) — apply it there if
needed.

### 5.4 Top progress bar — done

`<RouteProgress>` is now driven by `useLinkStatus` through `<NavLink>`, which
broadcasts a `vpps-nav` window event (the same transport `toast.tsx` uses).

It used to key off `usePathname()` + `useSearchParams()`, which only change
*after* a navigation commits, then hide on a fixed 380ms timer — so a slow
route showed nothing during the wait and flashed a bar once the page was
already visible. Backwards.

Tunings, each fixing a specific artefact:

- **120ms show delay** — an instant navigation must never flash.
- **300ms minimum visible** — a 140ms navigation must never strobe.
- **15s backstop** — a link unmounting mid-navigation must not pin the bar on.

The pathname effect is deliberately **kept** as the hide trigger and as the
fallback for navigations that never touch a `NavLink` (`router.push`, form
redirects, `router.refresh`), so a regression degrades to the old behaviour
rather than to nothing.

Applied to the sidebar and phone bottom nav only — each `NavLink` costs a
client component, and the fallback covers the rest.

**Limitation:** `useLinkStatus` reports pending only for navigations that
actually reach the server. See §5.6 for why that is currently *all* of them.

### 5.6 `force-dynamic` in the root layout — investigated, leave it alone

`app/layout.tsx` sets `export const dynamic = "force-dynamic"`. It looks like
the single biggest cause of slow navigation — it appears to force a server
round trip for every route change and defeat the Router Cache. **It is not, and
removing it would change nothing.** Recorded here so this is not re-litigated.

Every `/protected` route is *already* dynamic for two independent reasons, both
load-bearing:

| Cause | Where | Why it cannot move |
|---|---|---|
| `cookies()` for locale | `i18n/request.ts:24`, awaited by the root layout via `getLocale()` | `isLocaleSwitcherEnabled()` defaults to **true**, so the cookie is read on every request |
| `cookies()` for auth | `lib/supabase/server.ts:9`, via `requireAuthenticatedStaff()` in `app/protected/layout.tsx:18` | Session and RBAC are read per request; this is the security boundary |

Reading `cookies()` opts a route into dynamic rendering on its own. So the
directive is not what makes the app dynamic — the cookie reads are, and neither
can be pushed down without giving up per-request locale or per-request auth.

The directive also has a separate, deliberate job: its comment and
`tests/integration/vercel-deployment-config.test.ts:16` record that it keeps
Vercel's Next 16 adapter consistently emitting lambdas for every App Router
page, which the deployment guards depend on.

**Conclusion: not a performance lever. Do not remove it.** If navigation feels
slow, the cost is in per-route data fetching, not in this directive — measure
the route's own queries instead.

### 5.9 The two levers §5.6 left on the table

§5.6 asked whether `force-dynamic` makes navigation slow and answered no. It did
not ask the next question: given that every navigation *is* a server render,
what stops us paying for the same one twice, and what has to finish before
anything appears on screen. Both had an answer, and neither touches the
directive.

**The client Router Cache was off.** Next ships `experimental.staleTimes.dynamic`
at `0`, which means a page you were looking at ten seconds ago is refetched in
full when you come back to it — auth, users lookup, fee policy, shell pulse,
page data, all of it, for a screen already sitting in memory. It is now `30`
(`next.config.ts`).

Thirty seconds is safe for money because of who can be hurt, in order:

- The cashier who posted. A posting is a Server Action calling
  `revalidateAfterPaymentPosting` → `revalidatePath`, and that purges the whole
  client cache. They never see a pre-receipt figure.
- A colleague of theirs. They may not see somebody else's posting for up to 30s
  on a re-visit. The dashboard already runs on a **300s** server-side ceiling
  for the same numbers (`DASHBOARD_STALENESS_CEILING_SECONDS`), so this is an
  order of magnitude inside a staleness the app has been shipping for months.
- Playwright. Unaffected — `page.goto()` is a document load and never consults
  the client router cache.

`staleTimes.static` is written out at its default `300` on purpose, so a future
Next default change shows up as an edit here rather than a silent behaviour
swing. It governs `router.prefetch()` results, which is what the sidebar warms
on idle (§5.6's sibling finding).

**The shell blocked the first paint.** `DashboardShell` awaited fee policy, the
session list and the shell pulse before emitting a single byte of chrome — and
because a layout that awaits blocks its children, the child route's
`loading.tsx` could not paint either. Every skeleton in this app only appeared
*after* the slow part was over, which is backwards in the same way §5.4's
progress bar was.

`getShellPulse` is the one that hurt: it is tagged `session:{label}`, so every
payment posting busts it, and on a busy desk it is cold far more often than it
is warm. `getSessionSwitcherData` is a 1200ms `Promise.race` on a cold lambda.

`DashboardShell` is a plain function now. It starts the three reads, hands the
promises to `<Suspense>` boundaries — `ShellDayCard`, `ShellSessionPill`, and
`NavCount` for the badges — and returns. Each read carries a `.catch()`, which
does two jobs: an unawaited promise that rejects is an unhandled rejection, and
separately, a failed shell read used to take down the whole workspace. A missing
"Day so far" figure is not a reason nobody can reach the Payment Desk.

Pinned by `tests/unit/performance-guardrails.test.ts`.

### 5.10 The installed app (Chrome PWA) — three traps

Staff install this from Chrome on counter machines and phones. Three things
about that were wrong, and each is the kind of thing a later reader will
helpfully "fix" back.

**A manifest is fetched without cookies.** `metadata.manifest` in
`app/layout.tsx` emitted `<link rel="manifest" href="/api/manifest">` with no
`crossorigin`, and a manifest request omits credentials unless the link says
`use-credentials`. Next only sets that attribute on Vercel *preview*
deployments (`lib/metadata/metadata.js`, guarded on `VERCEL_ENV`). So in
production `/api/manifest` saw no cookies, `getAuthenticatedStaff()` returned
null, the role fell back to `view_only` — and every installed app, whoever
owned it, launched on Dashboard with no Payment Desk shortcut. The route had
been role-aware since it was written and had never once acted on it.

The link is therefore **hand-rendered** in `app/layout.tsx` with
`crossOrigin="use-credentials"`. Moving it back to `metadata.manifest` silently
reverts the bug.

**Cache Storage does not know who is signed in.** The worker precached and
stale-while-revalidated `/api/manifest`, which is `private, no-store` and
per-role — so on a shared counter device one staffer's manifest was served to
the next for up to thirty minutes. Cache Storage ignores `Cache-Control`
entirely; nothing user-specific belongs in it. It is out, and every bucket was
renamed to `v2` because renaming is what actually evicts the already-written
copies from devices in the field (the `activate` handler deletes anything not
on `KEEPABLE_CACHES`).

The same reasoning is why `app/auth/login/page.tsx` mounts
`<SignedOutCachePurge />`. `logoutAction` is a Server Action and cannot reach
Cache Storage or IndexedDB at all; reaching the login page proves there is no
session, so purging there is unconditionally safe and also covers the ways a
session ends without touching the sign-out button. It clears caches of *server*
data only — payment drafts, saved views and preferences are the staffer's own
work and stay.

**A service worker that claims navigations, without navigation preload, is a
tax.** Chrome kills an idle worker after about thirty seconds. The `fetch`
handler responds to every navigation, so each cold navigation waited for the
worker to boot *before* the request was issued. `navigationPreload.enable()` in
`activate` plus `event.preloadResponse` in the navigate branch lets the browser
start the request in parallel. This is the one change that makes the worker pay
for itself.

Unchanged and deliberate: GET-only, network-first navigations, no protected
page body ever cached, nothing queued or replayed. Pinned by
`tests/unit/offline-shell-policy.test.ts` and `tests/ui/mobile-ux-roadmap.test.ts`.

**Deliberately not done in the same pass:** caching the per-navigation `users`
row. It carries `role` and `is_active`, the Router Cache above already removes a
large share of the calls, and a 60s window in which a deactivated account still
works is a poor trade for one round trip. `requireAuthenticatedStaff()` stays an
uncached read.

### 5.5 Component count

We grew the primitive count by 7 (`Money`, `KpiCard`, `EmptyState`, `Notice`,
`Section`, `Sheet`, `CountUp`). Review at the 3-month mark — anything we
didn't reuse 3+ times across the app is a candidate for deletion.

### 5.7 Feedback contract

Every user-triggered change tells the user what happened, and the page reflects
it without a manual reload. `tests/unit/action-feedback-contract.test.ts`
enforces this, so a reviewer can cite this section rather than a regex.

The four rules:

1. **A `useActionState` surface must run `useActionFeedback`** (or the `Many`
   variant). The hook toasts the result and calls `router.refresh()` on success.
2. **A form bound straight to an imported server action must report its
   outcome** — a toast, a `<FlashNotice>`, or a `redirect()` to `?notice=` /
   `?error=` / `?done=` that the destination renders.
3. **No discarded action promises.** `void someAction(...)` cannot fail
   visibly; there is no legitimate use.
4. **A submit control shows it was pressed** — `PendingSubmitButton` for
   server-action forms, `<Button loading>` for `useState`-driven ones.

The test asserts *exact equality* against checked-in lists, so it fails in both
directions: a new gap fails, and a fixed gap left in the list also fails. Seed
any new list by **running** the detectors, never by hand. Every allowlist entry
carries the reason it is acceptable.

Failure is never silent: an error with no message still gets a sentence.
Success is never silent either — the hook used to suppress the toast when the
action returned no message, which was a silent-success path hiding inside the
hook meant to prevent silent success.

Tone is not colour-only. A success/danger toast carries an icon as well as a
rail (WCAG 1.4.1), and danger takes `role="alert"` plus a longer dismiss.

**Optimistic UI stays banned for financial mutations** (§5.3). `useActionFeedback`
+ `PendingSubmitButton` is the sanctioned substitute.

### 5.8 Downloads

Export routes generate XLSX and printable HTML on demand and declare
`maxDuration = 60`. A download is a plain navigation to an attachment response,
so the page never changes — clicking one produced *no UI change at all*, and
staff clicked again.

There is no client event for "an attachment arrived": `<a download>` fires
nothing, and an iframe's `onload` does not fire for an attachment. So
`<DownloadAnchor>` puts a nonce on the URL and `withDownloadToken` echoes it
back as a short-lived cookie; the client polls for it and clears the spinner
when the response reaches the browser.

**The rule: never intercept the click.** No `preventDefault`, no `fetch`, no
blob. The browser performs the same navigation it always did, so the native
download shelf, `target="_blank"` printing, and the no-JS path all still work.
`tests/ui/exports-page-links.test.tsx` asserts this against the primitive.

Why not `fetch` + blob, which would signal precisely: it discards the download
shelf, breaks the printable-HTML flow, buffers a whole workbook in tab memory,
and loses the file if the tab closes mid-request.

Two related traps, both of which have shipped as bugs here:

- **Never point a `<Link>` at a download route.** The App Router intercepts the
  click and a non-RSC response silently no-ops — the button does nothing. Three
  live instances were found and fixed.
- **`SameSite=Lax`, not `Strict`.** A download is a top-level navigation, and
  `Strict` drops the cookie on the `target="_blank"` PDF route.

The signal means "the response reached the browser", not "the file finished
writing to disk". For a 60-second generation that is the number that matters.
A 90s timeout says "still preparing" rather than spinning forever — a spinner
that never stops is the same dead-click bug in a new costume.

---

## 6. Quick rules of thumb

- **One saffron CTA per screen.** If a page has two saffron buttons, one is
  wrong.
- **No nested cards.** A `<Card>` inside a `<Card>` is a sign the layout
  should be flattened or the inner one should become a `<Section variant="plain">`.
- **Currency always wraps in `<Money>`.** Don't call `formatInr` directly in
  JSX. The component handles tone, sign, fallback, and tabular-nums.
- **Tonal soft colors for state, semantic solids for actions.** Use
  `bg-warning-soft text-warning-soft-foreground` for status surfaces. Reserve
  `bg-destructive` (solid) for actual destructive buttons.
- **`<Section>` for page blocks. `<Card>` for atomic surfaces inside a Section.**
  Don't reach for raw `border bg-card` recipes — they exist as named
  primitives.
- **`anim-*` classes only.** Don't add new keyframes without a reason. We
  removed 7 of them; keep the discipline.

---

## 7. Files of interest

| File | Role |
|---|---|
| `app/globals.css` | Token graph, four canonical keyframes, legacy aliases |
| `tailwind.config.ts` | Semantic color scale, radius, shadow, font-family tokens |
| `app/layout.tsx` | Inter + Source Serif 4 via `next/font/google` |
| `components/ui/*` | Every primitive listed in §2 |
| `components/admin/dashboard-shell.tsx` | Sidebar + Topbar + MobileBottomNav + RouteProgress |
| `components/office/office-ui.tsx` | Cross-page office patterns — all token-driven |
| `scripts/_archive/design-tokens-migration/` | The one-time token migration, kept for reference |

If you change any token in `globals.css`, the whole app cascades — no need to
touch individual page files. That's the win this redesign was built around.
