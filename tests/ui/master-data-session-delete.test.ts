import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("Master Data session delete confirmation (audit 1.23)", () => {
  const source = readFileSync(
    join(process.cwd(), "components/master-data/master-data-client.tsx"),
    "utf8",
  );

  it("session-delete form requires a typed confirmation echoing the session label", () => {
    expect(source).toMatch(/action=\{deleteSessionFormAction\}/);
    // The delete form must intercept onSubmit and prompt for the label.
    expect(source).toMatch(/Delete academic session "\$\{session\.session_label\}"\?/);
    expect(source).toMatch(/typed\.trim\(\) !== session\.session_label/);
  });

  it("cancel (typed === null) aborts the submit", () => {
    expect(source).toMatch(/if \(typed === null\) \{\s*\n\s*event\.preventDefault\(\);/);
  });
});
