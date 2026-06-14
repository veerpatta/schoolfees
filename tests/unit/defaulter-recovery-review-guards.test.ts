import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("defaulter recovery review guards", () => {
  const contactsSource = readFileSync(
    join(process.cwd(), "lib/defaulters/contacts.ts"),
    "utf8",
  );
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it("filters recovery-state reads by requested student ids at query level", () => {
    expect(contactsSource).toContain(".in(\"student_id\", studentIds)");
  });

  it("keeps qrcode runtime dependency separate from TypeScript-only typings", () => {
    expect(packageJson.dependencies).toHaveProperty("qrcode");
    expect(packageJson.dependencies).not.toHaveProperty("@types/qrcode");
    expect(packageJson.devDependencies).toHaveProperty("@types/qrcode");
  });
});
