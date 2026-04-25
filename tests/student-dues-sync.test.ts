import { describe, expect, it } from "vitest";

import { shouldSyncStudentDuesForChange } from "@/lib/students/dues-sync";
import type { DuesSyncStudentSnapshot } from "@/lib/students/dues-sync";

const baseStudent: DuesSyncStudentSnapshot = {
  status: "inactive",
  classId: "class-1",
  transportRouteId: null,
  studentTypeOverride: "existing",
  tuitionOverride: null,
  transportOverride: null,
  discountAmount: 0,
  lateFeeWaiverAmount: 0,
  otherAdjustmentHead: null,
  otherAdjustmentAmount: null,
};

describe("student dues sync decisions", () => {
  it("student_status_change_to_active_generates_dues", () => {
    expect(
      shouldSyncStudentDuesForChange(baseStudent, {
        ...baseStudent,
        status: "active",
      }),
    ).toBe(true);
  });

  it("syncs when status changes out of active so unpaid future dues can be cancelled safely", () => {
    expect(
      shouldSyncStudentDuesForChange(
        {
          ...baseStudent,
          status: "active",
        },
        {
          ...baseStudent,
          status: "left",
        },
      ),
    ).toBe(true);
  });

  it("does not sync when non-fee profile notes are unchanged in dues fields", () => {
    expect(shouldSyncStudentDuesForChange(baseStudent, { ...baseStudent })).toBe(false);
  });
});
