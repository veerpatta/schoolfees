# Phase 0 — execution log

One entry per prompt, written as each is finished: what was committed, the
evidence its acceptance criteria were actually met, and every deviation from
the prompt as written.

Prompts P0.0 (kickoff), P0.1 (manual) and P0.2 (dev bootstrap) were completed in
earlier sessions; see `kickoff-report.md`, `inventory-phase-0.md` and
`dev-environment.md`. This file starts at P0.3.

Database throughout: `wtgxcptmucjerhufzjcf` (dev). Production was never a target.

---

## P0.3 — Production write guard

**Commits:** see `git log` for `feat(school-one): refuse to start against the live school database`

### Acceptance

| Criterion | Evidence |
|---|---|
| Unit tests pass | `tests/unit/db-target-guard.test.ts` — **15 tests**, all green |
| `npm run build` passes | exit 0 |
| Preview + production ref refuses | command and output below |
| Dev banner shows locally | rendered HTML below |
| Full suite green | **372 files / 3,180 tests**, exit 0 (was 371/3,165 before this prompt) |

**The refusal**, exactly as run:

```
VERCEL_ENV=preview \
NEXT_PUBLIC_SUPABASE_URL=https://vgqyilgstjvgohrsiwkb.supabase.co \
PRODUCTION_SUPABASE_PROJECT_REF=vgqyilgstjvgohrsiwkb \
npm run start
```

```
Failed to prepare server Error [DatabaseTargetError]: An error occurred while
loading instrumentation hook: Refusing to start: this environment
(VERCEL_ENV=preview) is pointed at the PRODUCTION Supabase project. Fix the
environment variables.
```

The server never becomes ready, so every request 500s rather than being served
from the wrong database. Note the process does not exit on its own — Next
reports `unhandledRejection` and hangs; on Vercel the deployment is visibly
broken, which is the intent, but it is not a clean `exit 1`.

**The allow that matters just as much.** The Vercel preview of this branch is
dev ref + `VERCEL_ENV=preview`. If the guard were too eager, every preview would
stop booting:

```
VERCEL_ENV=preview npm run start
→ ✓ Ready in 220ms
```

**The banner**, served at `/auth/login` against the dev project:

```html
<div role="status" aria-live="polite" data-testid="dev-database-banner" …>
  <p …>DEV DATABASE — wtgxcptmucjerhufzjcf — not the live school data</p>
  <p …>विकास डेटाबेस — wtgxcptmucjerhufzjcf — यह स्कूल का असली डेटा नहीं है</p>
</div>
```

**The script guard**, via `scripts/bulk-apply.mjs`:

```
NEXT_PUBLIC_SUPABASE_URL=https://vgqyilgstjvgohrsiwkb.supabase.co node scripts/bulk-apply.mjs --help
  ✖  Refusing to start: this environment (VERCEL_ENV=unset) is pointed at the
     PRODUCTION Supabase project.                                    → exit 1

node scripts/bulk-apply.mjs --help                                   → exit 0
```

### Deviations and judgement calls

- **The `.mjs` guard loads `.env.local` itself.** The prompt says import it as
  the first line of `bulk-apply.mjs`, and that script loads its own environment
  at line 62 — long after an import has been evaluated. A guard that runs before
  the environment exists reads nothing and allows everything, so the guard loads
  the same files first (the loader skips keys already set, so the later load is
  a no-op). Without this the guard would have been decorative.
- **Guard logic is duplicated, not shared,** between `src/platform/db-target.ts`
  and `scripts/lib/db-target-guard.mjs`. The scripts are plain ESM with no build
  step and no `@/` alias; importing the TypeScript module would have meant a
  build dependency in the one place that must never fail to load. Both carry a
  `SHARED RULE` comment naming the other.
- **`kind: "unknown"` is refused-by-omission, not treated as dev.** An
  unreadable `NEXT_PUBLIC_SUPABASE_URL` is not a safe target, but it is also not
  production, so the guard allows it and `getDatabaseTarget()` reports `unknown`
  rather than guessing `dev`. The banner shows "unrecognised" for it, which is
  the visible half of the same answer.
- **Corrected the stale `// Goes at REPO ROOT: instrumentation.ts` comment** in
  `src/instrumentation.ts`, as the prompt permits — the file is at
  `src/instrumentation.ts` and there is no root copy.
- **Banner strings went into all three catalogues**, not two: the repo has
  `en`, `hi` and `hi-en`. The English line follows the active locale; the Hindi
  line is always shown beneath it except when the app is already in Hindi, where
  it would be a duplicate. A warning most of the office cannot read is not a
  warning.
- **The banner sits outside the providers** in `layout.tsx`. It must not be able
  to fail because a theme, locale or provider failed.
- `resetDatabaseTargetWarningsForTests()` is exported solely so the warn-once
  path can be asserted more than once in a suite. Nothing in the app calls it.
