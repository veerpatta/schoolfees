import { describe, expect, it } from "vitest";

import { getSetupLockedMessage } from "@/lib/setup/copy";

describe("setup lock copy", () => {
  it("sends live fee changes to Fee Setup once setup is complete", () => {
    expect(getSetupLockedMessage("policy")).toContain("Use Fee Setup");
    expect(getSetupLockedMessage("defaults")).toContain("Use Fee Setup");
  });

  it("sends live class and route upkeep to School Setup Lists", () => {
    expect(getSetupLockedMessage("master_data")).toContain("School Setup Lists");
  });
});
