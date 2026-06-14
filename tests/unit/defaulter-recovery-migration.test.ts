import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260614193000_defaulter_recovery_state.sql",
);

describe("defaulter recovery state migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("tracks the resolved contact id so promise counters are idempotent", () => {
    expect(sql).toContain("last_resolved_contact_id");
    expect(sql).toContain("references public.defaulter_contacts(id)");
  });

  it("provides a refresh function that resolves promises from receipts without mutating contacts", () => {
    expect(sql).toContain("refresh_defaulter_recovery_state");
    expect(sql).toContain("public.receipts");
    expect(sql).toContain("public.payments");
    expect(sql).toContain("public.installments");
    expect(sql).toContain("classes.session_label = dc.session_label");
    expect(sql).toContain("promise_kept_count");
    expect(sql).toContain("promise_broken_count");
  });

  it("grants authenticated staff execute access to the refresh function", () => {
    expect(sql).toContain("grant execute on function public.refresh_defaulter_recovery_state(text, date) to authenticated");
  });
});
