import { describe, expect, it } from "vitest";

import { compareStudentRowsByName, compareStudentsByName } from "@/lib/students/sort";

function names(rows: Array<{ fullName: string; admissionNo?: string }>) {
  return [...rows].sort(compareStudentsByName).map((row) => row.fullName);
}

describe("student name ordering for downloads", () => {
  it("sorts A-Z by name, not by SR number", () => {
    const sorted = [...
      [
        { fullName: "VEDANT SINGH SOLANKI", admissionNo: "2672" },
        { fullName: "AISHWARYA RAO", admissionNo: "2682" },
        { fullName: "KANIKA", admissionNo: "PENDING-2026-0006" },
      ],
    ].sort(compareStudentsByName);

    expect(sorted.map((row) => row.fullName)).toEqual([
      "AISHWARYA RAO",
      "KANIKA",
      "VEDANT SINGH SOLANKI",
    ]);
    // The SR order would have been 2672, 2682, PENDING-… — nothing like it.
    expect(sorted.map((row) => row.admissionNo)).not.toEqual(["2672", "2682", "PENDING-2026-0006"]);
  });

  // A C-collation sort puts every lowercase name after every uppercase one, so
  // a mixed-case register would read as two separate alphabets.
  it("ignores case, so mixed-case names interleave properly", () => {
    expect(
      names([
        { fullName: "ZARA" },
        { fullName: "aarav" },
        { fullName: "Bhavya" },
        { fullName: "AANSH" },
      ]),
    ).toEqual(["AANSH", "aarav", "Bhavya", "ZARA"]);
  });

  it("ignores accents", () => {
    expect(names([{ fullName: "Zoya" }, { fullName: "Ánjali" }])).toEqual(["Ánjali", "Zoya"]);
  });

  it("keeps same-named students in a stable, repeatable order", () => {
    const rows = [
      { fullName: "RAHUL KUMAR", admissionNo: "2700" },
      { fullName: "RAHUL KUMAR", admissionNo: "2412" },
      { fullName: "RAHUL KUMAR", admissionNo: "2688" },
    ];

    const once = [...rows].sort(compareStudentsByName).map((row) => row.admissionNo);
    const twice = [...rows].reverse().sort(compareStudentsByName).map((row) => row.admissionNo);

    expect(once).toEqual(["2412", "2688", "2700"]);
    // Same result whatever order the database happened to return.
    expect(twice).toEqual(once);
  });

  it("orders numeric-looking names naturally rather than as text", () => {
    expect(names([{ fullName: "Student 10" }, { fullName: "Student 2" }])).toEqual([
      "Student 2",
      "Student 10",
    ]);
  });

  it("puts rows with a missing name first without throwing", () => {
    expect(names([{ fullName: "Aarav" }, { fullName: "" }])).toEqual(["", "Aarav"]);
  });

  it("works on raw database rows too", () => {
    const sorted = [
      { full_name: "DIYA", admission_no: "1" },
      { full_name: "AARAV", admission_no: "2" },
    ].sort(compareStudentRowsByName);

    expect(sorted.map((row) => row.full_name)).toEqual(["AARAV", "DIYA"]);
  });
});
