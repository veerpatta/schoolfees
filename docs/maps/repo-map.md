# Repo map

**Generated. Do not edit by hand** — run `npm run docs:map`, and CI fails if this
file disagrees with the tree. Eight hand-written copies of this inventory used to
exist and they disagreed with each other; the *why* lives in the per-folder
READMEs, and only the shape is generated here.

## Top level

| Path | What it is |
|---|---|
| `src/` | everything the application ships |
| `supabase/` | schema, migrations, seeds. Stays at the root — the CLI resolves it by convention |
| `tests/` | vitest, the scan, the deep harness, Playwright smokes |
| `scripts/` | operational and quality scripts |
| `quality/` | the budgets CI ratchets: source lines, route bundles, architecture |
| `docs/` | product rules, module guides, maps, QA reports |
| `workers/` | the read-only Cloudflare MCP server — its own bundle, its own entry point |
| `public/` | static assets. Must stay at the root (Next requirement) |

## `src/`

```
src/
├─ app/         Next routes only — page, layout, loading, error, route, actions
├─ modules/     one folder per feature: domain/ data/ ui/
├─ platform/    supabase · auth · config · db · session · i18n · money · helpers …
├─ ui/          the design system: primitives · shell · mobile · hooks …
└─ messages/    en · hi · hi-en catalogues
```

Import direction, enforced by `npm run quality:architecture`:

| Layer | May import |
|---|---|
| `app/` | anything — it is the composition root |
| `modules/<a>/` | `platform`, `ui`, and other modules' `domain/` and `data/` — never their `ui/` |
| `modules/*/domain/` | as above, but never any `data/`: pure rules stay pure |
| `ui/` | `ui` and `platform` only — never a module |
| `platform/` | `platform` only. It is the floor |

## Modules (20)

| Module | Route | domain | data | ui |
|---|---|---:|---:|---:|
| [`activity`](../../src/modules/activity/README.md) | /protected/admin-tools/activity | 0 | 1 | 0 |
| [`dashboard`](../../src/modules/dashboard/README.md) | `/protected/dashboard?view=overview\|collection\|recovery\|classes\|latefee` | 7 | 3 | 14 |
| [`defaulters`](../../src/modules/defaulters/README.md) | /protected/defaulters | 9 | 3 | 17 |
| [`exports`](../../src/modules/exports/README.md) | `/protected/exports` · `/protected/exports/[exportType]` | 1 | 2 | 0 |
| [`fees`](../../src/modules/fees/README.md) | /protected/fee-setup · /protected/fee-structure | 20 | 11 | 7 |
| [`finance-controls`](../../src/modules/finance-controls/README.md) | /protected/finance-controls | 3 | 2 | 1 |
| [`imports`](../../src/modules/imports/README.md) | /protected/imports | 9 | 3 | 9 |
| [`master-data`](../../src/modules/master-data/README.md) | /protected/master-data | 0 | 1 | 1 |
| [`payments`](../../src/modules/payments/README.md) | /protected/payments · /protected/payments/bulk | 17 | 2 | 25 |
| [`prev-year-dues`](../../src/modules/prev-year-dues/README.md) | /protected/admin-tools/prev-year-dues | 6 | 1 | 0 |
| [`promotion`](../../src/modules/promotion/README.md) | /protected/admin-tools/promotion | 0 | 1 | 0 |
| [`receipts`](../../src/modules/receipts/README.md) | /protected/receipts · /r/[code] | 10 | 2 | 15 |
| [`recovery`](../../src/modules/recovery/README.md) | /protected/admin-tools/recovery | 1 | 1 | 0 |
| [`repayment-plans`](../../src/modules/repayment-plans/README.md) | Student detail → repayment plan card | 3 | 1 | 0 |
| [`reports`](../../src/modules/reports/README.md) | /protected/reports · /protected/ledger | 2 | 2 | 2 |
| [`staff`](../../src/modules/staff/README.md) | /protected/staff · /protected/password | 0 | 1 | 2 |
| [`students`](../../src/modules/students/README.md) | /protected/students | 19 | 5 | 60 |
| [`system-sync`](../../src/modules/system-sync/README.md) | — | 5 | 3 | 0 |
| [`transactions`](../../src/modules/transactions/README.md) | /protected/transactions | 2 | 1 | 3 |
| [`whatsapp`](../../src/modules/whatsapp/README.md) | /protected/reminders (+ campaigns, runs) · /protected/admin-tools/whatsapp-templates | 14 | 7 | 11 |

Each module's README says what it owns, its invariants, and what must never
happen there. `src/modules/README.md` indexes them and records why there is no
`index.ts` barrel.

## Platform and design system

`src/platform`: `auth` · `config` · `db` · `excel` · `helpers` · `i18n` · `locale` · `money` · `navigation` · `observability` · `pdf` · `session` · `supabase` · `telemetry`

`src/ui`: `auth` · `branding` · `command` · `data-table` · `design` · `forms` · `hooks` · `mobile` · `office` · `primitives` · `shared` · `shell` · `system` · `telemetry` · `trust`

## Tests

| Folder | Test files | All files |
|---|---:|---:|
| `tests/deep` | 0 | 43 |
| `tests/helpers` | 0 | 2 |
| `tests/integration` | 94 | 94 |
| `tests/scan` | 0 | 25 |
| `tests/smoke-2026-05` | 0 | 6 |
| `tests/smoke-readiness` | 0 | 3 |
| `tests/ui` | 94 | 95 |
| `tests/unit` | 166 | 166 |

`npm run test` runs vitest over two projects — `node` for everything and
`interaction` (jsdom) for `tests/ui/interaction/**`. `tests/scan` and
`tests/deep` are their own harnesses with their own commands. Playwright
(`tests/smoke-readiness`, `tests/smoke-2026-05`) runs separately.

**Many tests assert on source strings and paths.** A rename fails them, and the
fix is to repoint the assertion, not delete it — several encode a bug that
already happened once.

## Largest files

Surfaced because size is the thing a map can measure and a reader cannot.

| Lines | File |
|---:|---|
| 3516 | `src/modules/payments/ui/payment-desk-mobile.tsx` |
| 2130 | `src/modules/payments/data/queries.ts` |
| 2082 | `src/modules/fees/ui/fee-setup-client.tsx` |
| 2058 | `src/app/protected/dashboard/page.tsx` |
| 2007 | `src/modules/imports/data/queries.ts` |
| 1894 | `src/modules/students/data/queries.ts` |
| 1888 | `src/modules/transactions/ui/transactions-client-shell.tsx` |
| 1726 | `src/modules/reports/data/queries.ts` |

The ceilings that stop these growing live in
`quality/office-quality-budgets.json`. They ratchet down, never up.
