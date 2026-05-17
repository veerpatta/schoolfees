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
`scripts/migrate-design-tokens*.mjs` prove this is enforceable.

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
- **Notice first:** Three hero KPIs — Today collection · Pending dues ·
  Collection rate. Animated count-up draws the eye without being noisy.
- **Secondary:** Quick Actions row (one saffron CTA, the rest outlined),
  Today panel (collection + mode breakdown), then 2-up Top Defaulters +
  Recent Receipts.
- **Hidden:** The old `<details>` block hiding Class-wise pending,
  Collection trend, Installment status, Class summary, Alerts is **gone**
  — those sections are now first-class. The 8-KPI desktop grid collapsed to
  3 hero + 5 quieter secondary KPIs in a 2-column block alongside Today.

### 3.2 Payment Desk (`/protected/payments`)

- **Main job:** Select a student → review dues → collect payment → print receipt.
- **Notice first:** The student picker + the selected student's dues summary.
  Everything else is a supporting workflow.
- **Secondary:** Amount entry, payment mode selection, allocation preview.
- **Hidden:** Diagnostic details collapsed under a `<details>` *for admins
  only*. Tab "selected" state now uses a calm ink fill (no more black slab on
  every page).
- **Deferred (see §5):** Splitting the 2,154-line client into composable
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

- **Main job:** See one student's full picture — basics, dues, history.
- **Notice first:** Header strip with student name, class, admission no, and
  the *single* primary action ("Collect at Payment Desk").
- **Secondary:** Dues breakdown, payment history, contact info, ledger.
- **Hidden:** Conventional-discount and exception editing kept but visually
  quieter, behind tonal `soft` buttons.

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
| Modal / dialog open | `anim-scale-in` (0.97 → 1) + fade | 180ms | `out-expo` |
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

`components/payments/payment-entry-client.tsx` is 2,154 lines and one of the
most-touched code paths. The visual pass migrated all 142 raw color usages
to tokens, but the file is still a single client component. Suggested split:

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

### 5.4 Top progress bar refinement

`<RouteProgress>` currently shows on any pathname or query change with a
fixed 380ms window. A more accurate signal would hook into Next.js'
`useLinkStatus` (App Router) per-Link to bind progress to actual server-component
streaming. The current implementation is a strict improvement over nothing
and a strict simplification of an NProgress dependency.

### 5.5 Component count

We grew the primitive count by 7 (`Money`, `KpiCard`, `EmptyState`, `Notice`,
`Section`, `Sheet`, `CountUp`). Review at the 3-month mark — anything we
didn't reuse 3+ times across the app is a candidate for deletion.

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
| `scripts/migrate-design-tokens*.mjs` | Idempotent migration scripts; safe to re-run |

If you change any token in `globals.css`, the whole app cascades — no need to
touch individual page files. That's the win this redesign was built around.
