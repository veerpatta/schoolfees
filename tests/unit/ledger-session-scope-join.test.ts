import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * The Ledger student picker must scope by JOIN, never by a materialised list
 * of student ids.
 *
 * It used to load every scoped student id and hand them to PostgREST's
 * `.in("id", …)`, which serialises into the request URL. On the live session
 * that is 481 uuids — roughly 17,800 characters — and Node rejected the
 * request before it was sent: "Unable to load students for ledger: TypeError:
 * fetch failed". The page was therefore broken on production while working
 * perfectly on TEST-2026-27, which has 79 students (~2,900 characters), so it
 * passed every test and every manual check.
 *
 * That made the supported route for correcting a wrongly-posted payment
 * unusable on the only session where real money is recorded.
 *
 * This is the third time this failure has appeared — see e97f283 (receipt-id
 * filter batched) and d0d43b9 (today's receipt snapshot scoped by join). The
 * rule: never build a PostgREST filter whose length tracks the roster.
 */

describe("ledger session scope", () => {
  const ledger = read("lib/ledger/data.ts");

  it("scopes the student picker through an inner join, not an id list", () => {
    expect(ledger).toContain("installments!inner");
    expect(ledger).toContain("installments.class_ref.session_label");
  });

  it("no longer materialises session student ids", () => {
    expect(ledger).not.toContain("loadSessionScopedStudentIds");
    // The specific shape that broke: a student-id list fed to `.in("id", …)`.
    expect(ledger).not.toMatch(/\.in\(\s*["']id["']\s*,\s*sessionStudentIds/);
  });

  it("keeps the helper deleted so it cannot be reintroduced by autocomplete", () => {
    const scope = read("lib/session/installment-scope.ts");
    expect(scope).not.toContain("export async function loadSessionScopedStudentIds");
    // The note explaining why must survive, or the next person re-adds it.
    expect(scope).toContain("TypeError: fetch failed");
  });

  it("still bounds the picker so it cannot fetch the whole roster", () => {
    expect(ledger).toContain("limit(150)");
  });
});
