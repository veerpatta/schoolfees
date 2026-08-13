/**
 * Is this string a UUID?
 *
 * Every `[studentId]` / `[receiptId]` / `[runId]` segment goes straight into a
 * Postgres `uuid` column. Postgres does not return "no rows" for a malformed
 * one — it raises `invalid input syntax for type uuid`, which surfaces as an
 * unhandled 500 and a Sentry issue rather than the not-found page.
 *
 * That is not hypothetical: a stale link to `/protected/students/families`
 * matched `[studentId]`, and the page crashed with
 * `invalid input syntax for type uuid: "families"`. A staff member with an old
 * bookmark or a mistyped URL gets the same crash.
 *
 * Guard the route segment *before* the first query and call `notFound()`.
 * Checking the query result afterwards is too late — the throw happens first.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}
