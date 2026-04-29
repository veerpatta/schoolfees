import { describe, it, expect } from "vitest";
import {
  getAcademicSessionStartYear,
  getDefaultAcademicSessionLabel,
  isTestAcademicSessionLabel,
  buildInstallmentDueDate,
  normalizeFeeHeadId,
  parseAcademicSessionLabel,
} from "@/lib/config/fee-rules";

describe("fee-rules", () => {
  describe("getDefaultAcademicSessionLabel", () => {
    it("should return 2026-27 for April 2026", () => {
      const date = new Date("2026-04-01T00:00:00Z");
      expect(getDefaultAcademicSessionLabel(date)).toBe("2026-27");
    });

    it("should return 2025-26 for March 2026", () => {
      const date = new Date("2026-03-31T23:59:59Z");
      expect(getDefaultAcademicSessionLabel(date)).toBe("2025-26");
    });

    it("should return 2026-27 for December 2026", () => {
      const date = new Date("2026-12-15T00:00:00Z");
      expect(getDefaultAcademicSessionLabel(date)).toBe("2026-27");
    });
  });

  describe("normalizeFeeHeadId", () => {
    it("should lowercase and replace spaces with underscores", () => {
      expect(normalizeFeeHeadId("Tuition Fee")).toBe("tuition_fee");
    });

    it("should handle special characters", () => {
      expect(normalizeFeeHeadId("Admission / Activity (Misc)")).toBe("admission_activity_misc");
    });

    it("should trim underscores from ends", () => {
      expect(normalizeFeeHeadId("  Fee-Name  ")).toBe("fee_name");
    });
  });

  describe("buildInstallmentDueDate", () => {
    it("should build correct ISO date for April in current year", () => {
      expect(buildInstallmentDueDate("2026-27", "20 April")).toBe("2026-04-20");
    });

    it("should build correct ISO date for January in next year", () => {
      expect(buildInstallmentDueDate("2026-27", "20 January")).toBe("2027-01-20");
    });

    it("accepts absolute workbook-style due date labels", () => {
      expect(buildInstallmentDueDate("2026-27", "20-10-2026")).toBe("2026-10-20");
    });

    it("builds correct ISO date for April in TEST session labels", () => {
      expect(buildInstallmentDueDate("TEST-2026-27", "20 April")).toBe("2026-04-20");
    });

    it("builds correct ISO date for January in TEST session labels", () => {
      expect(buildInstallmentDueDate("TEST-2026-27", "20 January")).toBe("2027-01-20");
    });

    it("accepts absolute workbook-style due date labels in TEST sessions", () => {
      expect(buildInstallmentDueDate("TEST-2026-27", "20-04-2026")).toBe("2026-04-20");
    });

    it("should throw error for invalid session", () => {
      expect(() => buildInstallmentDueDate("invalid", "20 April")).toThrow();
    });

    it("should throw error for invalid due date label", () => {
      expect(() => buildInstallmentDueDate("2026-27", "invalid date")).toThrow();
    });

    it("shows a clear invalid-session message", () => {
      expect(() => buildInstallmentDueDate("TEST", "20 April")).toThrow(
        'Academic session "TEST" is invalid. Use format like 2026-27 or TEST-2026-27.',
      );
    });
  });

  describe("parseAcademicSessionLabel", () => {
    it("accepts normal and prefixed session labels", () => {
      expect(parseAcademicSessionLabel("2026-27").startYear).toBe(2026);
      expect(parseAcademicSessionLabel("TEST-2026-27").startYear).toBe(2026);
      expect(parseAcademicSessionLabel("UAT-2026-27").startYear).toBe(2026);
      expect(parseAcademicSessionLabel("DEMO-2026-27").startYear).toBe(2026);
    });

    it("rejects invalid session labels", () => {
      const invalidLabels = ["TEST", "2026", "2026-28", "TEST-2026-28", "ABC-20-26"];

      invalidLabels.forEach((label) => {
        expect(() => parseAcademicSessionLabel(label)).toThrow();
      });
    });
  });

  describe("academic session helpers", () => {
    it("extracts the academic session start year", () => {
      expect(getAcademicSessionStartYear("2026-27")).toBe(2026);
      expect(getAcademicSessionStartYear("TEST-2026-27")).toBe(2026);
    });

    it("marks TEST/UAT/DEMO labels as test sessions", () => {
      expect(isTestAcademicSessionLabel("TEST-2026-27")).toBe(true);
      expect(isTestAcademicSessionLabel("UAT-2026-27")).toBe(true);
      expect(isTestAcademicSessionLabel("DEMO-2026-27")).toBe(true);
      expect(isTestAcademicSessionLabel("2026-27")).toBe(false);
    });
  });
});
