import { describe, expect, it } from "vitest";

import { staffDisplayName, staffInitials } from "@/platform/helpers/staff-name";

/**
 * `receipts.received_by` is free text holding the poster's sign-in email, so
 * both the phone home greeting and the Receipts "Collected by" filter have to
 * turn an address into something a person recognises — without ever using the
 * result to match on.
 */
describe("staffDisplayName", () => {
  it("turns an email local part into words", () => {
    expect(staffDisplayName("raj@vpps.co.in")).toBe("Raj");
    expect(staffDisplayName("sunita.verma@vpps.co.in")).toBe("Sunita Verma");
    expect(staffDisplayName("mohan_singh@vpps.co.in")).toBe("Mohan Singh");
    expect(staffDisplayName("mohan-singh@vpps.co.in")).toBe("Mohan Singh");
  });

  it("leaves a value that is already a name exactly as the desk recorded it", () => {
    // The Payment Desk writes "Office desk" when nobody is signed in.
    expect(staffDisplayName("Office desk")).toBe("Office desk");
    expect(staffDisplayName("Rajesh Airen")).toBe("Rajesh Airen");
  });

  it("returns an empty string for nothing at all", () => {
    expect(staffDisplayName(null)).toBe("");
    expect(staffDisplayName(undefined)).toBe("");
    expect(staffDisplayName("   ")).toBe("");
  });
});

describe("staffInitials", () => {
  it("takes one letter from each of the first two words", () => {
    expect(staffInitials("sunita.verma@vpps.co.in")).toBe("SV");
    expect(staffInitials("Office desk")).toBe("OD");
  });

  it("falls back to the first two letters of a single word", () => {
    expect(staffInitials("raj@vpps.co.in")).toBe("RA");
  });

  it("falls back to the school initials when there is nothing to read", () => {
    expect(staffInitials(null)).toBe("VP");
    expect(staffInitials("", "XX")).toBe("XX");
  });
});
