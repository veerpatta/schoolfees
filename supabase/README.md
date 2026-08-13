# `supabase/` — Database layer

## Live infrastructure

| Item | Value |
|---|---|
| **Active project** | `vgqyilgstjvgohrsiwkb` — Supabase ap-south-1 (Mumbai) |
| **Project URL** | `https://vgqyilgstjvgohrsiwkb.supabase.co` |
| **Migrations applied** | 181 |
| **Schema objects** | 58 tables, 17 views, 3 materialized views, 33 public + 23 private functions |
| **Backend status** | Mumbai-only; legacy regional project deleted after migration |

The MCP server `supabase` in `.mcp.json` points to the Mumbai project.
No legacy Supabase MCP server is kept in this repo.
Everything in this folder is the source of truth for the database. The web app
(Next.js, in `app/` and `lib/`) only reads schema *through* what these files
produce — it never edits the database structure directly.

## Folder map

| Path | What it is | Edit it? |
|---|---|---|
| `config.toml` | Supabase CLI project config (ports, auth, storage). | Only when changing local CLI behavior. |
| `schema.sql` | Readable snapshot, last regenerated 2026-08-10 at migration `20260810090000` — and **stale since**: its own header lists the objects the late-fee split and dashboard analytics have moved. 427 KB. | **Generated artifact, not the source of truth.** Do not hand-edit. `supabase db dump` needs Docker and **truncates this file to zero bytes without it** — it has done so once. Prefer re-running the pg_catalog introspection described in the file header. |
| `migrations/` | Ordered, append-only schema history. Each file is one migration applied to production. | **Add new files only.** Never rename or rewrite an applied migration — see `migrations/README.md`. |
| `migrations/README.md` | Index of every migration grouped by feature, with one-line summaries. Start here when locating where a feature landed. | Update when adding a new migration so the index stays accurate. |
| `schema/` | Reserved for future modular schema reference docs. Currently just a README. | Add notes when something complex needs explaining outside a migration. |
| `seeds/` | Idempotent SQL seed scripts for `TEST-2026-27`. Test students, test session setup, safe cleanup. Run via SQL editor or `psql`. | Safe to add new seeds. Do not seed against the live `2026-27` session. |
| `seed.sql` | CLI seed entry-point (`supabase db reset` runs this). Currently a stub. | Wire up only if you adopt local CLI-driven resets. |
| `.gitignore`, `.temp/` | Local CLI scratch state. | Ignore. |

## Hard rules (production is live)

1. **Migrations are append-only.** Supabase tracks applied migrations by
   timestamp in `supabase_migrations.schema_migrations` on the remote DB.
   Renaming, deleting, or editing the SQL body of an applied migration
   desyncs production and breaks the next `supabase db push`. To fix a bad
   migration, write a **new** migration that corrects it.
2. **`schema.sql` is a generated dump, not the source of truth.** Migrations
   are. If you find them out of sync, regenerate `schema.sql` from a fresh
   reset of a clean DB — do not patch it by hand.
3. **No experimental writes against the `2026-27` session.** That is live
   school financial data. Use `TEST-2026-27` for everything else
   (see `CLAUDE.md` § Hard Safety Rules). `scripts/bulk-apply.mjs` now enforces
   this in code: it refuses `--session 2026-27` unless `--live` is also passed.
   Nothing else does — every other path relies on you.
4. **`SUPABASE_SERVICE_ROLE_KEY` is server-only.** Nothing in this folder or
   the app should expose it via `NEXT_PUBLIC_*`.
5. **Posted `payments` / `receipts` rows are immutable.** Use the
   `payment_adjustments` audit-trail flow. Do not write migrations that
   `UPDATE` or `DELETE` directly against posted financial rows.
   This is enforced, not just advised: `private.prevent_append_only_mutation()`
   is a `before update or delete` trigger on `payments`, `receipts` and
   `payment_adjustments`, and it raises for the service role too.

### What a bulk change *may* do

Rules 3 and 5 say what is forbidden. The sanctioned path for what is allowed —
changing hundreds of rows at once when no screen in the app can — is
`docs/workflows/agent-bulk-operations.md`, implemented by `scripts/bulk-apply.mjs`:
dry run by default, per-column allowlists, a printed diff, a second opt-in for
anything that changes what a family owes, and an `audit_logs` row per write.

Prefer an existing screen first (`/protected/students/bulk-update`,
`/protected/payments/bulk`, `/protected/imports`) — they already carry RBAC,
session scoping, chunking and cache invalidation that a script has to reinvent.

## Common workflows

### Add a schema change

```bash
supabase migration new <short_snake_case_name>
# edit the generated file in supabase/migrations/
supabase db push                     # apply to linked remote
```

Then update `supabase/migrations/README.md` so the new file appears in the
right feature group with a one-line summary.

### Inspect current schema fast

Open `supabase/schema.sql` (single file, ~215 KB). For a table-by-table view
use the Supabase dashboard → Table Editor.

### Seed a fresh `TEST-2026-27`

```sql
-- in Supabase SQL Editor, as service role:
\i supabase/seeds/01_test_session_setup.sql
\i supabase/seeds/02_test_students_seed.sql
```

Both are idempotent (`ON CONFLICT DO NOTHING`). Never run `03_cleanup_existing_students.sql`
without reading it first — it contains delete blocks.

## Performance notes

The database is actively tuned. Index, materialized-view, and RPC tuning
work lives in migrations under these groups (see migrations index):

- **Performance indexes** — index-only migrations targeting hot query paths
  (Payment Desk lookups, dashboard, transactions filter, defaulters).
- **Workbook engine** — the read-heavy fee projection views and RPCs.
- **Materialized financial views** — landed `2026-05-23`, refreshed via
  triggers; the fastest path for dashboard / dues aggregates.

When the app feels slow, the right move is **not** to reshuffle files in this
folder. It is to:

1. Capture the slow query (Supabase dashboard → Database → Query Performance,
   or `EXPLAIN ANALYZE` in SQL Editor).
2. Confirm whether it's a missing index, a non-sargable predicate in the
   app's `lib/**` code, or a materialized view that needs refreshing more
   often.
3. Land the fix as a **new** migration in `supabase/migrations/`, and add a
   one-liner to the migrations index.

Speculative indexes hurt write performance and bloat the schema. Profile
first, then index.
