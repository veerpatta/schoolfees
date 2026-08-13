import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { isUuid } from "@/lib/helpers/uuid";

const repoRoot = process.cwd();

/**
 * Every `[id]` route segment goes straight into a Postgres `uuid` column, and
 * Postgres does not return "no rows" for a malformed one — it raises
 * `invalid input syntax for type uuid`. That is an unhandled 500 and a Sentry
 * issue, not the not-found page.
 *
 * Three of these reached production Sentry in one afternoon, one of them from a
 * stale link to `/protected/students/families` that matched `[studentId]`.
 */

/** Route segments whose value is used as a UUID. */
const UUID_SEGMENTS = ["studentId", "receiptId", "runId", "familyGroupId"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/^(page\.tsx|route\.tsx?)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const routeFiles = walk(join(repoRoot, "app")).filter((file) => {
  const rel = relative(repoRoot, file).split(sep).join("/");
  return UUID_SEGMENTS.some((segment) => rel.includes(`[${segment}]`));
});

describe("dynamic route uuid guards", () => {
  it("finds the dynamic id routes to check", () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(10);
  });

  it.each(routeFiles.map((file) => relative(repoRoot, file).split(sep).join("/")))(
    "%s rejects a non-uuid id before querying",
    (relativePath) => {
      const source = readFileSync(join(repoRoot, relativePath), "utf8");

      // Either the shared helper, or the one route that still keeps a local
      // pattern (receipts/[receiptId]/detail) — both reject before the query.
      const guarded = source.includes("isUuid(") || source.includes("uuidPattern.test(");

      expect(
        guarded,
        `${relativePath} passes its id straight to a query. A mistyped or stale URL ` +
          "will raise 'invalid input syntax for type uuid' as an unhandled 500. " +
          'Add `if (!isUuid(id)) notFound()` from "@/lib/helpers/uuid" before the first read.',
      ).toBe(true);
    },
  );

  it("accepts real uuids and rejects everything else", () => {
    expect(isUuid("3f0b9e61-1234-4abc-89ab-0123456789ab")).toBe(true);
    expect(isUuid("  3f0b9e61-1234-4abc-89ab-0123456789ab  ")).toBe(true);

    // The literal segment that crashed production.
    expect(isUuid("families")).toBe(false);
    expect(isUuid("9999999")).toBe(false);
    expect(isUuid("smoke-missing-run")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    // Right shape, invalid version/variant nibbles.
    expect(isUuid("3f0b9e61-1234-9abc-89ab-0123456789ab")).toBe(false);
  });
});
