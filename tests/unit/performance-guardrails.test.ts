import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("office performance guardrails", () => {
  it("keeps dashboard overdue counts on the already-loaded installment rows", () => {
    const dashboardData = readRepoFile("lib/dashboard/data.ts");

    expect(dashboardData).not.toContain("overdue workbook installments");
    expect(dashboardData).toContain('row.balanceStatus === "overdue"');
    expect(dashboardData).toContain("row.pendingAmount > 0");
    expect(dashboardData).toContain('.gt("refundable_amount", 0)');
  });

  it("keeps interactive Transactions limited while allowing full exports", () => {
    const officeDues = readRepoFile("lib/office/dues.ts");
    const exportRoute = readRepoFile("app/protected/transactions/export/route.ts");

    expect(officeDues).toContain("exportAll?: boolean");
    expect(officeDues).toContain("limit: filters.exportAll ? null : undefined");
    expect(exportRoute).toContain("exportAll: true");
  });

  it("documents additive indexes for common office filters", () => {
    const migration = readRepoFile(
      "supabase/migrations/20260503143000_office_performance_indexes.sql",
    );
    const schema = readRepoFile("supabase/schema.sql");
    const expectedIndexes = [
      "idx_classes_session_status_sort",
      "idx_students_active_class_name",
      "idx_students_active_route_name",
      "idx_students_admission_no_lookup",
      "idx_receipts_payment_date_created_at",
      "idx_receipts_duplicate_guard_lookup",
      "idx_installments_student_status_due_date",
      "idx_installments_class_status_due_date",
    ];

    for (const indexName of expectedIndexes) {
      expect(migration).toContain(`create index if not exists ${indexName}`);
      expect(schema).toContain(`create index if not exists ${indexName}`);
    }

    expect(migration).not.toContain("drop index");
    expect(migration).not.toContain("drop constraint");
  });
});
