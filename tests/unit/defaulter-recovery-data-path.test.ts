import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("defaulter recovery data path", () => {
  const dataSource = readFileSync(
    join(process.cwd(), "src/modules/defaulters/data/queries.ts"),
    "utf8",
  );
  const contactsSource = readFileSync(
    join(process.cwd(), "src/modules/defaulters/data/contacts.ts"),
    "utf8",
  );

  it("refreshes persisted promise outcomes before reading promise reliability", () => {
    expect(contactsSource).toContain("refreshDefaulterRecoveryState");
    expect(dataSource).toContain("refreshDefaulterRecoveryState(resolvedSessionLabel)");
    expect(dataSource.indexOf("await refreshDefaulterRecoveryState")).toBeLessThan(
      dataSource.indexOf("? getPromiseReliabilityForStudents"),
    );
  });
});
