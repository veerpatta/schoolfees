# Tier 3 Supabase Client Audit

Audit date: 2026-05-17

Scope for this commit: audit only. No Supabase client files, imports, config,
tests, or runtime behavior were changed.

## Requested Grep Audit

Command intent:

```bash
grep -r "from \"@/utils/supabase" --include="*.ts" --include="*.tsx" -l
grep -r "from \"@/utils/supabase" --include="*.ts" --include="*.tsx"
```

Windows execution used the equivalent `rg` form:

```bash
rg -l 'from "@/utils/supabase' -g '*.ts' -g '*.tsx'
rg -n 'from "@/utils/supabase' -g '*.ts' -g '*.tsx'
```

Result: no direct `from "@/utils/supabase..."` importers were found.

## Broader Path Audit

Additional sanity command:

```bash
rg -n '@/utils/supabase' -g '*.ts' -g '*.tsx'
```

Findings:

```text
lib/supabase/client.ts:1:export { createClient } from "@/utils/supabase/client";
lib/supabase/server.ts:1:export { createClient } from "@/utils/supabase/server";
lib/supabase/proxy.ts:1:export { updateSession } from "@/utils/supabase/middleware";
```

Current shape: app code already imports the compatibility wrappers under
`lib/supabase/*`; those wrappers re-export the implementation from
`utils/supabase/*`.

## Files Currently Under `utils/supabase`

| Current file | Purpose | Proposed destination after approval |
| --- | --- | --- |
| `utils/supabase/client.ts` | Browser client for Client Components and event handlers. | `lib/supabase/client.ts` |
| `utils/supabase/server.ts` | Server client for Server Components, Route Handlers, and Server Actions. | `lib/supabase/server.ts` |
| `utils/supabase/middleware.ts` | Middleware/proxy session refresh helper. | `lib/supabase/middleware.ts` |

## Existing `lib/supabase` Files

| Current file | Current role | Tier 3 note |
| --- | --- | --- |
| `lib/supabase/admin.ts` | Service-role client. | Leave as-is. Never import in browser code. |
| `lib/supabase/session.ts` | Auth/session and RBAC guard helpers. | Leave as-is. |
| `lib/supabase/client.ts` | Re-export from `utils/supabase/client.ts`. | Replace with moved browser-client implementation after approval. |
| `lib/supabase/server.ts` | Re-export from `utils/supabase/server.ts`. | Replace with moved server-client implementation after approval. |
| `lib/supabase/proxy.ts` | Re-export from `utils/supabase/middleware.ts`. | Update after the middleware move. |

## Active Import Surface

No source file imports `@/utils/supabase/*` directly. The active import surface
already points to `@/lib/supabase/client`, `@/lib/supabase/server`, or
`@/lib/supabase/proxy`.

Representative callers:

- Browser client: `components/sign-up-form.tsx`,
  `components/forgot-password-form.tsx`, `components/update-password-form.tsx`,
  `components/admin/office-sync-listener.tsx`.
- Server client: app auth routes/actions, protected route actions, and domain
  libs under `lib/dashboard`, `lib/workbook`, `lib/payments`, `lib/fees`,
  `lib/students`, `lib/reports`, `lib/transactions`, and others.
- Proxy helper: root `proxy.ts` imports `updateSession` from
  `@/lib/supabase/proxy`.

## Review Notes Before Moving

1. Because direct app imports already use `lib/supabase/*`, the implementation
   move should mostly replace wrapper files instead of changing every caller.
2. `utils/supabase/middleware.ts` exists, so the approved Tier 3 move list should
   include the middleware helper.
3. `lib/supabase/proxy.ts` currently preserves the app-facing import used by
   root `proxy.ts`; keep that compatibility unless the human explicitly approves
   renaming that import surface too.
4. Keep `lib/supabase/admin.ts` unchanged and server-only.
5. Run the service-role leak checks before merging the implementation commit.
