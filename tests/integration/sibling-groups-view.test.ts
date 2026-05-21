import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { detectSiblingGroupsFromRows } from "@/lib/students/sibling-normalization";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260521031342_v_student_sibling_groups.sql",
);

describe("sibling groups view", () => {
  it("defines a security-invoker sibling group view with explicit grants", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create or replace view public.v_student_sibling_groups");
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("grant select on public.v_student_sibling_groups to authenticated");
    expect(migration).toContain("grant select on public.v_student_sibling_groups to service_role");
    expect(migration).toContain("student_family_groups");
    expect(migration).toContain("student_family_members");
  });

  it("emits confirmed and suspected groups while filtering placeholder phones", () => {
    const rows = [
      {
        studentId: "00000000-0000-4000-8000-000000000001",
        sessionLabel: "TEST-2026-27",
        phone: "81234 56789",
        fatherName: "Raj Singh",
        existingFamilyGroupId: "11111111-1111-4111-8111-111111111111",
      },
      {
        studentId: "00000000-0000-4000-8000-000000000002",
        sessionLabel: "TEST-2026-27",
        phone: "8123456789",
        fatherName: "Raj  Singh",
        existingFamilyGroupId: "11111111-1111-4111-8111-111111111111",
      },
      {
        studentId: "00000000-0000-4000-8000-000000000003",
        sessionLabel: "TEST-2026-27",
        phone: "73400-11122",
        fatherName: "Meena Lal",
        existingFamilyGroupId: null,
      },
      {
        studentId: "00000000-0000-4000-8000-000000000004",
        sessionLabel: "TEST-2026-27",
        phone: "7340011122",
        fatherName: "Different Name",
        existingFamilyGroupId: null,
      },
      {
        studentId: "00000000-0000-4000-8000-000000000005",
        sessionLabel: "TEST-2026-27",
        phone: "9999999999",
        fatherName: "Placeholder Phone",
        existingFamilyGroupId: null,
      },
      {
        studentId: "00000000-0000-4000-8000-000000000006",
        sessionLabel: "TEST-2026-27",
        phone: "9999999999",
        fatherName: "Placeholder Phone",
        existingFamilyGroupId: null,
      },
    ];

    const groups = detectSiblingGroupsFromRows(rows);

    expect(groups).toHaveLength(2);
    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phoneMatch: ["8123456789"],
          studentCount: 2,
          confidence: "confirmed",
          fatherNameMatch: true,
          existingFamilyGroupId: "11111111-1111-4111-8111-111111111111",
        }),
        expect.objectContaining({
          phoneMatch: ["7340011122"],
          studentCount: 2,
          confidence: "suspected",
          fatherNameMatch: false,
          existingFamilyGroupId: null,
        }),
      ]),
    );
  });
});
