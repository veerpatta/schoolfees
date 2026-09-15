# `src/platform/features` — feature flags and the canary model

Owns (writes): nothing — `/protected/settings/features` writes `feature_flags`
Reads: `feature_flags`
Server entry points: `isFeatureEnabled()`, `getEnabledFeatures()`, `requireFeature()`, `listFeatureFlags()`

## Why this exists

School One extends the app the school runs its day on. There is one deployment
and one database, so "ship it when it's ready" and "don't put a half-finished
screen in front of the office on a Tuesday" are in direct conflict — unless who
can see a thing is data rather than code.

Production carries two admin logins:

| | |
|---|---|
| `director@vpps.co.in` | runs the school. Sees today's fee app, exactly as it is. Never on a flag's list until the feature is finished. |
| `raj@vpps.co.in` | the canary. Sees each School One surface the day it merges, with real data. |

A flag moves in one direction and every step is a click in
`/protected/settings/features`, not a deploy:

```
off for everyone → the canary's user id → the roles that need it → everyone
```

That ordering is the point. The rollback for "this is not ready" has to be
something a person can do in ten seconds while families are waiting at the
counter — not a git revert and a redeploy.

## Using it

```ts
// A whole page or server action behind a flag.
await requireFeature("school_one_placeholder");

// One decision inside something that renders either way.
if (await isFeatureEnabled("school_one_placeholder", { id, role })) { … }

// Every key this person has — one read for a page, which is what nav needs.
const enabledFeatures = await getEnabledFeatures({ id: staff.id, role: staff.appRole });
```

Navigation items carry an optional `featureFlag`. The server resolves the set
and passes it down, because the sidebar is a client component and cannot read
the database:

```
protected/layout.tsx → getEnabledFeatures() → DashboardShell → SidebarNav
                                            → getVisibleProtectedNavigation(role, enabledFeatures)
```

**An item with a `featureFlag` and no set supplied is hidden.** A caller that
has not been taught about flags shows fewer items, never more.

## Rules

- **A flag is not a permission.** It decides whether a surface exists for
  someone yet; `requireStaffPermission` decides whether they may use it. Gated
  pages call both. Turn a flag on for everyone by mistake and the permission
  check is what is still standing there.
- **`requireFeature` answers 404, not 403.** A feature the office is not meant
  to have yet should be invisible. 403 says "this exists and you may not have
  it", which is an invitation to ask about it.
- **Unknown key → false, plus a Sentry warning.** A missing row must not take a
  page down, and hiding the surface is the safe direction to be wrong in.
- **A read failure → false.** A database hiccup must never switch a feature
  *on*.
- **Flags are not secrets.** Every signed-in staff member may read the table;
  knowing a feature exists is not being able to use it. Only `settings:write`
  may change a row.
- **There is no DELETE policy.** A flag is retired by turning it off, so the
  record of what was shown to whom survives.
- **The editor uses the user-JWT client, not the service role.** The RLS
  policies gate writes on `has_permission('settings:write')` and are only
  enforced for a real session; the admin client would silently discard that
  second line of defence.

## Caching

One read for all flags, cached for `FEATURE_FLAG_REVALIDATE_SECONDS` (60) on the
`feature-flags` tag — the same bound and the same reasoning as
`STAFF_PROFILE_REVALIDATE_SECONDS`. The editor busts the tag on every write, so
in practice a change is immediate; the 60 seconds is the ceiling for a change
made anywhere else (a SQL editor, a script).

Turning a flag **off** is the emergency direction. It must not wait.

## Must never

- Use a flag as the only guard on a surface.
- Return 403 from a flag check.
- Throw from `isFeatureEnabled` — a flag is not important enough to break a page.
- Fail open. Every unknown, error and missing-set path resolves to hidden.
- Add a DELETE policy to `feature_flags`.
- Enable a flag for `director@vpps.co.in` in the same step as the deploy that
  introduced it (BUILD-PLAN §8 step 6).
