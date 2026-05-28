import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("MissingDuesBanner shared component (audit 1.13 + 1.14)", () => {
  const source = readFileSync(
    join(process.cwd(), "components/shared/missing-dues-banner.tsx"),
    "utf8",
  );

  it("renders nothing when there is neither a missingCount nor a ledger sync error", () => {
    expect(source).toMatch(
      /if \(!showMissingCount && !showLedgerError\) \{\s*\n\s*return null;\s*\n\s*\}/,
    );
  });

  it("ledger-sync-error message wins over the missingCount headline (Imports trumps Defaulters when both)", () => {
    expect(source).toMatch(/showMissingCount =[\s\S]+!ledgerSyncError/);
  });

  it("uses role=alert and carries a data-component attribute for testability", () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain('data-component="missing-dues-banner"');
  });
});

describe("Defaulters page mounts the missing-dues banner (audit 1.14)", () => {
  const page = readFileSync(
    join(process.cwd(), "app/protected/defaulters/page.tsx"),
    "utf8",
  );

  it("imports MissingDuesBanner and passes data.missingDuesRows.length", () => {
    expect(page).toContain('from "@/components/shared/missing-dues-banner"');
    expect(page).toContain("<MissingDuesBanner missingCount={data.missingDuesRows.length} />");
  });
});

describe("Imports page surfaces ledger-sync errors as the banner (audit 1.13)", () => {
  const page = readFileSync(
    join(process.cwd(), "app/protected/imports/page.tsx"),
    "utf8",
  );

  it("only escalates errors that explicitly mention 'dues sync needs attention'", () => {
    expect(page).toContain('"dues sync needs attention"');
    expect(page).toContain('ledgerSyncError={ledgerSyncErrorMessage}');
  });
});
