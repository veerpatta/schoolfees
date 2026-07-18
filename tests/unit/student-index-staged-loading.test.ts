import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Students identity-first loading contract", () => {
  const route = readFileSync("app/protected/students/index/route.ts", "utf8");
  const page = readFileSync("app/protected/students/page.tsx", "utf8");
  const client = readFileSync("components/students/student-quick-load.tsx", "utf8");
  const data = readFileSync("lib/students/data.ts", "utf8");

  it("keeps the legacy full response while adding identity and financial modes", () => {
    expect(route).toContain('mode === "identity"');
    expect(route).toContain('mode === "financial" ? "financial" : "full"');
    expect(route).toContain("getStudentsPage(filters");
  });

  it("renders identities on the server before financial enrichment", () => {
    expect(page).toContain("getStudentsIdentityPage(filters");
    expect(data).toContain("export async function getStudentsIdentityPage");
    expect(data).toContain("financialLoading: true");
  });

  it("loads the financial batch after the identity batch", () => {
    const identityIndex = client.indexOf('loadMode("identity")');
    const financialIndex = client.indexOf('loadMode("financial")');
    expect(identityIndex).toBeGreaterThan(-1);
    expect(financialIndex).toBeGreaterThan(identityIndex);
    expect(client).toContain('surface: mode === "identity" ? "student-identities" : "student-financials"');
  });
});
