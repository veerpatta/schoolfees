# CLAUDE.md addendum — School One

Place this file at `docs/school-one/CLAUDE-addendum.md` and add one line to the root `CLAUDE.md`, directly under the existing hard rules:

> **School One work:** read `docs/school-one/CLAUDE-addendum.md` before touching anything outside `src/modules/fees`. Its rules are additive to the rules above and never override them.

---

## What School One is

School One is the same application, extended with staff, academics, timetable, attendance, collection (formerly Sampark), assessments, notes, and reports modules. It is one school's internal tool. It is not a parent portal, not multi-school, and not a rewrite. The fee module is finished and is treated as a dependency, not a workspace.

## Hard rules (School One)

1. **Production is never your database.** Development and preview use the `schoolfees-dev` project or `supabase start`. The runtime guard in `src/platform/env.ts` refuses to boot against the production project ref outside `VERCEL_ENV=production`. If you see `vgqyilgstjvgohrsiwkb` anywhere in your environment, stop and report.
2. **Fee tables are read-only.** No migration, trigger, policy, RPC, or code change touches the tables listed in `docs/school-one/BUILD-PLAN.md` §6, or `src/modules/fees/**`, `src/modules/payments/**`, `src/modules/receipts/**`, `src/modules/promotion/**` (except the one sanctioned `enrolments` insert in Phase 1, item P1.7). All existing financial hard rules in the root `CLAUDE.md` remain in force.
3. **One owner per table.** A module writes only the tables its README lists under "owns". Another module that needs a change calls the owner's server function. Reads are free.
4. **Writes follow one pattern:** `requireStaffPermission()` → `requireClassScope()` (when class-scoped) → admin client. Never trust a `staff_id`, `class_id`, or `student_id` from the client without the scope check. Never use the anon client for a write.
5. **Migrations are append-only and additive.** Never edit an applied migration. Enum values are added in their own migration file; the migration that first uses a value is a separate, later file. Never run `supabase db push` against production from an agent session, and never use `mcp__supabase__apply_migration`.
6. **Every new table has RLS enabled, policies written, and a negative test** proving the wrong role sees zero rows. Append-only tables use `private.prevent_append_only_mutation()`.
7. **No real messages from non-production.** `AISENSY_API_KEY` is absent in dev/preview; `isAisensyConfigured()` must be false there and every send path must no-op with a logged reason. Parent-facing sends are human-pressed. Staff-facing sends may be automatic only where `docs/school-one/decisions.md` says so.
8. **Children's data.** Sensitive fields live in `student_sensitive_details` and are readable only with `students:view_sensitive_all` or as the class teacher of that class. No phone number, Aadhaar, name of a real child, or real staff phone in fixtures, tests, seeds, screenshots, commit messages, or prompts. Exports are logged.
9. **Jobs go through `runJob()`**: per-job secret (`JOB_SECRET_<NAME>`), idempotent, bounded batch, `job_runs` row on every run including failures. A job that can silently not run is a bug.
10. **Timetable data has one source per version.** A published `timetable_versions` row is the truth for "today"; `teaching_assignments` with `source = 'timetable'` are derived from it and regenerated on publish; office overrides are separate rows with `source = 'office'`. Class teachers are never derived from the timetable.
11. **Marks have one save function.** In-app entry and collection-link entry both call `saveMark()`; it checks `assessments.status = 'open'`, validates against `max_marks`, and lets the trigger write `marks_change_log`. No second path.
12. **Attendance corrections need approval.** There is no code path that changes an `attendance_entries.status` except the trigger on an approved `attendance_corrections` row. Not for admins, not for scripts.
13. **Bilingual by construction.** Teacher-facing strings are Hindi-first with English; office-facing English-first with Hindi. All strings through `next-intl` message files; no hard-coded UI text.
14. **Feature flags gate everything new.** Production has two admin logins: `director@vpps.co.in` runs the school (must never see an unfinished School One surface) and `raj@vpps.co.in` is the canary. Every new route, nav item, and job checks `isFeatureEnabled(key, staff)`. A flag is never `enabled_for_all` or enabled for `director@` in the PR that adds the feature; flipping flags is a release step done by Janmejay in the UI. The canary is for *seeing* features with real data; building and breaking happens on the dev project, and any canary write in production goes to `TEST-2026-27`.
15. **Pause-and-report.** If a task needs a file outside its edit list, a table outside its module, a new dependency, or a production credential — stop, write what you found, and wait.

## Validation sequence (before every commit)

```
npm run typecheck && npm run lint && npm run test && npm run build
```

Plus for any PR touching RLS or roles: `npm run smoke:rbac` against the local stack. Plus for any PR touching migrations: `npm run schema:snapshot -- --check` and an updated `supabase/migrations/README.md`.

## Module README template (copy for each new module)

```
# <module>
Owns (writes): <tables>
Reads: <tables>
Server entry points: <functions>
Must never: <three to five lines>
Jobs: <job names, schedule, secret name>
```

## Environment matrix

| Context | VERCEL_ENV | Supabase | AiSensy key | Guard |
|---|---|---|---|---|
| Production | production | prod project | present | allows |
| Preview | preview | schoolfees-dev | absent | refuses prod ref |
| Local | unset | local / dev | absent | refuses prod ref unless `ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION="I understand"` (scripts only) |

## Where things are

- Master plan: `docs/school-one/BUILD-PLAN.md`
- Decisions and defaults you may change: `docs/school-one/decisions.md`
- Prompt packs: `docs/school-one/prompts/phase-N.md`
- Release log: `docs/school-one/RELEASES.md`
- Fixtures (no personal data): `docs/school-one/fixtures/`
