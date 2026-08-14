/**
 * How long a dashboard figure may lag the database, at worst.
 *
 * The tag is the primary mechanism and stays the fast path: a posting busts
 * `session:{label}` and the very next render is exact. This is the floor under
 * it, for the writers that CANNOT bust a tag however carefully anyone codes:
 *
 *   - pg_cron. `sync_repayment_plan_late_fees` charges EMI late fees nightly
 *     and `refresh_workbook_materialized_views_if_requested` runs every two
 *     minutes. Both change what the dashboard reports, from inside Postgres,
 *     where `revalidateTag` does not exist.
 *   - Anything written outside the app: a repair script, a psql session, the
 *     Supabase table editor.
 *   - The next call site that forgets. Tag busting is one line in a file far
 *     from the query it protects. Refunds forgot it. So did the drift repair —
 *     and that one showed the office a school-wide total Rs 54,225 below the
 *     database, with nothing on the page to say which number was real.
 *
 * Without a ceiling a miss is not "stale for a while"; it is stale until
 * something unrelated happens to bust the tag, which can be days.
 *
 * Five minutes: longer than the two-minute matview refresh, so a cache hit
 * still reflects a settled projection rather than one mid-flight, and short
 * enough that nobody needs to plan around it.
 *
 * This is a backstop, not a licence. A money-moving path still has to bust the
 * tag — `tests/unit/money-movers-bust-the-session-tag.test.ts` enforces that —
 * because five minutes of wrong money on a collection morning is five minutes
 * too many.
 */
export const DASHBOARD_STALENESS_CEILING_SECONDS = 300;
