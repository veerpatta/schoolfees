# `src/ui` — the design system

Everything a screen is built from, and nothing about what a screen means.

| Folder | What it is |
|---|---|
| `primitives/` | The shadcn-style building blocks — button, card, sheet, tabs, money. Generic only |
| `shell/` | The workspace chrome: sidebar, top bar, session pill, mobile tab bar, route progress |
| `mobile/` | Phone-specific primitives — sheets, steppers, pickers, the connection pill |
| `forms/` · `data-table/` · `shared/` | Form scaffolding, table furniture, cross-module chrome |
| `command/` | The Cmd/Ctrl+K palette and its providers |
| `hooks/` | Shared client hooks — media query, haptics, scroll lock, URL filter state |
| `auth/` · `branding/` · `trust/` · `system/` · `office/` | Sign-in forms, the school mark, audit chips, theme and service-worker mounts |
| `design/` | Density context and the office design tokens |
| `telemetry/` | Web-vitals and office-metric reporters |

## The one rule

**`src/ui` may import `src/platform`. It must never import a module.**

A primitive that knows about fees is not a primitive. If a component needs a
student, a receipt or an installment, it belongs in that module's `ui/` folder,
not here — pass the data in as props instead.

The direction matters because it is what keeps this folder reusable and what
keeps the route bundles small: `/protected/dashboard` sits under a gzip ceiling
in `quality/route-bundle-baseline.json`, and a primitive that drags a domain
module in behind it costs every route that renders it.

## Money is not a string

Rupees are formatted in exactly one place — `src/platform/helpers/currency.ts` —
and rendered through `primitives/money.tsx`. Raw `toLocaleString('en-IN')`,
`Intl.NumberFormat('en-IN')` and hand-written `₹`/`Rs.` are CI errors here;
`npm run quality:budgets` walks `src/app`, `src/components` and `src/ui` looking
for them. A deliberate exception needs `// @allow-raw-money-format` and a reason.
