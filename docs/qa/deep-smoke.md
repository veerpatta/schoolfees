# Deep smoke sweep

`tests/smoke-2026-05/` — the wide sweep. Everything runs against `TEST-2026-27`
on whatever `SCHOOLFEES_SMOKE_BASE_URL` points at (production by default).

The narrower read-only readiness pass is `docs/qa/readiness-smoke.md`.

## One-time: the five QA logins

The sweep signs in as all five roles, because the failure it exists to catch is
invisible to an admin: **a page whose permission guard is missing renders
perfectly.** It looks like a working screen. The only way to see it is to visit
it as somebody who should have been turned away.

```bash
node scripts/bootstrap-test-staff.mjs
```

That creates (or re-points) `qa.admin@`, `qa.accountant@`, `qa.teacher@`,
`qa.collector@` and `qa.viewonly@qa.vpps.local` using the `TEST_STAFF_PASSWORD`
you set. Pick a password you are willing to keep in your shell for the run.
`--disable` deactivates all five without deleting them.

## Running it

```bash
$env:SMOKE_TEST_STAFF_PASSWORD = "<the password you just used>"
npm run smoke:deep:auth
```

That captures one storage state per role into `tests/smoke-2026-05/.auth/`
(gitignored). Then:

```bash
npm run smoke:rbac
```

145 checks — 5 roles × 29 protected routes. For each it asserts the role either
reaches the page or lands on `/protected/access-denied`, never a 500, never a
bounce to the login screen. Console errors are reported but do not fail the
permission check.

```bash
npm run smoke:deep
```

The whole thing: sign-ins, the RBAC matrix, and the existing deep route sweep
across desktop / mobile / tablet.

## Environment

| Variable | Default | What it does |
|---|---|---|
| `SMOKE_TEST_STAFF_PASSWORD` | — | One password for all five QA logins. `TEST_STAFF_PASSWORD` also works, so one export covers bootstrap and smoke. |
| `SMOKE_PASSWORD_<ROLE>` | — | Per-role override, e.g. `SMOKE_PASSWORD_ADMIN`. |
| `SMOKE_ROLES` | all five | Comma-separated subset, e.g. `admin,teacher`. |
| `SCHOOLFEES_SMOKE_BASE_URL` | `https://schoolfees-two.vercel.app` | Target. Set `http://localhost:3000` to sweep a dev server. |
| `SCHOOLFEES_SMOKE_SESSION` | `TEST-2026-27` | Session appended to every route. |
| `SMOKE_HEADED=1` | off | Show the browser. |
| `SMOKE_RECORD_HAR=1` | off | Record full HAR with embedded content. Gigabytes across a full sweep — turn it on for one flow, not the sweep. |
| `SMOKE_ALLOW_TEST_PAYMENT=1` | off | Lets `special-flows.spec.ts` post a ₹100 cash payment. Refuses unless the student's admission number starts with `TEST-`. |

No password is stored in the repo. Playwright reads it from the environment and
does the typing; `.auth/` is gitignored.

## The permission matrix

`rbac.spec.ts` keeps its own copy of the role → permission table, deliberately.
If it drifts from `lib/auth/roles.ts` the test fails and somebody has to decide
which one is right. That is what a second copy of a permission matrix is for.

Route guards it encodes come from the pages themselves — `requireStaffPermission`
for a single permission, `requireAnyStaffPermission` for the `anyOf` entries.
Add a route to `ROUTES` when you add a page, or it is not covered.

## Not covered here

Payment posting, import commit, fee edits and recovery collection are exercised
by `special-flows.spec.ts` (desktop only, admin only) and by the interactive
pass, not by the RBAC matrix. The matrix answers "who can open this", not
"does the money work".
