import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260521033957_family_payment_id.sql"),
  "utf8",
);

describe("family payment idempotency migration", () => {
  it("uses one unique family client request id and deterministic child request ids", () => {
    expect(migration).toContain("unique (client_request_id)");
    expect(migration).toContain("private.derive_family_child_client_request_id");
    expect(migration).toContain("p_client_request_id || '::' || p_student_id::text");
  });

  it("returns existing family receipts on replay without inserting duplicates", () => {
    expect(migration).toContain("where fp.client_request_id = p_client_request_id");
    expect(migration).toContain("where r.family_payment_id = v_existing_family_payment_id");
    expect(migration).toContain("return query select v_existing_family_payment_id, v_receipt_ids");
  });
});
