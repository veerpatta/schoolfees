# Source scan 202609051138

**PASS** · 54 finding(s) · P0 0 · P1 0 · P2 43 · P3 11

## Run

| | |
|---|---|
| Run id | `202609051138` |
| Layers | static |
| Git | `ea1be208cfa8` on main (dirty) |
| Node | v26.7.0 |
| Files read | 1607 |
| Started | 2026-09-05T11:38:29.975Z |
| Duration | 9642 ms |
| Strict gate | no |

## Verdict

The gate passed. P0 always fails; deterministic P1 fails; P2/P3 fail only on count regression against `tests/scan/baseline/known-findings.json`.

## What this scan did NOT look at

10 check(s) swept 14833 of 14833 enumerated members.

| Check | Dimension | Domain | Examined | Strategy |
|---|---|---:|---:|---|
| `guards` | app route handlers, pages and server-action modules | 120 | 120 | exhaustive |
| `client-boundary` | source modules crossed against the client bundle import graph | 756 | 756 | exhaustive |
| `session-safety` | product source modules scanned for hardcoded academic-session labels | 756 | 756 | exhaustive |
| `money` | product source files (app, components, lib, workers, hooks, i18n; no tests, no scripts) | 756 | 756 | exhaustive |
| `async-safety` | product .ts/.tsx modules parsed by the TypeScript checker | 723 | 723 | exhaustive |
| `mirror-drift` | declared TS/SQL mirror sides, plus migrations added since the last reconcile | 227 | 227 | targeted |
| `sql-safety` | supabase migrations, plus the source files that build SQL text | 1411 | 1411 | exhaustive |
| `i18n` | locale catalogue keys (union x locale) and t() call sites in product source | 7696 | 7696 | exhaustive |
| `dead-code` | export declarations in app/, components/, lib/, hooks/ and i18n/ | 2377 | 2377 | exhaustive |
| `config-risk` | deployment and build configuration candidates | 11 | 11 | exhaustive |

- **guards** — Sees a guard only where it is named in the file or one import hop away. A guard behind two hops, or inside a helper this check does not follow, reports as a finding — which is the safer direction to be wrong in. In-page conditional rendering is not authorisation and is deliberately not counted.
- **client-boundary** — Reachability is recomputed here rather than taken from project.clientReachable, which closes over type-only imports and across the "use server" boundary and would report nine correct modules as service-role leaks. The narrower closure follows value imports only — including import(), require() and side-effect imports — and stops at every "use server" module, because a client component importing a server action gets a server reference and not that module's code. Consequences of the narrowing, both unseen: an import specifier built at runtime, and a secret read as process.env[name] through a variable. Secret names come from .env.example, minus NEXT_PUBLIC_* and minus any name with a value already committed beside it — a value in git is not a secret — plus a floor of CRON_SECRET, POSTGRES_URL, DATABASE_URL, which code uses and that file never declares. .env.example was read.
- **session-safety** — Two populations are excluded from the P0 on purpose. scripts/** names the live session legitimately and often — scripts/bulk-apply.mjs holds it precisely so it can refuse --session 2026-27 without --live, and the verify-live-* scripts exist to check live health — so a P0 there would fire on the guard rather than the hazard. supabase/migrations/** is applied history: the write already happened, editing the file does not undo it, and ~20 historical hits would bury the one finding about code that can still be changed. Neither is reachable from project.product, so both are excluded structurally rather than by allowlist. Within what is scanned, the check sees only labels written as a complete quoted literal: one assembled at runtime (`${year}-${suffix}`, a value read from a column, a label pasted into a plan file) is invisible here and is the reason scripts/bulk-apply.mjs and the Payment Desk still need their own runtime refusals. Placeholders and other user-facing attribute strings are skipped, as are comments; the end-year arithmetic from parseAcademicSessionLabel() is applied so a month bucket like "2026-04" is not mistaken for a session.
- **money** — Every product file is read, but the money rules are deliberately narrow inside it. (1) The split rule fires only when the divisor is literally installmentCount, count, parts, or an installment-/part-named `.length`, and only when the numerator carries a money word. Dividing money by a *population* — receiptCount, series.length, studentsWithGeneratedDues — is how this repo computes displayed averages, there are eight of them and they are correct; separating them by divisor name is the only rule that reliably keeps them out. A split written with a divisor named something else is invisible to this check. (2) The same money-word gate keeps all four rules off the roughly forty Math.round calls in the tree that count percentages, days, pixels, milliseconds and animation frames — and it means a money variable named neutrally (`v`, `x`, `n`) is not seen either. (3) A division is treated as safe when remainder handling appears within six lines above or eight below, which is how the three real splitters are written; a splitter that keeps its remainder logic further away reads as a finding. (4) scan.money-format-raw runs the audit script's own four patterns only over lib/, workers/, hooks/, utils/ and i18n/, which that script never walks; across the whole tree it adds the no-period "Rs " spelling its regex misses. Intl.DateTimeFormat is not reported at all — it is a date, not money, and src/platform/helpers/date.ts is its canonical home. (5) scan.rounding-policy-mixed is heuristic by registration: it matches on the coerced value's base name, so it sees Math.round(value) against Math.trunc(value) and cannot see the same quantity coerced under two different names. Comments are blanked before any rule reads a line, which also blanks `//` inside string literals — a false negative, never a false positive.
- **async-safety** — Both rules skip tests and scripts. scan.error-swallowed sweeps the whole product surface; scan.floating-promise is narrowed to app/ and lib/ modules no client bundle can reach, because the rule is about a rejection arriving after the response — in the browser there is no response and the console still shows it. Widening to components/ produced eleven hits and eleven of them were calls into helpers whose bodies are wholly try/caught. Neither rule sees .mjs or .js: they are outside the program. Not modelled, and real gaps: an async callback handed to a sync API (forEach, setTimeout), a `.then` chain with no `.catch` on the end, and a catch block whose comment is present but says nothing — a comment is accepted as a decision without being read.
- **mirror-drift** — 8 pairs (16 sides) are pinned in tests/scan/baseline/mirrors.json; 17 migration(s) postdate lastReconciledMigration (supabase/migrations/20260819120000_restore_view_hardening_lost_to_cascade.sql) and were swept for a one-sided late-fee edit. Three limits are worth stating. (1) The pairs are the ones the source declares in a comment — "mirrors X", "byte-identical", "edit both or neither". An undeclared duplication is invisible here, and the honest fix is a comment in the code, not a cleverer scanner. (2) A pin proves movement, never agreement: two sides pinned while already disagreeing stay silent, which is why pending-late-fee carries an explicit `diverged` note reported as scan.observation. (3) The Worker's RBAC copy (workers/schoolfees-mcp/src/permissions.mjs, declared a mirror of lib/auth/roles.ts) is deliberately NOT pinned here — tests/unit/mcp-permissions.test.ts already asserts the two are equivalent at runtime, which is strictly stronger than a text hash, and a second mechanism would only be a second place to forget.
- **sql-safety** — All 211 migrations were lexed (comments and dollar-quoted bodies blanked) to build a live catalogue of 64 functions and 33 views, and 1200 source files were read for SQL built as text. Four limits. (1) The two convention rules judge only the LIVE definition — the last migration in filename order that defines each object — because a finding against an applied migration cannot be acted on without desynchronising schema_migrations. A function created by a later `execute format(…)` inside a DO block is invisible to that catalogue, and so is anything created outside migrations. (2) The money-DDL rule fires on nothing in the tree today: there is no `drop column` anywhere and every `drop table` targets a scratch table. It is retained as a tripwire, not as evidence of a clean history. (3) SQL injection is NOT checked. Every template literal in those source files that is a SQL statement AND interpolates a value was examined; there are 1, and both are safe — `postgres` tagged templates in the notion-sync Edge Function, and a never-executed rollback hint string in lib/prev-year-dues. The app reaches Postgres through supabase-js, which is PostgREST, so there is no concatenation surface to guard and a rule here would have reported those two forever. (4) `security definer`/`security invoker` on functions is not checked either: 31 of the 64 live functions state neither, so there is no convention to hold anyone to. Nor is grant/revoke drift — grants are re-applied in ACL-restore loops and follow-up migrations, and every text rule attempted flagged 18 of 21 live views, which measured the regex rather than the schema.
- **i18n** — Locales come from supportedLocales in src/platform/i18n/locales.ts (read: en, hi, hi-en), not from a glob over messages/ — messages/receipts-bilingual.json is a fixed en+hi pair printed on receipts, is loaded without next-intl, and comparing it against en.json would report every key in it. Parity is exhaustive over all 2083 keys in all 3 catalogues. The reference half is not: it read 723 product .ts/.tsx files, resolved a namespace in 88 of them, and inspected 1447 calls on those translators — of which 63 could not be resolved and were skipped rather than guessed. Those are the indirect idiom this repo uses heavily: t(item.i18nKey), t(MODE_KEYS[mode]), t(ACTIVITY_KIND_I18N[kind]), t(`${key}Desc`) — the key travels in a const map or a template, several of them are already guarded by t.has(...), and resolving them means evaluating the map. A namespace is trusted only when it is a string literal in the same file, so a translator received as a prop (the AdminToolsTranslator idiom) is invisible; 10 file(s) call t("…") with no local binding and were skipped entirely. Value-level problems are out of scope by design and belong to scripts/translate-placeholders.mjs: a key present but empty, a leftover [HI] marker, a Hindi string still identical to the English one, and ICU argument drift between catalogues are none of them reported here.
- **dead-code** — Every export in 715 non-test, non-script source files was parsed; 2 were reported. The gap between those numbers is deliberate and is where this rule's precision comes from. (1) 672 type / interface / enum exports were skipped outright: a prop type named only by its own component's signature is the house style, it costs nothing at runtime, and reporting it would quadruple this rule. Type-only usage of a *value* export is still tracked, because the identifier index does not care why a name appears. (2) 93 exports are used inside their own module and nowhere else — exported too widely rather than dead. They are counted here and not reported; the finding a reader can act on is "this code runs nowhere", not "this could be a module-private const". (3) 122 exports are referenced only by files under tests/. Those are not dead, they are tested, and deleting them would delete a test — but a value whose only caller is its own test is worth knowing about, so the count is stated rather than hidden. (4) Reachability is decided by an identifier index over all source files, comments and string literals included. A name that appears in a doc comment counts as used: false negatives, never false positives. It also means an export whose name collides with any common identifier is invisible to this rule. (5) Excluded by construction: default exports of Next.js convention files, route segment config and HTTP verb exports under app/, the root config and instrumentation files, index barrels, any module a barrel star-re-exports, and workers/ — a separate Cloudflare bundle whose entry point is wrangler's, not an import. (6) Not seen at all: a symbol reached only through a runtime-built import specifier, and dead code *inside* a live export.
- **config-risk** — Each candidate is answered against the real file, and the verdicts are listed here so an empty findings list is legible as checked rather than as skipped. build-error-suppression: clean — neither typescript.ignoreBuildErrors nor eslint.ignoreDuringBuilds is set; function-duration-ceiling: clean — 38 route handler(s) checked, the highest declared maxDuration is 300s; unattended-handler-duration: clean — every cron and admin handler doing bulk work declares a maxDuration; cron-schedule-and-route-agreement: 1 mismatch(es) reported; protected-cache-directive: 2 inert directive(s) reported as P3 — the root layout forces dynamic rendering; security-response-headers: reported — no security header configured anywhere; sentry-dsn-and-sampling: clean — 1 init file(s), each reading the DSN from the environment and each sampling traces at less than 1.0 outside development; typescript-strictness: clean — strict is on and strictNullChecks is not disabled; remote-image-patterns: clean — no remotePatterns, so next/image optimises no remote host at all; serverless-file-tracing: clean — 4 route(s) reach a module that reads from process.cwd(), and all 4 are named in outputFileTracingIncludes; deployment-region: clean — pinned ("regions": ["bom1"],). Deliberately not reported: src/app/api/cron/auto-day-close/route.ts, src/app/api/cron/whatsapp-scheduled-runs/route.ts — unattended and without a maxDuration, but the handler shows neither a bulk row cap nor a storage upload, so its work is bounded and the platform default is enough. skipLibCheck is true in tsconfig.json and is not reported: it is the Next.js default and it suppresses diagnostics in other people's .d.ts files, not in this repo's code. What this check cannot see at all: anything configured in the Vercel dashboard rather than in a file — environment variables and their values, deployment protection, the plan's real function-duration ceiling, and whether the cron secret is actually set. It also reads outputFileTracingIncludes with a regex rather than by evaluating next.config.ts, so a route key assembled from a variable would read as absent.

## Findings

### P2-001 No security response header is configured for any document response

```
id:         ffb8953c7c2b
rule:       scan.config-risk  [deterministic]  layer: static
surface:    next.config.ts:66
expected:   An authenticated admin app sends at least a framing policy — X-Frame-Options, or frame-ancestors inside a Content-Security-Policy — on the HTML responses staff load.
actual:     The headers() block configures Cache-Control on four public asset paths and nothing else. None of Content-Security-Policy, frame-ancestors, X-Frame-Options, Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, Permissions-Policy appears in next.config.ts, vercel.json, src/proxy.ts, src/platform/supabase/proxy.ts, src/platform/supabase/middleware.ts. Next.js sets none of them by default; poweredByHeader: false is the only header-level setting present.
source:     async headers() {
why:        Without a framing policy any page can put /protected/payments in an invisible iframe over a page a signed-in staff member is already looking at, and their click lands on the app instead. This app's buttons post payments, reverse receipts and publish fee policy, and the session cookie is sent with the framed request like any other. The same block is where X-Content-Type-Options: nosniff belongs, which matters here because several routes stream XLSX and PDF bytes back to the browser.
fix:        Add a headers() entry for source: "/:path*" carrying, at minimum, X-Frame-Options: DENY and X-Content-Type-Options: nosniff. A full Content-Security-Policy is a larger piece of work — the Sentry replay CDN and the Supabase origin both have to be allowed for — and is worth doing separately from the framing fix.
```

### P2-002 src/app/api/cron/whatsapp-scheduled-runs/route.ts is a cron handler that nothing schedules

```
id:         4228d0bad9e4
rule:       scan.config-risk  [deterministic]  layer: static
surface:    src/app/api/cron/whatsapp-scheduled-runs/route.ts:1
expected:   A handler under app/api/cron has a matching entry in the vercel.json crons array — that array is the only thing that ever calls it.
actual:     No vercel.json cron entry names /api/cron/whatsapp-scheduled-runs. Scheduled paths are: /api/cron/nightly-backup, /api/cron/auto-day-close.
source:     import { NextResponse } from "next/server";
why:        Nothing else in the app calls a cron route. Unscheduled, it is dead code that reads like an operational guarantee — and it will keep passing every test, because the tests call it directly.
fix:        Add the schedule to vercel.json, or delete the handler if the job was retired.
```

### P2-003 src/app/protected/dashboard/page.tsx:548 formats a rupee figure without lib/helpers/currency.ts

```
id:         dca108a42982
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/app/protected/dashboard/page.tsx:548
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     ? `Rs ${(value / 100_000).toFixed(1)}L`
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-004 src/app/protected/dashboard/page.tsx:550 formats a rupee figure without lib/helpers/currency.ts

```
id:         e8b7b4a41e83
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/app/protected/dashboard/page.tsx:550
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     ? `Rs ${(value / 1_000).toFixed(0)}K`
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-005 src/app/protected/dashboard/page.tsx:551 formats a rupee figure without lib/helpers/currency.ts

```
id:         50fcd8d5b9a2
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/app/protected/dashboard/page.tsx:551
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     : `Rs ${value}`;
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-006 src/app/protected/settings/page.tsx:160 formats a rupee figure without lib/helpers/currency.ts

```
id:         91eed7adfb0b
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/app/protected/settings/page.tsx:160
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     { label: "Late fee", value: `Rs ${policy.lateFeeFlatAmount}` },
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-007 src/app/protected/students/[studentId]/edit/page.tsx:302 formats a rupee figure without lib/helpers/currency.ts

```
id:         715ab5a699da
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/app/protected/students/[studentId]/edit/page.tsx:302
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     description="Admin only. Spreads what this family owes over interest-free monthly instalments. The covered installments stop accruing their own late fees; from then on the EMI calendar carries the only penalty — a flat Rs 1,000 for each monthly instalment that passes unpaid, which an admin can waive
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-008 src/app/protected/students/repayment-plan-actions.ts:327 formats a rupee figure without lib/helpers/currency.ts

```
id:         9f24c0980791
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/app/protected/students/repayment-plan-actions.ts:327
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     message: `EMI plan cancelled. Rs ${result.remainingBalance ?? 0} goes back to the original due dates; Rs ${result.lateFeeWaiversKept ?? 0} of waived late fees stays waived.`,
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-009 src/modules/dashboard/domain/summary.ts:171 formats a rupee figure without lib/helpers/currency.ts

```
id:         c88e75488491
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/dashboard/domain/summary.ts:171
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     return `Fee reminder for ${row.studentName} (${row.admissionNo}): pending amount is Rs ${row.outstandingAmount}.${duePart} Please contact the school fee office.`;
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-010 src/modules/fees/data/setup-queries.ts:191 formats a rupee figure without lib/helpers/currency.ts

```
id:         309dda17d75a
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/fees/data/setup-queries.ts:191
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     .join(", ")}), late fee Rs ${payload.lateFeeFlatAmount}, and receipt prefix ${payload.receiptPrefix} remain visible for review.`
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-011 src/modules/fees/data/workbook-setup-change.ts:125 formats a rupee figure without lib/helpers/currency.ts

```
id:         5a2b495e75c5
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/fees/data/workbook-setup-change.ts:125
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     return `Rs ${value}`;
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-012 src/modules/fees/data/workbook-setup-change.ts:161 formats a rupee figure without lib/helpers/currency.ts

```
id:         df8320e8ef22
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/fees/data/workbook-setup-change.ts:161
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     return `${item.label} (${statusLabel}, Rs ${item.amount}, ${item.chargeFrequency}, ${mandatoryLabel}, ${refundableLabel}, ${workbookLabel})`;
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-013 src/modules/fees/data/workbook-setup-change.ts:404 formats a rupee figure without lib/helpers/currency.ts

```
id:         f5a600033ff0
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/fees/data/workbook-setup-change.ts:404
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     lateFeeLabel: `Flat Rs ${payload.lateFeeFlatAmount}`,
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-014 src/modules/fees/data/workbook-setup-change.ts:418 formats a rupee figure without lib/helpers/currency.ts

```
id:         e3f675784bca
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/fees/data/workbook-setup-change.ts:418
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     lateFeeLabel: `Flat Rs ${payload.lateFeeFlatAmount}`,
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-015 src/modules/fees/domain/policy-shaping.ts:154 formats a rupee figure without lib/helpers/currency.ts

```
id:         0efdc8dc1fc5
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/fees/domain/policy-shaping.ts:154
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     lateFeeLabel: `Flat Rs ${toWholeNumber(row.late_fee_flat_amount)}`,
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-016 src/modules/imports/domain/parser.ts:133 formats an en-IN number without lib/helpers/currency.ts

```
id:         f6e6fd9e6267
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/imports/domain/parser.ts:133
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses toLocaleString("en-IN") directly. scripts/audit-money-formatting.mjs enforces the same rule, but only walks app/ and components/ — it never reads src/.
source:     `The worksheet has too many rows. Keep it to ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows or fewer.`,
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-017 src/modules/imports/domain/parser.ts:145 formats an en-IN number without lib/helpers/currency.ts

```
id:         c60f73d8101e
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/imports/domain/parser.ts:145
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses toLocaleString("en-IN") directly. scripts/audit-money-formatting.mjs enforces the same rule, but only walks app/ and components/ — it never reads src/.
source:     `The worksheet is too large. Keep it below ${MAX_IMPORT_CELLS.toLocaleString("en-IN")} cells.`,
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-018 src/modules/payments/data/queries.ts:239 formats a rupee figure without lib/helpers/currency.ts

```
id:         888b89aaa30f
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/payments/data/queries.ts:239
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses toLocaleString("en-IN") directly. scripts/audit-money-formatting.mjs enforces the same rule, but only walks app/ and components/ — it never reads src/.
source:     ? `A payment of ₹${(options.amount ?? 0).toLocaleString("en-IN")} was already posted for this student on ${options.paymentDate ?? "the same date"}. Continue anyway only if this is genuinely a separate payment.`
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-019 src/modules/payments/domain/bulk/template.ts:138 formats a rupee figure without lib/helpers/currency.ts

```
id:         e2ff8558d0ae
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/payments/domain/bulk/template.ts:138
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written ₹ glyph directly. scripts/audit-money-formatting.mjs enforces the same rule, but only walks app/ and components/ — it never reads src/.
source:     ["Amount", "Yes", "Whole rupees greater than 0", "₹6,300 or a formula"],
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-020 src/modules/payments/domain/payment-desk-workflow.ts:100 formats a rupee figure without lib/helpers/currency.ts

```
id:         76d42cfda804
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/payments/domain/payment-desk-workflow.ts:100
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     message: `No pending dues. Student has Rs ${draft.creditBalance} credit.`,
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-021 src/modules/promotion/data/queries.ts:834 formats a rupee figure without lib/helpers/currency.ts

```
id:         d4bec263f674
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/promotion/data/queries.ts:834
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written ₹ glyph directly. scripts/audit-money-formatting.mjs enforces the same rule, but only walks app/ and components/ — it never reads src/.
source:     const carryNote = `Credit carried forward from ${runDetail.run.sourceSessionLabel}: ₹${entry.openingCreditAmount}.`;
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-022 src/modules/promotion/data/queries.ts:975 formats a rupee figure without lib/helpers/currency.ts

```
id:         c97831de28c9
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/promotion/data/queries.ts:975
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written ₹ glyph directly. scripts/audit-money-formatting.mjs enforces the same rule, but only walks app/ and components/ — it never reads src/.
source:     const carryNote = `Credit carried forward from ${runDetail.run.sourceSessionLabel}: ₹${entry.openingCreditAmount}.`;
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-023 src/modules/repayment-plans/domain/schedule.ts:154 formats a rupee figure without lib/helpers/currency.ts

```
id:         2c00e47f6a64
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/repayment-plans/domain/schedule.ts:154
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     message: `At Rs ${payload.monthlyAmount} a month this plan needs ${termMonths} months. The maximum term is ${REPAYMENT_PLAN_MAX_TERM_MONTHS} months — Rs ${minimumMonthlyAmountForMaxTerm(payload.openingBalance)} a month or more clears it in time.`,
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-024 src/modules/students/ui/student-form.tsx:609 formats a rupee figure without lib/helpers/currency.ts

```
id:         e66e23084c91
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/students/ui/student-form.tsx:609
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     ? "Tuition becomes Rs 0"
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-025 src/modules/students/ui/student-form.tsx:612 formats a rupee figure without lib/helpers/currency.ts

```
id:         92eed16efc7c
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/modules/students/ui/student-form.tsx:612
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     : `Tuition becomes Rs ${policy.fixedTuitionAmount ?? 0}`}
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-026 src/modules/whatsapp/data/delivery-store.ts:223 exports loadSeenButNotPaid, which nothing uses

```
id:         8d04057b8c25
rule:       scan.dead-export  [deterministic]  layer: static
surface:    src/modules/whatsapp/data/delivery-store.ts:223
expected:   Every exported value is either imported somewhere, resolved by Next.js by convention, or deleted.
actual:     `loadSeenButNotPaid` is exported and the identifier appears in no other source file in the repository — not in app/, components/, lib/, hooks/, tests/ or scripts/ — and only once inside src/modules/whatsapp/data/delivery-store.ts, at its own declaration. 2 module(s) import this file, none of them for this name.
source:     export async function loadSeenButNotPaid(args: {
why:        Dead code is not neutral here. It compiles, it is type-checked, it is counted against the source-line budgets in quality/office-quality-budgets.json, and the next reader takes it for something that runs — so a half-finished extraction reads as a finished one, and a retired module reads as a live one.
fix:        Delete it, or wire up the caller it was written for. If it is deliberately kept as an entry point for something outside this repo's import graph, say so in a comment beside the export — this rule reads the whole tree and will keep reporting it otherwise.
```

### P2-027 src/platform/config/fee-rules.ts:180 formats a rupee figure without lib/helpers/currency.ts

```
id:         8fbc39394e1b
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/platform/config/fee-rules.ts:180
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses a hand-written "Rs" literal with no period directly. scripts/audit-money-formatting.mjs matches only "Rs." with the period (/["'`]Rs\.\s*\d|>\s*Rs\.\s/), so this spelling passes CI today.
source:     lateFeeLabel: "Flat Rs 1000",
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-028 src/platform/helpers/date.ts:246 exports istTodayIso, which nothing uses

```
id:         25ce81898384
rule:       scan.dead-export  [deterministic]  layer: static
surface:    src/platform/helpers/date.ts:246
expected:   Every exported value is either imported somewhere, resolved by Next.js by convention, or deleted.
actual:     `istTodayIso` is exported and the identifier appears in no other source file in the repository — not in app/, components/, lib/, hooks/, tests/ or scripts/ — and only once inside src/platform/helpers/date.ts, at its own declaration. 68 module(s) import this file, none of them for this name.
source:     export function istTodayIso(now: Date = new Date()): string {
why:        Dead code is not neutral here. It compiles, it is type-checked, it is counted against the source-line budgets in quality/office-quality-budgets.json, and the next reader takes it for something that runs — so a half-finished extraction reads as a finished one, and a retired module reads as a live one.
fix:        Delete it, or wire up the caller it was written for. If it is deliberately kept as an entry point for something outside this repo's import graph, say so in a comment beside the export — this rule reads the whole tree and will keep reporting it otherwise.
```

### P2-029 src/platform/pdf/document-kit.tsx:52 formats a rupee figure without lib/helpers/currency.ts

```
id:         f36caaafe374
rule:       scan.money-format-raw  [deterministic]  layer: static
surface:    src/platform/pdf/document-kit.tsx:52
expected:   Every rupee a person reads is produced by formatInr() or <Money />, and every other en-IN grouped number by the plain formatter beside it, so a find-references on src/platform/helpers/currency.ts reaches every one of them.
actual:     This line uses toLocaleString("en-IN") directly. scripts/audit-money-formatting.mjs enforces the same rule, but only walks app/ and components/ — it never reads src/.
source:     return `Rs. ${rounded.toLocaleString("en-IN")}`;
why:        The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and the symbol are decided once in formatInr. A second formatter is a second set of answers, and nobody finds it when the first one changes.
fix:        Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's Helvetica genuinely has no ₹ glyph — put the reason on the line with `// @allow-raw-money-format`, which both this check and the audit script honour.
```

### P2-030 src/app/protected/students/close-due-actions.ts:47 rounds `value` where the domain core truncates it

```
id:         dba4a7b5967c
rule:       scan.rounding-policy-mixed  [heuristic]  layer: static
surface:    src/app/protected/students/close-due-actions.ts:47
expected:   One rounding policy per rupee. The domain core coerces a money value to whole rupees with Math.trunc — lib/fees/due-amounts.ts, lib/receipts/amounts.ts, src/lib/finance/financial-state.ts and lib/payments/allocation.ts all do — so a figure reaches the ledger, the receipt and the export with the same value.
actual:     This coerces `value` with Math.round, while 9 other sites coerce the same-named quantity with Math.trunc (src/modules/fees/data/conventional-discounts.ts:167, src/modules/fees/domain/conventional-discount-rules.ts:16, src/modules/fees/domain/due-amounts.ts:28). For 1500.6 one answers 1501 and the other 1500.
source:     return Math.round(value);
why:        Latent today and not later: every money column in supabase/migrations is `integer`, so both policies agree on everything currently in the database. The first fractional value that reaches one of these — an imported spreadsheet, a percentage discount, a future decimal column — makes the receipt and the ledger differ by a rupee, with nothing in either to say which is right.
fix:        Use Math.trunc here too, or state in a comment why this surface deliberately rounds up and the ledger does not.
```

### P2-031 src/platform/helpers/amount-in-words-hi.ts:73 rounds `value` where the domain core truncates it

```
id:         1507266ec39f
rule:       scan.rounding-policy-mixed  [heuristic]  layer: static
surface:    src/platform/helpers/amount-in-words-hi.ts:73
expected:   One rounding policy per rupee. The domain core coerces a money value to whole rupees with Math.trunc — lib/fees/due-amounts.ts, lib/receipts/amounts.ts, src/lib/finance/financial-state.ts and lib/payments/allocation.ts all do — so a figure reaches the ledger, the receipt and the export with the same value.
actual:     This coerces `value` with Math.round, while 9 other sites coerce the same-named quantity with Math.trunc (src/modules/fees/data/conventional-discounts.ts:167, src/modules/fees/domain/conventional-discount-rules.ts:16, src/modules/fees/domain/due-amounts.ts:28). For 1500.6 one answers 1501 and the other 1500.
source:     const amount = Math.max(Math.round(value || 0), 0);
why:        Latent today and not later: every money column in supabase/migrations is `integer`, so both policies agree on everything currently in the database. The first fractional value that reaches one of these — an imported spreadsheet, a percentage discount, a future decimal column — makes the receipt and the ledger differ by a rupee, with nothing in either to say which is right.
fix:        Use Math.trunc here too, or state in a comment why this surface deliberately rounds up and the ledger does not.
```

### P2-032 src/platform/helpers/amount-in-words.ts:84 rounds `value` where the domain core truncates it

```
id:         a4d229dbf12d
rule:       scan.rounding-policy-mixed  [heuristic]  layer: static
surface:    src/platform/helpers/amount-in-words.ts:84
expected:   One rounding policy per rupee. The domain core coerces a money value to whole rupees with Math.trunc — lib/fees/due-amounts.ts, lib/receipts/amounts.ts, src/lib/finance/financial-state.ts and lib/payments/allocation.ts all do — so a figure reaches the ledger, the receipt and the export with the same value.
actual:     This coerces `value` with Math.round, while 9 other sites coerce the same-named quantity with Math.trunc (src/modules/fees/data/conventional-discounts.ts:167, src/modules/fees/domain/conventional-discount-rules.ts:16, src/modules/fees/domain/due-amounts.ts:28). For 1500.6 one answers 1501 and the other 1500.
source:     const amount = Math.max(Math.round(value || 0), 0);
why:        Latent today and not later: every money column in supabase/migrations is `integer`, so both policies agree on everything currently in the database. The first fractional value that reaches one of these — an imported spreadsheet, a percentage discount, a future decimal column — makes the receipt and the ledger differ by a rupee, with nothing in either to say which is right.
fix:        Use Math.trunc here too, or state in a comment why this surface deliberately rounds up and the ledger does not.
```

### P2-033 src/platform/pdf/document-kit.tsx:51 rounds `value` where the domain core truncates it

```
id:         518230cb1c38
rule:       scan.rounding-policy-mixed  [heuristic]  layer: static
surface:    src/platform/pdf/document-kit.tsx:51
expected:   One rounding policy per rupee. The domain core coerces a money value to whole rupees with Math.trunc — lib/fees/due-amounts.ts, lib/receipts/amounts.ts, src/lib/finance/financial-state.ts and lib/payments/allocation.ts all do — so a figure reaches the ledger, the receipt and the export with the same value.
actual:     This coerces `value` with Math.round, while 9 other sites coerce the same-named quantity with Math.trunc (src/modules/fees/data/conventional-discounts.ts:167, src/modules/fees/domain/conventional-discount-rules.ts:16, src/modules/fees/domain/due-amounts.ts:28). For 1500.6 one answers 1501 and the other 1500.
source:     const rounded = Math.round(value || 0);
why:        Latent today and not later: every money column in supabase/migrations is `integer`, so both policies agree on everything currently in the database. The first fractional value that reaches one of these — an imported spreadsheet, a percentage discount, a future decimal column — makes the receipt and the ledger differ by a rupee, with nothing in either to say which is right.
fix:        Use Math.trunc here too, or state in a comment why this surface deliberately rounds up and the ledger does not.
```

### P2-034 private.enforce_max_active_conventional_discounts is defined without a pinned search_path

```
id:         e1f9dd8286ee
rule:       scan.sql-risk  [heuristic]  layer: static
surface:    supabase/migrations/20260425170000_conventional_discount_policies.sql:87
expected:   Every function pins its search_path, as 57 of the 64 live functions in this schema do. 20260811073515 exists for exactly this and states the reason: "Pure date/integer arithmetic, but an unpinned search_path on a function is a foothold regardless."
actual:     The live definition of private.enforce_max_active_conventional_discounts — supabase/migrations/20260425170000_conventional_discount_policies.sql:87, the last migration that defines it — declares no `set search_path`, and is SECURITY INVOKER (the default).
source:     create or replace function private.enforce_max_active_conventional_discounts()
why:        It runs as the caller, so this is not escalation today. It is still the Supabase linter's 0011 and still means an unqualified name inside the body resolves against whatever search_path the session happens to carry.
fix:        Add `set search_path to 'pg_catalog', 'pg_temp'` (or `'public'` where the body needs it) in a new migration that `create or replace`s the function. Never edit the migration that is already applied.
```

### P2-035 private.prevent_receipt_adjustment_mutation is defined without a pinned search_path

```
id:         d0ed42f13c3a
rule:       scan.sql-risk  [heuristic]  layer: static
surface:    supabase/migrations/20260503120000_payment_desk_receipt_adjustments.sql:39
expected:   Every function pins its search_path, as 57 of the 64 live functions in this schema do. 20260811073515 exists for exactly this and states the reason: "Pure date/integer arithmetic, but an unpinned search_path on a function is a foothold regardless."
actual:     The live definition of private.prevent_receipt_adjustment_mutation — supabase/migrations/20260503120000_payment_desk_receipt_adjustments.sql:39, the last migration that defines it — declares no `set search_path`, and is SECURITY INVOKER (the default).
source:     create or replace function private.prevent_receipt_adjustment_mutation()
why:        It runs as the caller, so this is not escalation today. It is still the Supabase linter's 0011 and still means an unqualified name inside the body resolves against whatever search_path the session happens to carry.
fix:        Add `set search_path to 'pg_catalog', 'pg_temp'` (or `'public'` where the body needs it) in a new migration that `create or replace`s the function. Never edit the migration that is already applied.
```

### P2-036 private.enforce_max_active_conventional_discounts_in_schema is defined without a pinned search_path

```
id:         03d2d34f1092
rule:       scan.sql-risk  [heuristic]  layer: static
surface:    supabase/migrations/20260515152802_test_schema_init.sql:66
expected:   Every function pins its search_path, as 57 of the 64 live functions in this schema do. 20260811073515 exists for exactly this and states the reason: "Pure date/integer arithmetic, but an unpinned search_path on a function is a foothold regardless."
actual:     The live definition of private.enforce_max_active_conventional_discounts_in_schema — supabase/migrations/20260515152802_test_schema_init.sql:66, the last migration that defines it — declares no `set search_path`, and is SECURITY INVOKER (the default).
source:     create or replace function private.enforce_max_active_conventional_discounts_in_schema()
why:        It runs as the caller, so this is not escalation today. It is still the Supabase linter's 0011 and still means an unqualified name inside the body resolves against whatever search_path the session happens to carry.
fix:        Add `set search_path to 'pg_catalog', 'pg_temp'` (or `'public'` where the body needs it) in a new migration that `create or replace`s the function. Never edit the migration that is already applied.
```

### P2-037 private.enforce_third_child_traceability is defined without a pinned search_path

```
id:         5fad48a7287b
rule:       scan.sql-risk  [heuristic]  layer: static
surface:    supabase/migrations/20260524151000_third_child_traceability_trigger.sql:20
expected:   Every function pins its search_path, as 57 of the 64 live functions in this schema do. 20260811073515 exists for exactly this and states the reason: "Pure date/integer arithmetic, but an unpinned search_path on a function is a foothold regardless."
actual:     The live definition of private.enforce_third_child_traceability — supabase/migrations/20260524151000_third_child_traceability_trigger.sql:20, the last migration that defines it — declares no `set search_path`, and is SECURITY INVOKER (the default).
source:     create or replace function private.enforce_third_child_traceability()
why:        It runs as the caller, so this is not escalation today. It is still the Supabase linter's 0011 and still means an unqualified name inside the body resolves against whatever search_path the session happens to carry.
fix:        Add `set search_path to 'pg_catalog', 'pg_temp'` (or `'public'` where the body needs it) in a new migration that `create or replace`s the function. Never edit the migration that is already applied.
```

### P2-038 private.derive_family_child_client_request_id is defined without a pinned search_path

```
id:         ef43cda43d2b
rule:       scan.sql-risk  [heuristic]  layer: static
surface:    supabase/migrations/20260525140415_restore_family_payments.sql:12
expected:   Every function pins its search_path, as 57 of the 64 live functions in this schema do. 20260811073515 exists for exactly this and states the reason: "Pure date/integer arithmetic, but an unpinned search_path on a function is a foothold regardless."
actual:     The live definition of private.derive_family_child_client_request_id — supabase/migrations/20260525140415_restore_family_payments.sql:12, the last migration that defines it — declares no `set search_path`, and is SECURITY INVOKER (the default).
source:     create or replace function private.derive_family_child_client_request_id(
why:        It runs as the caller, so this is not escalation today. It is still the Supabase linter's 0011 and still means an unqualified name inside the body resolves against whatever search_path the session happens to carry.
fix:        Add `set search_path to 'pg_catalog', 'pg_temp'` (or `'public'` where the body needs it) in a new migration that `create or replace`s the function. Never edit the migration that is already applied.
```

### P2-039 public.refresh_financial_materialized_views is defined without a pinned search_path

```
id:         1d4c0f440e4f
rule:       scan.sql-risk  [heuristic]  layer: static
surface:    supabase/migrations/20260527090332_20260527140000_concurrent_financial_mat_view_refresh.sql:27
expected:   Every function pins its search_path, as 57 of the 64 live functions in this schema do. 20260811073515 exists for exactly this and states the reason: "Pure date/integer arithmetic, but an unpinned search_path on a function is a foothold regardless."
actual:     The live definition of public.refresh_financial_materialized_views — supabase/migrations/20260527090332_20260527140000_concurrent_financial_mat_view_refresh.sql:27, the last migration that defines it — declares no `set search_path`, and is SECURITY DEFINER.
source:     create or replace function public.refresh_financial_materialized_views(p_concurrently boolean default true)
why:        SECURITY DEFINER with an unpinned search_path is the classic privilege escalation: anything that can set search_path chooses which `installments` or `payments` this function resolves, and it runs as the owner. This one refreshes the financial materialized views, so it holds write reach over the money projection.
fix:        Add `set search_path to 'pg_catalog', 'pg_temp'` (or `'public'` where the body needs it) in a new migration that `create or replace`s the function. Never edit the migration that is already applied.
```

### P2-040 private.prevent_notion_sync_log_mutation is defined without a pinned search_path

```
id:         d89b1bb2ecf4
rule:       scan.sql-risk  [heuristic]  layer: static
surface:    supabase/migrations/20260612023000_notion_fee_sync.sql:42
expected:   Every function pins its search_path, as 57 of the 64 live functions in this schema do. 20260811073515 exists for exactly this and states the reason: "Pure date/integer arithmetic, but an unpinned search_path on a function is a foothold regardless."
actual:     The live definition of private.prevent_notion_sync_log_mutation — supabase/migrations/20260612023000_notion_fee_sync.sql:42, the last migration that defines it — declares no `set search_path`, and is SECURITY INVOKER (the default).
source:     create or replace function private.prevent_notion_sync_log_mutation()
why:        It runs as the caller, so this is not escalation today. It is still the Supabase linter's 0011 and still means an unqualified name inside the body resolves against whatever search_path the session happens to carry.
fix:        Add `set search_path to 'pg_catalog', 'pg_temp'` (or `'public'` where the body needs it) in a new migration that `create or replace`s the function. Never edit the migration that is already applied.
```

### P2-041 public.v_notion_student_fee_summary does not set security_invoker

```
id:         fe4b790a9ade
rule:       scan.sql-risk  [heuristic]  layer: static
surface:    supabase/migrations/20260807120000_workbook_financials_conventional_discount.sql:540
expected:   A plain view over student or financial tables declares `with (security_invoker = true)`, as 25 of the 29 live plain views here do.
actual:     The live definition of public.v_notion_student_fee_summary — supabase/migrations/20260807120000_workbook_financials_conventional_discount.sql:540 — sets no `security_invoker` option, so it runs with its owner's privileges.
source:     create view public.v_notion_student_fee_summary as
why:        Without security_invoker a view reads its base tables as the view owner, and RLS on students, installments, payments and receipts is simply not consulted. Anyone who can select from the view sees every row it can reach, whatever their own policies say.
fix:        Recreate the view with `with (security_invoker = true)` in a new migration — or, if it is deliberately a controlled escape hatch for a service role, say so in a comment on the view so the next reader sees a decision instead of an omission.
```

### P2-042 public.v_notion_daily_collection_summary does not set security_invoker

```
id:         553a7439553c
rule:       scan.sql-risk  [heuristic]  layer: static
surface:    supabase/migrations/20260807120000_workbook_financials_conventional_discount.sql:733
expected:   A plain view over student or financial tables declares `with (security_invoker = true)`, as 25 of the 29 live plain views here do.
actual:     The live definition of public.v_notion_daily_collection_summary — supabase/migrations/20260807120000_workbook_financials_conventional_discount.sql:733 — sets no `security_invoker` option, so it runs with its owner's privileges.
source:     create view public.v_notion_daily_collection_summary as
why:        Without security_invoker a view reads its base tables as the view owner, and RLS on students, installments, payments and receipts is simply not consulted. Anyone who can select from the view sees every row it can reach, whatever their own policies say.
fix:        Recreate the view with `with (security_invoker = true)` in a new migration — or, if it is deliberately a controlled escape hatch for a service role, say so in a comment on the view so the next reader sees a decision instead of an omission.
```

### P2-043 public.v_notion_family_fee_summary does not set security_invoker

```
id:         66b34a387be6
rule:       scan.sql-risk  [heuristic]  layer: static
surface:    supabase/migrations/20260807120000_workbook_financials_conventional_discount.sql:793
expected:   A plain view over student or financial tables declares `with (security_invoker = true)`, as 25 of the 29 live plain views here do.
actual:     The live definition of public.v_notion_family_fee_summary — supabase/migrations/20260807120000_workbook_financials_conventional_discount.sql:793 — sets no `security_invoker` option, so it runs with its owner's privileges.
source:     create view public.v_notion_family_fee_summary as
why:        Without security_invoker a view reads its base tables as the view owner, and RLS on students, installments, payments and receipts is simply not consulted. Anyone who can select from the view sees every row it can reach, whatever their own policies say.
fix:        Recreate the view with `with (security_invoker = true)` in a new migration — or, if it is deliberately a controlled escape hatch for a service role, say so in a comment on the view so the next reader sees a decision instead of an omission.
```

### P3-044 src/app/protected/admin-tools/session-health/session-health-grid.tsx hardcodes the live session 2026-27

```
id:         29e73ec10600
rule:       scan.observation  [heuristic]  layer: static
surface:    src/app/protected/admin-tools/session-health/session-health-grid.tsx:64
expected:   The live session label is written down in as few places as possible, so that the next rollover is a data change rather than a code change.
actual:     "2026-27" appears as a comparison against the live session. Nothing in this module writes through a Supabase client and it is not a "use server" action, so no ledger is at risk — this is inventory of where the live year is baked in, not a defect.
source:     is_current: sessionLabel === "2026-27",
why:        Every hardcoded copy is a place the AY 2027-28 rollover has to find. It also quietly decides for a reader which session they are looking at: a fallback or an is-current comparison that names 2026-27 keeps saying so after the school has moved on.
fix:        Prefer the resolved session — getActiveSessionLabel(), the switcher's value, or FALLBACK_OFFICE_SESSION_LABEL in lib/session/available-sessions.ts, which is the one place this label is meant to live.
```

### P3-045 src/app/protected/exports/page.tsx declares revalidate = 60, which never takes effect

```
id:         274e90575771
rule:       scan.observation  [heuristic]  layer: static
surface:    src/app/protected/exports/page.tsx:13
expected:   A route segment's caching directive describes what actually happens to that segment.
actual:     revalidate = 60 is declared here and cannot apply. src/app/layout.tsx sets dynamic = "force-dynamic" at the root. This surface also reaches cookies() through its auth call, which opts the render out of caching on its own.
source:     export const revalidate = 60;
why:        Not a data-exposure risk today, and deliberately filed as an observation rather than a config risk so it cannot gate: docs/design/design-system.md section 5.6 records the force-dynamic decision and says to leave it alone. What it is, is a line that tells the next reader this page is cached for a minute when it is rendered fresh every time — so a performance investigation starts from a false premise, and if the auth call ever moves the directive is sitting there ready to be believed.
fix:        Delete the directive, or keep it with a comment saying it is aspirational and what would have to change for it to apply.
```

### P3-046 src/app/protected/fee-setup/page.tsx declares revalidate = 60, which never takes effect

```
id:         83bf35a40105
rule:       scan.observation  [heuristic]  layer: static
surface:    src/app/protected/fee-setup/page.tsx:35
expected:   A route segment's caching directive describes what actually happens to that segment.
actual:     revalidate = 60 is declared here and cannot apply. src/app/layout.tsx sets dynamic = "force-dynamic" at the root. This surface also reaches cookies() through its auth call, which opts the render out of caching on its own.
source:     export const revalidate = 60;
why:        Not a data-exposure risk today, and deliberately filed as an observation rather than a config risk so it cannot gate: docs/design/design-system.md section 5.6 records the force-dynamic decision and says to leave it alone. What it is, is a line that tells the next reader this page is cached for a minute when it is rendered fresh every time — so a performance investigation starts from a false premise, and if the auth call ever moves the directive is sitting there ready to be believed.
fix:        Delete the directive, or keep it with a comment saying it is aspirational and what would have to change for it to apply.
```

### P3-047 src/app/protected/students/[studentId]/page.tsx hardcodes the live session 2026-27

```
id:         0f7afa960698
rule:       scan.observation  [heuristic]  layer: static
surface:    src/app/protected/students/[studentId]/page.tsx:1270
expected:   The live session label is written down in as few places as possible, so that the next rollover is a data change rather than a code change.
actual:     "2026-27" appears as a fallback for a value read at runtime. Nothing in this module writes through a Supabase client and it is not a "use server" action, so no ledger is at risk — this is inventory of where the live year is baked in, not a defect.
source:     sessionLabel={financialSnapshot?.policy.academicSessionLabel || "2026-27"}
why:        Every hardcoded copy is a place the AY 2027-28 rollover has to find. It also quietly decides for a reader which session they are looking at: a fallback or an is-current comparison that names 2026-27 keeps saying so after the school has moved on.
fix:        Prefer the resolved session — getActiveSessionLabel(), the switcher's value, or FALLBACK_OFFICE_SESSION_LABEL in lib/session/available-sessions.ts, which is the one place this label is meant to live.
```

### P3-048 src/app/protected/students/[studentId]/page.tsx hardcodes the live session 2026-27

```
id:         ad3e1c783097
rule:       scan.observation  [heuristic]  layer: static
surface:    src/app/protected/students/[studentId]/page.tsx:1410
expected:   The live session label is written down in as few places as possible, so that the next rollover is a data change rather than a code change.
actual:     "2026-27" appears as a fallback for a value read at runtime. Nothing in this module writes through a Supabase client and it is not a "use server" action, so no ledger is at risk — this is inventory of where the live year is baked in, not a defect.
source:     sessionLabel={financialSnapshot?.policy.academicSessionLabel || "2026-27"}
why:        Every hardcoded copy is a place the AY 2027-28 rollover has to find. It also quietly decides for a reader which session they are looking at: a fallback or an is-current comparison that names 2026-27 keeps saying so after the school has moved on.
fix:        Prefer the resolved session — getActiveSessionLabel(), the switcher's value, or FALLBACK_OFFICE_SESSION_LABEL in lib/session/available-sessions.ts, which is the one place this label is meant to live.
```

### P3-049 src/platform/session/available-sessions.ts hardcodes the live session 2026-27

```
id:         84e55bc7a515
rule:       scan.observation  [heuristic]  layer: static
surface:    src/platform/session/available-sessions.ts:17
expected:   The live session label is written down in as few places as possible, so that the next rollover is a data change rather than a code change.
actual:     "2026-27" appears as a named constant. Nothing in this module writes through a Supabase client and it is not a "use server" action, so no ledger is at risk — this is inventory of where the live year is baked in, not a defect.
source:     export const FALLBACK_OFFICE_SESSION_LABEL = "2026-27";
why:        Every hardcoded copy is a place the AY 2027-28 rollover has to find. It also quietly decides for a reader which session they are looking at: a fallback or an is-current comparison that names 2026-27 keeps saying so after the school has moved on.
fix:        Prefer the resolved session — getActiveSessionLabel(), the switcher's value, or FALLBACK_OFFICE_SESSION_LABEL in lib/session/available-sessions.ts, which is the one place this label is meant to live.
```

### P3-050 src/platform/session/available-sessions.ts hardcodes the live session 2026-27

```
id:         f338f189ce40
rule:       scan.observation  [heuristic]  layer: static
surface:    src/platform/session/available-sessions.ts:34
expected:   The live session label is written down in as few places as possible, so that the next rollover is a data change rather than a code change.
actual:     "2026-27" appears as an entry in a literal list. Nothing in this module writes through a Supabase client and it is not a "use server" action, so no ledger is at risk — this is inventory of where the live year is baked in, not a defect.
source:     "2026-27",
why:        Every hardcoded copy is a place the AY 2027-28 rollover has to find. It also quietly decides for a reader which session they are looking at: a fallback or an is-current comparison that names 2026-27 keeps saying so after the school has moved on.
fix:        Prefer the resolved session — getActiveSessionLabel(), the switcher's value, or FALLBACK_OFFICE_SESSION_LABEL in lib/session/available-sessions.ts, which is the one place this label is meant to live.
```

### P3-051 workers/schoolfees-mcp/src/prompts.mjs hardcodes the live session 2026-27

```
id:         6a4ef1318b79
rule:       scan.observation  [heuristic]  layer: static
surface:    workers/schoolfees-mcp/src/prompts.mjs:21
expected:   The live session label is written down in as few places as possible, so that the next rollover is a data change rather than a code change.
actual:     "2026-27" appears as a fallback for a value read at runtime. Nothing in this module writes through a Supabase client and it is not a "use server" action, so no ledger is at risk — this is inventory of where the live year is baked in, not a defect.
source:     const defaultSession = env.SCHOOLFEES_MCP_DEFAULT_SESSION || "2026-27";
why:        Every hardcoded copy is a place the AY 2027-28 rollover has to find. It also quietly decides for a reader which session they are looking at: a fallback or an is-current comparison that names 2026-27 keeps saying so after the school has moved on.
fix:        Prefer the resolved session — getActiveSessionLabel(), the switcher's value, or FALLBACK_OFFICE_SESSION_LABEL in lib/session/available-sessions.ts, which is the one place this label is meant to live.
```

### P3-052 workers/schoolfees-mcp/src/toolkit.mjs hardcodes the live session 2026-27

```
id:         2548978eeea8
rule:       scan.observation  [heuristic]  layer: static
surface:    workers/schoolfees-mcp/src/toolkit.mjs:30
expected:   The live session label is written down in as few places as possible, so that the next rollover is a data change rather than a code change.
actual:     "2026-27" appears as a fallback for a value read at runtime. Nothing in this module writes through a Supabase client and it is not a "use server" action, so no ledger is at risk — this is inventory of where the live year is baked in, not a defect.
source:     .default(env.SCHOOLFEES_MCP_DEFAULT_SESSION || "2026-27")
why:        Every hardcoded copy is a place the AY 2027-28 rollover has to find. It also quietly decides for a reader which session they are looking at: a fallback or an is-current comparison that names 2026-27 keeps saying so after the school has moved on.
fix:        Prefer the resolved session — getActiveSessionLabel(), the switcher's value, or FALLBACK_OFFICE_SESSION_LABEL in lib/session/available-sessions.ts, which is the one place this label is meant to live.
```

### P3-053 workers/schoolfees-mcp/src/tools/orientation.mjs hardcodes the live session 2026-27

```
id:         71c5eebdf8dc
rule:       scan.observation  [heuristic]  layer: static
surface:    workers/schoolfees-mcp/src/tools/orientation.mjs:96
expected:   The live session label is written down in as few places as possible, so that the next rollover is a data change rather than a code change.
actual:     "2026-27" appears as a fallback for a value read at runtime. Nothing in this module writes through a Supabase client and it is not a "use server" action, so no ledger is at risk — this is inventory of where the live year is baked in, not a defect.
source:     return env.SCHOOLFEES_MCP_DEFAULT_SESSION || "2026-27";
why:        Every hardcoded copy is a place the AY 2027-28 rollover has to find. It also quietly decides for a reader which session they are looking at: a fallback or an is-current comparison that names 2026-27 keeps saying so after the school has moved on.
fix:        Prefer the resolved session — getActiveSessionLabel(), the switcher's value, or FALLBACK_OFFICE_SESSION_LABEL in lib/session/available-sessions.ts, which is the one place this label is meant to live.
```

### P3-054 workers/schoolfees-mcp/worker.mjs hardcodes the live session 2026-27

```
id:         474b40f71cd8
rule:       scan.observation  [heuristic]  layer: static
surface:    workers/schoolfees-mcp/worker.mjs:115
expected:   The live session label is written down in as few places as possible, so that the next rollover is a data change rather than a code change.
actual:     "2026-27" appears as a fallback for a value read at runtime. Nothing in this module writes through a Supabase client and it is not a "use server" action, so no ledger is at risk — this is inventory of where the live year is baked in, not a defect.
source:     defaultSession: env.SCHOOLFEES_MCP_DEFAULT_SESSION || "2026-27",
why:        Every hardcoded copy is a place the AY 2027-28 rollover has to find. It also quietly decides for a reader which session they are looking at: a fallback or an is-current comparison that names 2026-27 keeps saying so after the school has moved on.
fix:        Prefer the resolved session — getActiveSessionLabel(), the switcher's value, or FALLBACK_OFFICE_SESSION_LABEL in lib/session/available-sessions.ts, which is the one place this label is meant to live.
```

## Rule index

| Rule | Severity | Count |
|---|---|---:|
| `scan.money-format-raw` | P2 | 25 / 25 |
| `scan.sql-risk` | P2 | 10 / 10 |
| `scan.rounding-policy-mixed` | P2 | 4 / 4 |
| `scan.config-risk` | P2 | 2 / 3 |
| `scan.dead-export` | P2 | 2 |
| `scan.observation` | P3 | 11 / 11 |

_A `count / budget` cell is a P2 or P3 rule measured against the committed baseline. It fails only when the count exceeds the budget._

