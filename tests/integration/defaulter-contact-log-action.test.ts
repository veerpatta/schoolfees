/**
 * Integration tests for the logContactAction server action.
 *
 * The server action calls `requireStaffPermission` and `insertDefaulterContact`.
 * Both are mocked so these tests run without a real DB or auth session.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock server modules that are unavailable in the test environment.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/defaulters/contacts", () => ({
  insertDefaulterContact: vi.fn().mockResolvedValue(undefined),
  setNoCallFlag: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/activity/events", () => ({
  recordActivity: vi.fn().mockResolvedValue(undefined),
}));

import { logContactAction, quickLogContact, setNoCallFlagAction } from "@/app/protected/defaulters/actions";
import { requireStaffPermission } from "@/lib/supabase/session";
import { insertDefaulterContact, setNoCallFlag } from "@/lib/defaulters/contacts";

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
}

const BASE_FIELDS = {
  studentId: "student-uuid-001",
  sessionLabel: "2026-27",
  channel: "call",
  outcome: "reached",
};

describe("logContactAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success when all required fields are present", async () => {
    const result = await logContactAction(
      { status: "idle" },
      makeFormData(BASE_FIELDS),
    );
    expect(result.status).toBe("success");
    expect(result.message).toBe("Contact logged.");
  });

  it("calls insertDefaulterContact with the correct args", async () => {
    await logContactAction(
      { status: "idle" },
      makeFormData({ ...BASE_FIELDS, snoozeDays: "7", note: "Will pay next week" }),
    );
    expect(insertDefaulterContact).toHaveBeenCalledOnce();
    const args = (insertDefaulterContact as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(args.studentId).toBe("student-uuid-001");
    expect(args.sessionLabel).toBe("2026-27");
    expect(args.channel).toBe("call");
    expect(args.outcome).toBe("reached");
    expect(args.note).toBe("Will pay next week");
    // snooze should be a valid ISO date 7 days from now
    expect(args.snoozeUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns snoozeUntil=null when snoozeDays is 0 or absent", async () => {
    await logContactAction(
      { status: "idle" },
      makeFormData({ ...BASE_FIELDS, snoozeDays: "0" }),
    );
    const args = (insertDefaulterContact as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(args.snoozeUntil).toBeNull();
  });

  it("returns error when studentId is missing", async () => {
    const fd = makeFormData({ ...BASE_FIELDS });
    fd.delete("studentId");
    const result = await logContactAction({ status: "idle" }, fd);
    expect(result.status).toBe("error");
    expect(insertDefaulterContact).not.toHaveBeenCalled();
  });

  it("returns error when channel is invalid", async () => {
    const result = await logContactAction(
      { status: "idle" },
      makeFormData({ ...BASE_FIELDS, channel: "telegram" }),
    );
    expect(result.status).toBe("error");
    expect(result.message).toContain("Invalid channel");
  });

  it("returns error when outcome is invalid", async () => {
    const result = await logContactAction(
      { status: "idle" },
      makeFormData({ ...BASE_FIELDS, outcome: "bribed" }),
    );
    expect(result.status).toBe("error");
    expect(result.message).toContain("Invalid outcome");
  });

  it("returns error when permission check throws", async () => {
    (requireStaffPermission as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Forbidden"),
    );
    const result = await logContactAction(
      { status: "idle" },
      makeFormData(BASE_FIELDS),
    );
    expect(result.status).toBe("error");
    expect(result.message).toBe("Permission denied.");
  });

  it("returns error when insertDefaulterContact throws", async () => {
    (insertDefaulterContact as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("DB write failed"),
    );
    const result = await logContactAction(
      { status: "idle" },
      makeFormData(BASE_FIELDS),
    );
    expect(result.status).toBe("error");
    expect(result.message).toBe("DB write failed");
  });

  it("forwards the dialed number and label for per-number learning", async () => {
    await logContactAction(
      { status: "idle" },
      makeFormData({ ...BASE_FIELDS, contactedPhone: "9876543210", phoneLabel: "Mother" }),
    );
    const args = (insertDefaulterContact as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.contactedPhone).toBe("9876543210");
    expect(args.phoneLabel).toBe("Mother");
  });
});

describe("quickLogContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards the selected phone number and label for one-tap call logging", async () => {
    const result = await quickLogContact({
      studentId: "student-uuid-001",
      sessionLabel: "TEST-2026-27",
      outcome: "no_answer",
      channel: "call",
      contactedPhone: "9876543210",
      phoneLabel: "Mother",
    });

    expect(result.ok).toBe(true);
    expect(insertDefaulterContact).toHaveBeenCalledOnce();
    const args = (insertDefaulterContact as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args).toMatchObject({
      studentId: "student-uuid-001",
      sessionLabel: "TEST-2026-27",
      channel: "call",
      outcome: "no_answer",
      contactedPhone: "9876543210",
      phoneLabel: "Mother",
    });
  });
});

describe("setNoCallFlagAction (admin-only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gates on the admin-only students:write permission", async () => {
    await setNoCallFlagAction({
      studentId: "student-uuid-001",
      sessionLabel: "2026-27",
      noCall: true,
    });
    expect(requireStaffPermission).toHaveBeenCalledWith("students:write");
  });

  it("writes the flag when permitted", async () => {
    const result = await setNoCallFlagAction({
      studentId: "student-uuid-001",
      sessionLabel: "2026-27",
      noCall: true,
      reason: "Pays every year on their own",
    });
    expect(result.ok).toBe(true);
    expect(setNoCallFlag).toHaveBeenCalledOnce();
    const args = (setNoCallFlag as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args).toMatchObject({ studentId: "student-uuid-001", sessionLabel: "2026-27", noCall: true });
  });

  it("denies and never writes when the permission check throws", async () => {
    (requireStaffPermission as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Forbidden"),
    );
    const result = await setNoCallFlagAction({
      studentId: "student-uuid-001",
      sessionLabel: "2026-27",
      noCall: true,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Permission denied.");
    expect(setNoCallFlag).not.toHaveBeenCalled();
  });
});
