import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function collectFiles(dir: string): string[] {
  const root = join(repoRoot, dir);
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root).flatMap((entry) => {
    const fullPath = join(root, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return collectFiles(relative(repoRoot, fullPath));
    }

    return [relative(repoRoot, fullPath).replaceAll("\\", "/")];
  });
}

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("individual student payment boundary", () => {
  it("does not expose family pay-together payment routes or CTAs in app source", () => {
    const appSourceFiles = ["app", "components", "lib"].flatMap(collectFiles).filter((file) =>
      /\.(ts|tsx)$/.test(file),
    );

    const blockedPatterns = [
      "/protected/payments/family",
      "Pay together",
      "Pay Together",
      "Pay for family",
      "Post family payment",
      "Posting family payment",
    ];

    for (const file of appSourceFiles) {
      const source = readRepoFile(file);
      for (const pattern of blockedPatterns) {
        expect(source, `${file} must not contain ${pattern}`).not.toContain(pattern);
      }
    }
  });

  it("ships a migration that removes the family payment posting RPC", () => {
    const migrations = collectFiles("supabase/migrations").filter((file) => file.endsWith(".sql"));
    const disablingMigration = migrations.find((file) => {
      const sql = readRepoFile(file);
      return (
        sql.includes("drop function if exists public.post_family_payment") &&
        sql.includes("Payments must be posted student-by-student")
      );
    });

    expect(disablingMigration).toBeDefined();
  });

  it("keeps the student payment RPC signature free of family payment parameters", () => {
    const schema = readRepoFile("supabase/schema.sql");
    const paymentRpc = schema.slice(
      schema.indexOf("create or replace function public.post_student_payment_with_adjustments"),
      schema.indexOf("drop policy if exists \"authenticated can update students\""),
    );
    const migrations = collectFiles("supabase/migrations").filter((file) => file.endsWith(".sql"));
    const restoringMigration = migrations.find((file) => {
      const sql = readRepoFile(file);
      return (
        sql.includes("drop function if exists public.post_student_payment_with_adjustments") &&
        sql.includes("uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer, uuid") &&
        sql.includes("grant execute on function public.post_student_payment_with_adjustments") &&
        sql.includes("uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer") &&
        !sql.includes("p_family_payment_id")
      );
    });

    expect(paymentRpc).not.toContain("p_family_payment_id");
    expect(paymentRpc).not.toContain("family_payment_id");
    expect(restoringMigration).toBeDefined();
  });
});
