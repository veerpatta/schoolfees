import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("payment posting revalidates affected paths (audit 1.8)", () => {
  const actions = readFileSync(
    join(process.cwd(), "app/protected/payments/actions.ts"),
    "utf8",
  );

  it("submitPaymentEntryAction imports revalidateAfterPaymentPosting", () => {
    expect(actions).toContain('import { revalidateAfterPaymentPosting }');
    expect(actions).toContain('@/lib/system-sync/finance-revalidation');
  });

  it("the post-payment branch calls both revalidateSessionFinance and revalidateAfterPaymentPosting", () => {
    const idx = actions.indexOf("revalidateSessionFinance(resolvedSessionLabel");
    expect(idx).toBeGreaterThan(0);
    const slice = actions.slice(idx, idx + 600);
    expect(slice).toContain("revalidateAfterPaymentPosting([studentId])");
  });

  it("PAYMENT_AFFECTED_PATHS still lists Dashboard/Transactions/Receipts/Defaulters", () => {
    const helper = readFileSync(
      join(process.cwd(), "lib/system-sync/finance-revalidation.ts"),
      "utf8",
    );
    expect(helper).toContain('"/protected/dashboard"');
    expect(helper).toContain('"/protected/transactions"');
    expect(helper).toContain('"/protected/receipts"');
    expect(helper).toContain('"/protected/defaulters"');
  });
});
