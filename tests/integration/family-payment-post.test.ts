import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260521033957_family_payment_id.sql"),
  "utf8",
);

describe("family payment posting migration", () => {
  it("adds a family payment ledger and shared family ids on receipts and payments", () => {
    expect(migration).toContain("create table if not exists public.family_payments");
    expect(migration).toContain("add column if not exists family_payment_id");
    expect(migration).toContain("idx_receipts_family_payment_id");
    expect(migration).toContain("idx_payments_family_payment_id");
  });

  it("posts each child receipt through the locked student payment function inside the family RPC", () => {
    expect(migration).toContain("create or replace function public.post_family_payment");
    expect(migration).toContain("public.post_student_payment_with_adjustments");
    expect(migration).toContain("p_family_payment_id := v_family_payment_id");
    expect(migration).toContain("Family allocation total must match payment total exactly");
  });

  it("keeps child failures transactional by doing all inserts inside one database function", () => {
    expect(migration).toContain("returns table");
    expect(migration).toContain("raise exception 'Family allocation contains a student outside the confirmed family group.'");
    expect(migration).not.toContain("dblink");
  });
});
