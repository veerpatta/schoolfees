# `src/platform` — the layer everything else stands on

Cross-cutting infrastructure. Nothing in here knows what a fee is.

| Folder | What it is |
|---|---|
| `supabase/` | The five clients — browser, server, admin (service role), middleware/proxy, and the RBAC guards in `session.ts` |
| `auth/` | Role and permission definitions (`roles.ts`) |
| `config/` | School profile, fee rules, navigation |
| `db/` | Generated Supabase types |
| `session/` | Active academic session: resolution, switching, cookie |
| `i18n/` | Locale config, the next-intl request handler, bilingual receipt text |
| `money/` | `glossary.ts` — one canonical definition per money label |
| `helpers/` | Currency and date formatting. `helpers/currency.ts` is the only place rupees get formatted |
| `pdf/` · `excel/` | Document and workbook rendering |
| `navigation/` · `cache/` · `locale/` | Small platform utilities |
| `observability/` · `telemetry/` | Sentry plumbing and office metrics |
| `readiness.ts` | The workflow guard eight modules call before offering an action |
| `env.ts` | Env accessors that throw on a missing or placeholder value |

## The one rule

**Platform may import platform. Nothing else.**

If something in here needs `src/lib`, `src/modules` or `src/ui`, it is not platform —
it belongs in the module that needs it. The direction only ever points inward.

Two things follow, and both are money bugs if you get them wrong:

- `SUPABASE_SERVICE_ROLE_KEY` never reaches the browser. `supabase/admin.ts` is
  server-and-scripts only, and `tests/scan/checks/client-boundary.mjs` recomputes the
  client import graph on every scan to prove it.
- RPCs gated on `public.has_permission(...)` must be called with the **user-JWT** client
  from `supabase/server.ts`, never the admin client — `auth.uid()` is null under a
  service-role JWT and every call raises.

## Where the rest went

`src/ui` holds the design system. `src/lib` and `src/components` are the holding areas
that dissolve into `src/modules/*` — see their READMEs.
