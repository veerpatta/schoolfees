import { describe, expect, it } from "vitest";

import { normalizeSiblingPhone } from "@/lib/students/sibling-normalization";

describe("sibling phone normalization", () => {
  it("keeps only valid 10 digit phone numbers", () => {
    expect(normalizeSiblingPhone("(987) 654-3210")).toBe("9876543210");
    expect(normalizeSiblingPhone(" 09876 54321 ")).toBe("0987654321");
  });

  it("rejects placeholder and repeated digit numbers", () => {
    expect(normalizeSiblingPhone("9999999999")).toBeNull();
    expect(normalizeSiblingPhone("0000000000")).toBeNull();
    expect(normalizeSiblingPhone("1234567890")).toBeNull();
    expect(normalizeSiblingPhone("2222222222")).toBeNull();
  });

  it("rejects numbers with seven repeated digits in a row", () => {
    expect(normalizeSiblingPhone("9877777770")).toBeNull();
    expect(normalizeSiblingPhone("9876666666")).toBeNull();
  });

  it("rejects non-10-digit values after stripping punctuation", () => {
    expect(normalizeSiblingPhone("98765")).toBeNull();
    expect(normalizeSiblingPhone("+91 98765 43210 55")).toBeNull();
    expect(normalizeSiblingPhone(null)).toBeNull();
  });
});
