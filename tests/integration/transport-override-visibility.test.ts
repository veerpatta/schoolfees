import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A transport override IS transport.
 *
 * Transport is charged two ways -- a route, or
 * `student_fee_overrides.custom_transport_fee_amount` with no route at all.
 * The money was right everywhere; the LABELS were not: eight call sites
 * handed `buildTransportRouteLabel` a route and no amount, so it fell through
 * to "No transport" beside a real transport charge, and every route-grouped
 * board keyed on `transport_route_id` filed those students under "No
 * transport" or dropped them. These assertions hold the fix in place.
 */
const read = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

describe("every route label call carries the charge", () => {
  it.each([
    ["src/modules/reports/data/queries.ts", 4],
    ["src/modules/defaulters/data/queries.ts", 1],
    ["src/modules/fees/data/queries.ts", 1],
    ["src/modules/receipts/data/queries.ts", 1],
  ])("%s passes an amount on every buildRouteLabel call", (file) => {
    const source = read(file);
    // The two-argument wrapper exists in each file; a call with ONE argument
    // is the bug.
    expect(source).not.toMatch(/buildRouteLabel\([^,()]*\)/);
  });

  it("the identity page reads the override rather than defaulting to no transport", () => {
    expect(read("src/modules/students/data/queries.ts")).toContain(
      "customTransportFeeAmount: readActiveCustomTransportAmount(row.fee_override)",
    );
  });
});

describe("route-grouped surfaces give the override its own bucket", () => {
  it("the dashboard route rollup no longer drops students without a route id", () => {
    const source = read("src/modules/dashboard/data/queries.ts");
    expect(source).not.toContain("if (!row.transport_route_id) continue;");
    expect(source).toContain("CUSTOM_TRANSPORT_BUCKET_LABEL");
  });

  it("the MCP worker groups by route with a custom bucket", () => {
    expect(read("workers/schoolfees-mcp/src/tools/students.mjs")).toContain('"custom_transport"');
  });

  it("the route pickers offer the custom bucket and the filters honour it", () => {
    expect(read("src/modules/students/ui/student-quick-load.tsx")).toContain("transportRouteCustom");
    expect(read("src/modules/defaulters/ui/defaulter-filters.tsx")).toContain("filterRouteCustom");
    expect(read("src/modules/transactions/ui/transactions-client-shell.tsx")).toContain("filterRouteCustom");
    expect(read("src/app/protected/reports/page.tsx")).toContain("CUSTOM_TRANSPORT_BUCKET_LABEL");
    expect(read("src/modules/students/domain/filter-params.ts")).toContain("CUSTOM_TRANSPORT_ROUTE_KEY");
    expect(read("src/modules/students/data/directory.ts")).toContain('.eq("seg_on_transport", true)');
    for (const file of [
      "src/modules/reports/data/queries.ts",
      "src/modules/defaulters/data/queries.ts",
      "src/modules/fees/data/queries.ts",
    ]) {
      expect(read(file), file).toContain("matchesTransportRouteFilter(");
    }
  });

  it("every locale carries the picker label", () => {
    for (const locale of ["en", "hi", "hi-en"]) {
      const messages = JSON.parse(read(`src/messages/${locale}.json`));
      expect(messages.Students.transportRouteCustom).toBeTruthy();
      expect(messages.Defaulters.filterRouteCustom).toBeTruthy();
      expect(messages.Transactions.filterRouteCustom).toBeTruthy();
    }
  });

  it("the SQL route board learns the bucket and asserts it took", () => {
    const migrations = join(process.cwd(), "supabase/migrations");
    const file = readdirSync(migrations)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .filter((name) => readFileSync(join(migrations, name), "utf8").includes("'Custom amount (no route)'"))
      .at(-1);
    expect(file).toBeTruthy();
    const sql = readFileSync(join(migrations, file!), "utf8");
    expect(sql).toContain("pg_get_functiondef");
    expect(sql).toContain("'routeKey'");
    expect(sql).toContain("does not carry the custom transport bucket after patching");
    expect(sql).toContain("drop view if exists public.v_transport_route_outstanding");
  });
});
