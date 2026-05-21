# VPPS Fee Management App — End-to-End Mobile UI/UX Overhaul
## Comprehensive Codex Implementation Prompt

---

## CONTEXT & CONSTRAINTS

You are working on **VPPS Fee Management App** — an internal school fee-collection admin app for
Shri Veer Patta Senior Secondary School. The audience is **non-technical office staff and
accountants** who use this daily on mobile phones. The app is built with:

- **Next.js 16 App Router** + TypeScript + React 19
- **Tailwind CSS** + shadcn/ui (Radix UI)
- **Design tokens** in `app/globals.css` (Ledger Calm theme — warm paper bg, ink text, saffron
  `--accent`)
- **Three roles**: `admin`, `accountant`, `read_only_staff`

**Hard rules you must not break:**
1. Do NOT touch `lib/`, `app/api/`, or any server-only data/logic files.
2. Do NOT change business logic or routing. Only change **UI/UX presentation layer**.
3. Preserve all ARIA labels, `aria-live`, `role` attributes.
4. Keep the `print:hidden` classes — print stylesheets must not break.
5. Keep `mobile-safe-bottom-padding`, `mobile-bottom-nav-clearance`, and all CSS variables.
6. Run `npm run check` (lint + typecheck) after all changes. Must pass with zero errors.
7. Test session indicator (purple ring + banner) must stay visible.

---

## OVERALL PHILOSOPHY

The goal is **app-like feel on mobile phones** — not a desktop site scaled down. Every change
must serve **ease of use for a non-technical person collecting school fees**. Prioritise:

1. **Speed of the core daily workflow**: Open app → Payment Desk → Find student → Enter amount →
   Confirm → Receipt. This must be under 10 seconds of interaction.
2. **Clarity over density**: Fewer items on screen, bigger touch targets, obvious actions.
3. **Progressive disclosure**: Surface the 20% of features used 80% of the time first. Hide
   advanced options behind "More" / expandable sections.
4. **Consistent bottom-sheet patterns** for all overlays/drawers on mobile.

---

## CHANGE 1 — Mobile Shell & Navigation

### File: `components/admin/mobile-bottom-nav.tsx`

**Problem:** Active state is subtle (tiny 2px top rule). Labels like "Dues" are ambiguous. No
visual weight differentiation between active/inactive icons.

**Implementation:**
- Wrap each item's icon in a rounded `pill` container that fills with `bg-accent/12` when active
  and the icon becomes `text-accent`. Inactive: icon is `text-muted-foreground/60`.
- Increase the pill container to `size-8` (32px), icon stays `size-5`.
- Remove the top-edge `h-[2px]` indicator. The pill is enough.
- Rename labels: `"Dues"` → `"Defaulters"`, `"Receipts"` → `"History"` (more descriptive for
  non-tech users).
- Increase bottom nav height from `4rem` to `4.25rem` on portrait phones.
- Add `transition-all duration-200` to the pill background for smooth state change.

```tsx
// Target structure per nav item:
<Link ...>
  <span className={cn(
    "flex size-8 items-center justify-center rounded-full transition-all duration-200",
    active ? "bg-accent/12" : ""
  )}>
    <Icon className={cn("size-5", active ? "text-accent" : "text-muted-foreground/70")} />
  </span>
  <span className={cn("mt-0.5 text-[10px] font-medium", active ? "text-accent" : "text-muted-foreground/70")}>
    {item.label}
  </span>
</Link>
```

### File: `components/admin/app-topbar.tsx` — `MobileHeader` component

**Problem:** 48px header doesn't show the current page name, so users don't know where they are.
The `MoreVertical` icon (3 dots) is not universally understood.

**Implementation:**
- Increase height to `h-14` (56px).
- Add current page title in the centre using `getProtectedRouteMeta(pathname).label`. Use
  `text-sm font-semibold truncate` with `max-w-[44vw]`.
- Replace `MoreVertical` with a user avatar circle showing initials (same pattern as desktop
  `AppTopBar`): a `size-9` rounded-full with initials. This is immediately understood as
  "my account".
- Keep session pill on the left side of the title.

```tsx
// New MobileHeader layout:
<header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-3 backdrop-blur print:hidden md:hidden">
  <Link href={sessionAwareHomeHref} ...><SchoolBrand variant="icon" priority /></Link>
  <p className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-foreground truncate max-w-[44vw]">
    {routeTitle}
  </p>
  <div className="flex items-center gap-2">
    {sessionPill}
    {/* User avatar dropdown - same as desktop */}
    <DropdownMenu>
      <DropdownMenuTrigger className="grid size-9 place-items-center rounded-full bg-surface-2 border border-border text-[11px] font-semibold uppercase text-foreground">
        {initialsOf(staffEmail)}
      </DropdownMenuTrigger>
      {/* same dropdown content */}
    </DropdownMenu>
  </div>
</header>
```

---

## CHANGE 2 — Dashboard Page: Mobile-First Redesign

### File: `app/protected/dashboard/page.tsx`

#### 2a. KPI Cards → Horizontally Scrollable Strip on Mobile

**Problem:** The current `grid-cols-2` KPI grid is cramped on phones. Values overflow, numbers are
hard to read at a glance.

**Implementation:** Wrap `HeroKpis` in a horizontal snap-scroll container on mobile only.

Change the `HeroKpis` component's outer div:
```tsx
// Before:
<div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">

// After:
<div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 snap-x scroll-smooth sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4 no-scrollbar">
```

Each `KpiCard` and the overdue card gets `snap-start shrink-0 w-[72vw] sm:w-auto`:
```tsx
<KpiCard className="snap-start shrink-0 w-[72vw] sm:w-auto" ... />
```

This makes the 4 KPIs swipeable on phones (you see 1.3 cards = peek pattern) and grid on tablets+.

#### 2b. QuickActions — Sticky Below Page Header on Mobile

**Problem:** Quick actions are buried below the KPI strip. On mobile, the primary CTA (Open
Payment Desk) should be immediately accessible.

**Implementation:** In `QuickActions`, ensure the Payment Desk button is always full-width on
mobile and visually dominant:

```tsx
// Payment Desk button — always top and full-width on mobile
{canPostPayments && (
  <Button asChild variant="accent" size="lg"
    className="w-full justify-between px-5 h-14 text-base rounded-xl shadow-sm sm:w-auto sm:h-10 sm:text-sm sm:rounded-md"
    leadingIcon={<BadgeIndianRupee className="size-5" />}
  >
    <Link href={withSession("/protected/payments")}>
      Open Payment Desk
      <ArrowRight className="size-5 ml-2" />
    </Link>
  </Button>
)}
```

Remove the `grid grid-cols-3` wrapper for secondary actions on mobile — use a 2-column grid
instead for better touch targets:
```tsx
<div className="grid grid-cols-2 gap-2 sm:contents">
```

#### 2c. FollowUpQueue — Card Layout Instead of Multi-Column Row

**Problem:** On mobile, each follow-up row has 3 sub-sections (name, amount, buttons) that stack
awkwardly. The call button is not prominent enough.

**Implementation:** Redesign each `li` in `FollowUpQueue` as a mobile-first card:

```tsx
<li key={row.studentId}
  className="px-4 py-3.5 transition-colors hover:bg-surface-2/40"
>
  {/* Row 1: Name + Amount */}
  <div className="flex items-start justify-between gap-2">
    <div className="min-w-0 flex-1">
      <p className="font-semibold text-foreground truncate">{row.studentName}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{row.classLabel} · SR {row.admissionNo}</p>
    </div>
    <div className="text-right shrink-0">
      <Money value={row.outstandingAmount} size="lg" tone="warning" />
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {row.nextDueDate ? `Due ${formatShortDate(row.nextDueDate)}` : "Pending"}
      </p>
    </div>
  </div>
  
  {/* Row 2: Action chips */}
  <div className="mt-3 flex items-center gap-2">
    {row.fatherPhone && (
      <a href={`tel:${row.fatherPhone}`}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-3 transition-colors min-h-9"
      >
        <Phone className="size-3.5" /> Call
      </a>
    )}
    <CopyReminderButton text={row.reminderText} />
    <Button asChild size="sm" variant={canPostPayments ? "accent" : "outline"}
      className="ml-auto rounded-full px-4"
    >
      <Link href={withSession(`/protected/payments?studentId=${row.studentId}&classId=${row.classId}`)}>
        {canPostPayments ? "Collect" : "View"}
      </Link>
    </Button>
  </div>
</li>
```

#### 2d. TodayPanel — Cleaner Mobile Layout

The payment mode list is good. Just ensure the "Collected today" number uses the large display
size and the mode breakdown list items have `min-h-11` touch targets.

#### 2e. Class Summary Table — Replace Mobile Notice with Summary Cards

**Problem:** The mobile notice says "hidden on mobile, go to Exports." This is a dead end for
users who just want a quick overview.

**Implementation:** Replace the mobile notice with a compact 2-column card grid showing only
the top 4 classes (sorted by pending amount):

```tsx
{/* Mobile: top 4 class cards */}
<div className="md:hidden grid grid-cols-2 gap-2">
  {rows.slice(0, 4).map(row => (
    <div key={row.classLabel} className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-semibold text-foreground">{row.classLabel}</p>
      <Money value={row.pendingAmount} size="sm" className="mt-1" />
      <p className="text-[10px] text-muted-foreground mt-1">{row.collectionRate}% collected</p>
    </div>
  ))}
</div>
```

#### 2f. PageHeader — Compact on Mobile

In `components/admin/page-header.tsx`, hide the `description` on mobile to save space:

```tsx
{description ? (
  <p className="mt-1.5 hidden text-sm leading-6 text-muted-foreground sm:block">
    {description}
  </p>
) : null}
```

On mobile only the `eyebrow` + `title` shows. This applies globally across all pages since
PageHeader is shared.

---

## CHANGE 3 — Payment Desk: App-Store-Quality Mobile Experience

### File: `components/payments/payment-desk-mobile.tsx`

The payment desk is the most-used screen for accountants. It needs app-like polish.

#### 3a. Student Search — Full-Screen Overlay Feel

The student search combobox should feel like a native search sheet. When the user taps the
student selector:
- Add `autofocus` to the search input.
- Ensure the combobox results panel is `rounded-xl` with `shadow-lg` and has momentum scroll.
- Add a "Recent students" section at the top of the dropdown (before search results) showing the
  last 3 students from `paymentDeskRecentStudentsStorageKey`. Show them as chips:
  ```tsx
  {recentStudents.length > 0 && !searchQuery && (
    <div className="px-3 py-2 border-b border-border">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Recent</p>
      <div className="flex flex-wrap gap-1.5">
        {recentStudents.map(s => (
          <button key={s.id} onClick={() => selectStudent(s)}
            className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-foreground border border-border hover:bg-surface-3 transition-colors"
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  )}
  ```

#### 3b. Amount Entry — Large, Finger-Friendly

The amount input and preset buttons need a mobile-optimized layout:

```tsx
{/* Amount input — tall, numeric keyboard */}
<Input
  type="number"
  inputMode="decimal"
  className="h-14 text-xl font-semibold text-center tracking-tight"
  placeholder="₹ 0"
/>

{/* Preset chips — 2 rows × 3 chips on mobile */}
<div className="grid grid-cols-3 gap-2">
  {[500, 1000, 2000, 5000, 10000, 20000].map(amount => (
    <button key={amount}
      type="button"
      onClick={() => setAmount(amount.toString())}
      className="rounded-xl border border-border bg-surface-2 py-3 text-sm font-semibold text-foreground hover:bg-surface-3 active:scale-95 transition-all"
    >
      ₹{(amount/1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k
    </button>
  ))}
</div>
```

Change `mobilePresetAmounts` to `[500, 1000, 2000, 5000, 10000, 20000]` (6 presets, 2×3 grid).

#### 3c. Payment Mode — Visual Icon Chips

Replace the plain `<select>` for payment mode with visual icon chips on mobile:

```tsx
const paymentModeOptions = [
  { value: "cash",          label: "Cash",         Icon: Banknote },
  { value: "upi",           label: "UPI",          Icon: Smartphone },
  { value: "bank_transfer", label: "Bank",         Icon: Building2 },
  { value: "cheque",        label: "Cheque",       Icon: FileText },
];

{/* On mobile: icon chip grid */}
<div className="grid grid-cols-4 gap-2 md:hidden">
  {paymentModeOptions.map(({ value, label, Icon }) => (
    <button key={value} type="button"
      onClick={() => setPaymentMode(value)}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-all",
        paymentMode === value
          ? "border-accent bg-accent/8 text-accent"
          : "border-border bg-surface-2 text-muted-foreground hover:bg-surface-3"
      )}
    >
      <Icon className="size-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  ))}
</div>
{/* Keep native select for desktop */}
<select className={cn(selectClassName, "hidden md:flex")} ...>
```

These icons already exist as imports in the file (`Banknote`, `Building2`, `FileText`,
`Smartphone`).

#### 3d. Submit Button — Fixed to Bottom

The "Confirm" CTA should be sticky at the bottom so users don't need to scroll to find it.
Wrap the form submit button area in a fixed footer:

```tsx
{/* Fixed bottom CTA on mobile */}
<div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 pb-safe-bottom pt-3 backdrop-blur md:relative md:inset-auto md:z-auto md:border-0 md:bg-transparent md:pb-0 md:pt-0 mobile-bottom-nav-clearance">
  <Button type="submit" variant="accent" size="lg"
    className="h-14 w-full rounded-xl text-base font-semibold"
    disabled={isSubmitting || !isValid}
  >
    {isSubmitting ? "Posting..." : "Confirm & Save Receipt"}
  </Button>
</div>
```

---

## CHANGE 4 — Students List: Touch-Optimised Cards

### File: `components/students/student-quick-load.tsx` + page components

#### 4a. Filter Section → Bottom Sheet on Mobile

**Problem:** Filters are displayed inline at the top of the list, consuming screen space before
the actual student list is visible. On mobile, filters should be a sheet triggered by a button.

In the Students page, wrap the existing `SectionCard` for filters:

```tsx
{/* Mobile: filter button that opens a sheet */}
<div className="md:hidden">
  <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setFilterSheetOpen(true)}>
    <SlidersHorizontal className="size-4" />
    Filters
    {activeFilterCount > 0 && (
      <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
        {activeFilterCount}
      </span>
    )}
  </Button>
  <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
    <SheetContent side="bottom" className="rounded-t-2xl">
      <SheetHeader className="pb-4">
        <SheetTitle>Filter Students</SheetTitle>
      </SheetHeader>
      {/* Filter fields go here */}
    </SheetContent>
  </Sheet>
</div>
{/* Desktop: inline filters as before */}
<div className="hidden md:block">
  <SectionCard title="Filters" ...>...</SectionCard>
</div>
```

Import `SlidersHorizontal` from `lucide-react`. Use the existing `Sheet` component from
`@/components/ui/sheet`.

#### 4b. Student List Items — Larger Touch Targets with Status Colour

Each student row should have clear visual scanning order:

```tsx
<li className="group relative">
  <Link href={withSession(`/protected/students/${student.id}`)}
    className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-surface-2/50 active:bg-surface-2"
  >
    {/* Status dot */}
    <span className={cn(
      "size-2.5 shrink-0 rounded-full mt-0.5",
      student.status === "active" ? "bg-success" : "bg-muted-foreground/30"
    )} />
    
    {/* Name + class + admission */}
    <div className="min-w-0 flex-1">
      <p className="font-medium text-foreground truncate">{student.name}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{student.classLabel} · SR {student.admissionNo}</p>
    </div>
    
    {/* Pending amount if any */}
    {student.pendingAmount > 0 && (
      <div className="shrink-0 text-right">
        <Money value={student.pendingAmount} size="sm" tone="warning" />
        <p className="text-[10px] text-muted-foreground">pending</p>
      </div>
    )}
    
    <ChevronRight className="size-4 text-muted-foreground/40 shrink-0" />
  </Link>
</li>
```

#### 4c. Floating "Add Student" Button

Add a Floating Action Button (FAB) on mobile that appears at bottom-right for the Add Student action (admin/accountant role only):

```tsx
{canWriteStudents && (
  <Link href={withSession("/protected/students/new")}
    className="fixed bottom-24 right-4 z-30 flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg hover:bg-accent/90 active:scale-95 transition-all md:hidden"
    aria-label="Add new student"
  >
    <Plus className="size-6" />
  </Link>
)}
```

The `bottom-24` keeps it above the bottom nav bar.

---

## CHANGE 5 — Defaulters: Call-Optimised Mobile Layout

### File: `app/protected/defaulters/page.tsx`

#### 5a. Metric Cards → Horizontal Scrolling Strip on Mobile

Same snap-scroll pattern as Dashboard KPIs:

```tsx
{/* Mobile: snap scroll strip */}
<div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 snap-x no-scrollbar md:mx-0 md:px-0 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-5">
  {/* Each metric card gets: shrink-0 w-[70vw] snap-start md:w-auto */}
```

#### 5b. Quick Filter Chips (New Component)

Add a horizontal scrollable chip row above the main list for the most common filters:

```tsx
{/* Quick filter chips - horizontal scroll */}
<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar md:mx-0 md:px-0">
  {[
    { label: "All", value: "all" },
    { label: "Overdue only", value: "overdue" },
    { label: "₹5,000+", value: "5000" },
    { label: "₹10,000+", value: "10000" },
  ].map(chip => (
    <Link key={chip.value}
      href={buildFilterHref(chip)}
      className={cn(
        "shrink-0 rounded-full px-4 py-2 text-sm font-medium border transition-colors",
        isActive(chip)
          ? "bg-accent text-accent-foreground border-accent"
          : "bg-surface-2 text-foreground border-border hover:bg-surface-3"
      )}
    >
      {chip.label}
    </Link>
  ))}
</div>
```

#### 5c. Defaulter List Items — WhatsApp-ready call button

Each defaulter row needs a prominent phone call button:

```tsx
<li className="px-4 py-3.5 hover:bg-surface-2/40">
  {/* Name + class + outstanding */}
  <div className="flex items-start justify-between gap-2">
    <div className="min-w-0">
      <p className="font-semibold text-foreground">{row.studentName}</p>
      <p className="text-xs text-muted-foreground">{row.classLabel} · SR {row.admissionNo}</p>
    </div>
    <div className="text-right shrink-0">
      <Money value={row.outstandingAmount} size="lg" tone="warning" />
      <StatusBadge label={row.overdueLabel} tone="warning" />
    </div>
  </div>
  
  {/* Action row */}
  <div className="mt-2.5 flex items-center gap-2">
    {row.fatherPhone && (
      <a href={`tel:${row.fatherPhone}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-foreground min-h-10 hover:bg-surface-3 transition-colors"
      >
        <Phone className="size-4 text-success" />
        {row.fatherPhone}
      </a>
    )}
    <div className="ml-auto flex gap-1.5">
      <Button asChild size="sm" variant="ghost">
        <Link href={withSession(`/protected/students/${row.studentId}`)}>View</Link>
      </Button>
      {canPostPayments && (
        <Button asChild size="sm" variant="accent" className="rounded-full">
          <Link href={withSession(`/protected/payments?studentId=${row.studentId}&classId=${row.classId}`)}>
            Collect
          </Link>
        </Button>
      )}
    </div>
  </div>
</li>
```

---

## CHANGE 6 — Transactions: Simplified Mobile View

### File: `app/protected/transactions/page.tsx`

#### 6a. View Tabs → Horizontal Scrolling Chip Row on Mobile

The workbook view switcher should use a scrollable chip row on mobile instead of whatever
multi-select it currently uses:

```tsx
{/* Mobile: horizontal scrolling view tabs */}
<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar md:hidden">
  {officeWorkbookViews.map(view => (
    <Link key={view.key}
      href={buildOfficeWorkbookHref({ view: view.key, ...filters })}
      className={cn(
        "shrink-0 rounded-full px-4 py-2 text-sm font-medium border transition-colors whitespace-nowrap",
        currentView === view.key
          ? "bg-accent text-accent-foreground border-accent"
          : "bg-surface-2 text-foreground border-border"
      )}
    >
      {view.label}
    </Link>
  ))}
</div>
```

#### 6b. Workbook Table → Card List on Mobile

The `overflow-x-auto` table works but is painful on small screens. For mobile, show the dues/
transactions as a card list instead. Use a responsive pattern:

```tsx
{/* Mobile: card list */}
<div className="md:hidden divide-y divide-border rounded-md border border-border bg-card">
  {rows.map(row => (
    <Link href={withSession(`/protected/students/${row.studentId}`)}
      key={row.studentId}
      className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-2/40"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground truncate">{row.studentName}</p>
        <p className="text-xs text-muted-foreground">{row.classLabel}</p>
        <ValueStatePill label={row.statusLabel} tone={getStatusTone(row.statusLabel)} className="mt-1.5" />
      </div>
      <div className="text-right shrink-0">
        <Money value={row.pendingAmount} size="lg" />
        {row.overdueAmount > 0 && (
          <p className="text-xs text-warning mt-0.5">
            <Money value={row.overdueAmount} size="xs" tone="warning" /> overdue
          </p>
        )}
      </div>
    </Link>
  ))}
</div>
{/* Desktop: table as before */}
<div className="hidden md:block overflow-x-auto ...">
  {/* existing table */}
</div>
```

---

## CHANGE 7 — Fee Setup: Accordion Sections on Mobile

### File: `components/fees/fee-setup-client.tsx`

**Problem:** Fee Setup is a long, complex form. On mobile, all sections are visible at once,
creating an overwhelming scroll.

**Implementation:** Wrap each logical section (Global Defaults, Class Fees, Transport Fees,
Installment Dates) in a collapsible disclosure pattern on mobile using HTML `<details>`:

For each section block, add the responsive wrapper:

```tsx
{/* On mobile, wrap each section in a collapsible */}
<details className="group md:contents" open={false}>
  <summary className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card px-4 py-3.5 font-medium text-foreground md:hidden">
    <span className="flex items-center gap-2">
      <SectionIcon className="size-4 text-accent" />
      {sectionTitle}
    </span>
    <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
  </summary>
  <div className="md:contents">
    {/* existing section content */}
  </div>
</details>
```

Open the first section (Global Defaults) by default with `open` attribute.

---

## CHANGE 8 — Exports: Visual Export Cards

### File: `app/protected/exports/page.tsx`

**Problem:** The export cards are functional but plain. Each export type looks identical.

**Implementation:** Add a relevant icon per export type and make cards feel like tappable tiles:

```tsx
const exportGroups = [
  {
    title: "Students",
    items: [
      {
        key: "all-students",
        label: "All students",
        detail: "Complete student list for office checking.",
        icon: UsersRound,
        tone: "neutral" as const,
      },
      {
        key: "conventional-discount-students",
        label: "Discount students",
        detail: "RTE, staff child, and sibling policy.",
        icon: BadgePercent,
        tone: "info" as const,
      },
    ],
  },
  // ...
];

// Card rendering:
<Link href={exportHref}
  className="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4 hover:border-border-strong hover:bg-surface-2 active:scale-[0.99] transition-all"
>
  <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", iconBgClass)}>
    <item.icon className={cn("size-5", iconColorClass)} />
  </div>
  <div className="min-w-0 flex-1">
    <p className="font-semibold text-foreground text-sm">{item.label}</p>
    <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
  </div>
  <Download className="size-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
</Link>
```

Change the layout to `grid gap-3` (single column on mobile, 2-col on tablet).
Import `Download`, `BadgePercent` from `lucide-react`.

---

## CHANGE 9 — Auth: Login Page Visual Improvement

### File: `components/login-form.tsx` + `app/auth/layout.tsx`

**Problem:** The login page is functional but bare. For a school, a more welcoming, branded screen
increases trust.

**Implementation:**

In `app/auth/layout.tsx`, add a branded header above the card:

```tsx
// In auth layout wrapper:
<div className="flex min-h-svh flex-col items-center justify-center bg-background p-4">
  <div className="w-full max-w-sm">
    {/* School brand at top */}
    <div className="mb-6 text-center">
      <SchoolBrand variant="icon" className="mx-auto size-14" />
      <h1 className="mt-3 text-xl font-display font-semibold text-foreground">
        {process.env.NEXT_PUBLIC_SCHOOL_NAME || "School Fee Management"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Staff portal — authorised access only</p>
    </div>
    {children}
  </div>
</div>
```

In `LoginForm`, the card's CardContent padding is already good (`p-5 sm:p-6`). Just ensure the
Sign In button has a better press feedback:

```tsx
<Button
  type="submit"
  className="h-12 w-full justify-between px-4 text-base active:scale-[0.98] transition-transform"
  disabled={isPending}
>
```

---

## CHANGE 10 — Admin Tools: Hub Tiles on Mobile

### File: `app/protected/admin-tools/page.tsx`

**Problem:** Advanced hub sections use text-heavy cards. On mobile, tapping a small description
text is error-prone.

**Implementation:** Make each hub item a full-width tappable card with icon:

```tsx
// Each hub item:
<Link href={withSession(item.href)}
  className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 hover:border-border-strong hover:bg-surface-2 active:scale-[0.99] transition-all"
>
  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 group-hover:bg-surface-3 transition-colors">
    <item.icon className="size-5 text-accent" />
  </div>
  <div className="min-w-0 flex-1">
    <p className="font-semibold text-foreground text-sm">{item.label}</p>
    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
  </div>
  <ChevronRight className="size-4 text-muted-foreground/50 shrink-0" />
</Link>
```

Change section grid from `grid-cols-1` to `grid-cols-1 sm:grid-cols-2`.

---

## CHANGE 11 — Student Detail: Tab Navigation on Mobile

### File: `components/students/student-workspace-tabs.tsx`

**Problem:** Tab labels on mobile can overflow or be hard to tap.

**Implementation:**
- Make tabs horizontally scrollable with `no-scrollbar overflow-x-auto`.
- Each tab should have `shrink-0 whitespace-nowrap` so they don't wrap.
- Active tab should use filled background, not just underline.

```tsx
<div className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
  <div className="flex gap-0 border-b border-border min-w-max md:min-w-0">
    {tabs.map(tab => (
      <Link key={tab.key} href={tabHref(tab.key)}
        className={cn(
          "shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
          activeTab === tab.key
            ? "border-accent text-accent"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        {tab.label}
      </Link>
    ))}
  </div>
</div>
```

#### Student Identity Strip

The `StudentIdentityStrip` component should have larger font for the student name on mobile:

```tsx
// Ensure student name is text-xl on mobile
<h1 className="text-xl sm:text-2xl font-semibold text-foreground">{student.name}</h1>
```

---

## CHANGE 12 — Global CSS Improvements

### File: `app/globals.css`

Add these utility classes to the `@layer utilities` block:

```css
/* Tap highlight suppression already exists, but add active:scale feedback */
.tap-scale {
  @apply active:scale-[0.97] transition-transform duration-100;
}

/* Card as tappable link */
.card-link {
  @apply rounded-xl border border-border bg-card transition-all duration-150
         hover:border-border-strong hover:bg-surface-2
         active:scale-[0.99] active:bg-surface-2;
}

/* Larger bottom nav clearance to account for payment CTA */
.bottom-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* Section header compact on mobile */
@media (max-width: 767px) {
  .page-section-gap {
    @apply space-y-4;
  }
}
```

Also increase `--mobile-bottom-nav-height` from `4rem` to `4.25rem` to match the updated nav height:

```css
--mobile-bottom-nav-height: 4.25rem;
```

---

## CHANGE 13 — Pull-to-Refresh Hint (Progressive Enhancement)

### File: `components/admin/scroll-restoring-main.tsx`

Add a subtle "pull to refresh" hint using the browser's native `location.reload()` via a
`touchstart`/`touchend` gesture tracker. This is purely optional polish — only activate after
a 60px overscroll with `overscroll-behavior-y: contain` already set.

**Skip this if it adds complexity.** The existing route-progress bar and Next.js router caching
handle freshness well enough.

---

## IMPLEMENTATION ORDER

Implement in this exact priority order (highest impact first):

1. **Change 1** — Shell (header + bottom nav) — affects every page
2. **Change 3** — Payment Desk — highest daily usage
3. **Change 2** — Dashboard — first screen most users see
4. **Change 5** — Defaulters — second highest daily usage
5. **Change 4** — Students list
6. **Change 11** — Student detail tabs
7. **Change 6** — Transactions
8. **Change 8** — Exports
9. **Change 9** — Auth login
10. **Change 7** — Fee Setup accordion
11. **Change 10** — Admin Tools hub tiles
12. **Change 12** — Global CSS additions

---

## VERIFICATION CHECKLIST

After implementation, verify each of the following:

- [ ] `npm run check` passes (zero TypeScript errors, zero lint errors)
- [ ] `npm run build` succeeds with no build errors
- [ ] Mobile bottom nav renders correctly at all 5 breakpoints (320px, 375px, 414px, 768px, 1024px)
- [ ] Payment Desk: student search still works, amounts still post correctly
- [ ] Payment Desk: preset amount chips fire `setAmount` correctly
- [ ] Dashboard: KPI swipe strip has `no-scrollbar` (no visible scrollbar on iOS)
- [ ] Follow-up queue: Call links use `tel:` protocol
- [ ] Students: FAB does not overlap bottom nav on iPhone SE (320px)
- [ ] Defaulters: chip filters link to correct `?overdue=overdue` and `?minPendingAmount=5000` params
- [ ] Fee Setup: accordion sections open/close; first section open by default
- [ ] Auth: school name displays from `NEXT_PUBLIC_SCHOOL_NAME` env var
- [ ] Print stylesheets: all `print:hidden` elements still hidden in print preview
- [ ] Test session banner (purple ring) still visible when `TEST-2026-27` is active
- [ ] `aria-current="page"` still set on active bottom nav items
- [ ] Sheet/modal backdrop closes on tap outside (existing Radix behaviour — don't break it)
- [ ] All money values still use tabular-nums (no layout shift)

---

## FILES TO MODIFY (COMPLETE LIST)

```
components/admin/mobile-bottom-nav.tsx       # Change 1
components/admin/app-topbar.tsx              # Change 1 (MobileHeader)
components/admin/page-header.tsx             # Change 2f (hide description on mobile)
app/protected/dashboard/page.tsx             # Changes 2a-2e
components/payments/payment-desk-mobile.tsx  # Change 3
app/protected/students/page.tsx              # Change 4a (filter sheet trigger)
components/students/student-quick-load.tsx   # Change 4b (list items)
app/protected/defaulters/page.tsx            # Changes 5a-5c
app/protected/transactions/page.tsx          # Changes 6a-6b
components/fees/fee-setup-client.tsx         # Change 7
app/protected/exports/page.tsx               # Change 8
components/login-form.tsx                    # Change 9
app/auth/layout.tsx                          # Change 9 (school brand header)
app/protected/admin-tools/page.tsx           # Change 10
components/students/student-workspace-tabs.tsx  # Change 11
app/globals.css                              # Change 12
```

---

## DO NOT MODIFY

```
lib/**                    # All business logic
app/api/**                # All API routes
supabase/**               # DB schema and migrations
tests/**                  # All tests
*.test.ts / *.test.tsx    # Any test files
app/protected/**/actions.ts  # Server actions
```

---

*End of prompt. Implement end-to-end in the order specified above.*
