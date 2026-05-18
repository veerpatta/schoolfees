# Test Environment Isolation

VPPS fee app test data is moving away from `session_label = 'TEST...'` as the
main safety boundary. A label is easy to filter incorrectly. The new lightweight
boundary is schema-level isolation.

## Option A: Single Supabase Project, Two Deployments

Use one Supabase project and two Vercel deployments:

- Production deployment: `APP_MODE=production`
- Staging deployment: `APP_MODE=test`

In `APP_MODE=test`, server-side Supabase clients target the `test` schema. The
operational tables are mirrored there:

- `students`
- `installments`
- `payments`
- `receipts`
- `payment_adjustments`
- `refund_requests`
- `student_fee_overrides`
- `student_conventional_discount_assignments`
- `import_batches`
- `import_rows`

Shared catalogue/reference data remains physically in `public` and is exposed
to test mode through read-only `test` schema views. This keeps classes, routes,
fee policies, fee settings, and staff lookup available without copying those
catalogues into the test schema.

Important Supabase dashboard setting: the `test` schema must be exposed to the
Data API for staging to use `db.schema = "test"`.

## Moving Existing TEST Rows

After deploying the `test_schema_init` migration, run the one-time script:

```bash
npx tsx scripts/migrate-test-data-to-test-schema.ts
```

The script:

1. Finds `public.students` whose class belongs to a `TEST%` session.
2. Copies those students and related operational rows into the `test` schema.
3. Verifies row counts in `test`.
4. Prompts the operator before deleting copied rows from `public`.
5. Prints a JSON report.

Deletion requires typing:

```text
DELETE PUBLIC TEST DATA
```

If public `receipt_adjustments` still reference TEST students, deletion stops.
That table is not mirrored in this lightweight phase.

## Verification

After the script deletes copied public rows, verify production has no TEST
students left:

```sql
select count(*)
from public.students as student
where exists (
  select 1
  from public.classes as class
  where class.id = student.class_id
    and class.session_label like 'TEST%'
);
```

Expected result: `0`.

A stricter class-ID version is:

```sql
select count(*)
from public.students
where class_id in (
  select id
  from public.classes
  where session_label like 'TEST%'
);
```

Expected result: `0`.

## Why TEST Session Labels Are Being Retired

`TEST-2026-27`, `UAT-2026-27`, and `DEMO-2026-27` remain accepted by the session
parser for old URLs, exports, and operator muscle memory. They should no longer
be the primary data boundary.

The problem with string discipline is that every query path must remember to
exclude or include the label correctly. Schema isolation makes the default safer:

- production clients read and write `public`
- staging clients read and write `test`
- shared catalogues stay read-only references

## Option B: Separate Supabase Project

The cleaner long-term staging model is a separate Supabase project.

Recommended migration path:

1. Provision a new Supabase project for staging.
2. Point the staging Vercel deployment at the new project URL and keys.
3. Run the normal migrations in the new project.
4. Export the current single-project `test` schema.
5. Import that data into the new project's `public` schema.
6. Set staging `APP_MODE=production` in the new project, because the project
   itself becomes the boundary.

Conceptually, step 4 to 5 is:

```bash
pg_dump --schema=test --data-only --no-owner --no-privileges "$OLD_DATABASE_URL" > test-data.sql
# Restore into the new staging project after mapping schema test -> public.
```

Once Option B is complete, production and staging have separate databases,
separate auth users if desired, separate storage, separate logs, and separate
backup/restore paths. That is safer for long-term UAT and staff training than a
single-project schema split.
