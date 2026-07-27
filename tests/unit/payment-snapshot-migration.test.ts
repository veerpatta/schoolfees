import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260727184500_freeze_payment_snapshot_without_temp_table.sql",
  ),
  "utf8",
);
const schema = readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8");

describe("payment snapshot lint hardening", () => {
  it("freezes the workbook snapshot once without a temporary table", () => {
    for (const source of [migration, schema]) {
      expect(source).toContain("into v_workbook_snapshot");
      expect(source).toContain("jsonb_to_recordset(v_workbook_snapshot)");
      expect(source).not.toContain("tmp_workbook_snapshot");
    }
  });

  it("preserves invoker security and restricted RPC grants", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated, service_role");
  });
});
