import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The photo quick-edit writes one column, and cleans up in the right order.
 *
 * Two traps this pins:
 *
 * 1. **The edit form clears a photo by omission.** It posts `photoPath` on
 *    every save, so a blank field means "remove the photo". A quick-edit sheet
 *    built on `updateStudentAction` would inherit that, and opening the sheet
 *    and cancelling would be indistinguishable from deleting the picture. The
 *    narrow action exists so `photo_path` is the only column in the statement.
 *
 * 2. **Cleanup order.** Deleting the old object before the row commits leaves a
 *    student pointing at a file that no longer exists. Row first, delete second,
 *    and a failed delete is swallowed — an orphan is cheaper than a save the
 *    office watched succeed and then saw fail.
 */
const actions = readFileSync(
  join(process.cwd(), "src/app/protected/students/actions.ts"),
  "utf8",
);

const data = readFileSync(join(process.cwd(), "src/modules/students/data/queries.ts"), "utf8");

function photoActionBody() {
  const start = actions.indexOf("export async function updateStudentPhotoAction");
  expect(start, "updateStudentPhotoAction is missing").toBeGreaterThan(-1);
  const next = actions.indexOf("\nexport ", start + 10);
  return actions.slice(start, next === -1 ? undefined : next);
}

describe("updateStudentPhotoAction", () => {
  it("guards on the same permissions that let someone edit a student", () => {
    expect(photoActionBody()).toContain(
      'requireAnyStaffPermission([\n    "students:write",\n    "students:edit_basic",\n  ])',
    );
  });

  it("distinguishes an absent field from a cleared one", () => {
    // Without this, a form that never rendered the input would read as "remove".
    expect(photoActionBody()).toContain('formData.has("photoPath")');
  });

  it("refuses a path that tries to escape the bucket", () => {
    const body = photoActionBody();
    expect(body).toContain('nextPath.includes("..")');
    expect(body).toContain('nextPath.startsWith("/")');
  });

  it("writes the row before deleting the object it replaced", () => {
    const body = photoActionBody();
    const write = body.indexOf("updateStudentPhoto(");
    const cleanup = body.indexOf("deleteStudentPhotoObject(");

    expect(write).toBeGreaterThan(-1);
    expect(cleanup).toBeGreaterThan(write);
  });

  it("does not fail the save when cleanup fails", () => {
    expect(photoActionBody()).toMatch(/deleteStudentPhotoObject\([\s\S]*?\} catch \{/);
  });

  it("never touches a column other than photo_path", () => {
    const start = data.indexOf("export async function updateStudentPhoto(");
    const body = data.slice(start, data.indexOf("\nexport ", start + 10));

    expect(body).toContain(".update({ photo_path: photoPath })");
    for (const column of ["class_id", "admission_no", "status", "full_name"]) {
      expect(body, `${column} must not be in the photo update`).not.toContain(column);
    }
  });
});
