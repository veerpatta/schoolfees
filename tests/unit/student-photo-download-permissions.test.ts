import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { rolePermissions, type StaffRole } from "@/platform/auth/roles";
import { STUDENT_PHOTO_DOWNLOAD_PERMISSIONS } from "@/modules/students/domain/photo-permissions";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

function rolesHolding(permissions: readonly string[]) {
  return (Object.keys(rolePermissions) as StaffRole[])
    .filter((role) =>
      permissions.some((permission) =>
        (rolePermissions[role] as readonly string[]).includes(permission),
      ),
    )
    .sort();
}

/**
 * Looking at a child's photograph and keeping a copy of it are different acts.
 * The first is `students:view`, which every role holds; the second leaves the
 * school and nothing downstream can recall it.
 */
describe("who may download a student photo", () => {
  it("is admin and teacher, and nobody else", () => {
    expect(rolesHolding(STUDENT_PHOTO_DOWNLOAD_PERMISSIONS)).toEqual(["admin", "teacher"]);
  });

  it("excludes the three roles that may only look", () => {
    for (const role of ["accountant", "fee_collector", "view_only"] as StaffRole[]) {
      expect(rolePermissions[role]).toContain("students:view");
      expect(
        rolesHolding(STUDENT_PHOTO_DOWNLOAD_PERMISSIONS),
        `${role} may download`,
      ).not.toContain(role);
    }
  });

  it("is a strict subset of who may view a student", () => {
    for (const role of rolesHolding(STUDENT_PHOTO_DOWNLOAD_PERMISSIONS)) {
      expect(rolePermissions[role], `${role} may download but not view`).toContain(
        "students:view",
      );
    }
  });

  /**
   * The constant and `updateStudentPhotoAction` must stay the same answer:
   * "may change this child's photo" and "may keep a copy of it" are one
   * decision. The action pins its own literal in
   * tests/unit/student-photo-narrow-write.test.ts, so this asserts they agree
   * rather than refactoring the action to import the constant.
   */
  it("matches the pair that already guards changing a photo", () => {
    const actions = readRepoFile("src/app/protected/students/actions.ts");
    const start = actions.indexOf("export async function updateStudentPhotoAction");
    const body = actions.slice(start, actions.indexOf("\nexport ", start + 10));

    for (const permission of STUDENT_PHOTO_DOWNLOAD_PERMISSIONS) {
      expect(body, `updateStudentPhotoAction does not accept ${permission}`).toContain(
        `"${permission}"`,
      );
    }
  });

  /**
   * `canEditStudent` on the detail page is `students:write` ALONE, which is
   * admin only. Threading that into the download would have silently locked
   * teachers out of a photo they are allowed to replace.
   */
  it("is not the page's canEditStudent", () => {
    const page = readRepoFile("src/app/protected/students/[studentId]/page.tsx");
    expect(page).toContain('const canEditStudent = hasStaffPermission(staff, "students:write");');
    expect(page).toContain("const canDownloadPhoto = hasAnyStaffPermission(");
    expect(page).toContain("STUDENT_PHOTO_DOWNLOAD_PERMISSIONS");
  });

  /** A missing prop must not hand out a child's photograph. */
  it("is a required prop wherever the button renders", () => {
    expect(readRepoFile("src/modules/students/ui/student-detail-header.tsx")).toContain(
      "canDownloadPhoto: boolean;",
    );
    expect(readRepoFile("src/modules/students/ui/mobile-student-profile.tsx")).toContain(
      "canDownloadPhoto: boolean;",
    );
  });

  /**
   * The MCP worker mirrors this pair for `format:"bytes"`. Its own copy is a
   * deliberate second source (the Worker is a separate bundle), so the two are
   * pinned against each other here.
   */
  it("matches the MCP worker's bytes gate", () => {
    const assets = readRepoFile("workers/schoolfees-mcp/src/tools/assets.mjs");
    expect(assets).toContain(
      'const PHOTO_BYTES_PERMISSIONS = ["students:write", "students:edit_basic"];',
    );
    expect(assets).toContain(
      'if (format === "bytes" && !identityCan(identity, PHOTO_BYTES_PERMISSIONS))',
    );
  });
});
