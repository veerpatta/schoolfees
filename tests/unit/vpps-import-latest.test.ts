import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

type ImporterModule = {
  normalizeClass(value: string): string | null;
  normalizeTransportRoute(value: string): { isNoTransport: boolean; routeName: string | null };
  normalizePaymentMode(value: string): { mode: string | null; requiresReview: boolean };
  parseDate(value: string): string | null;
  studentSourceKey(row: Record<string, unknown>): string;
  paymentSourceKey(row: Record<string, unknown>): string;
  validateWorkbookCounts(sheets: Record<string, unknown[]>): {
    mismatches: Array<{ key: string; expected: number; detected: number }>;
  };
};

const importerModuleUrl = pathToFileURL(
  join(process.cwd(), "scripts/_archive/2026-05-import/vpps-import-latest-2026-05-15.mjs"),
).href;

function callImporter<T>(prop: string, ...args: unknown[]): T {
  const script = `
const payload = JSON.parse(process.env.VPPS_IMPORT_TEST_CALL ?? "{}");
const moduleUrl = process.env.VPPS_IMPORT_TEST_MODULE_URL;
const importer = await import(moduleUrl);
const target = importer[payload.prop];
const value = typeof target === "function" ? target(...payload.args) : target;
process.stdout.write(JSON.stringify(value));
`;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      VPPS_IMPORT_TEST_CALL: JSON.stringify({ prop, args }),
      VPPS_IMPORT_TEST_MODULE_URL: importerModuleUrl,
    },
  });

  return JSON.parse(output) as T;
}

const importer: ImporterModule & {
  PRODUCTION_SESSION_LABEL: string;
  TEST_SESSION_FINAL_LABEL: string;
  TEST_SESSION_ALIASES_TO_RENAME: string[];
  EXPECTED_COUNTS: Record<string, number>;
} = {
  normalizeClass: (value) => callImporter("normalizeClass", value),
  normalizeTransportRoute: (value) => callImporter("normalizeTransportRoute", value),
  normalizePaymentMode: (value) => callImporter("normalizePaymentMode", value),
  parseDate: (value) => callImporter("parseDate", value),
  studentSourceKey: (row) => callImporter("studentSourceKey", row),
  paymentSourceKey: (row) => callImporter("paymentSourceKey", row),
  validateWorkbookCounts: (sheets) => callImporter("validateWorkbookCounts", sheets),
  get PRODUCTION_SESSION_LABEL() {
    return callImporter<string>("PRODUCTION_SESSION_LABEL");
  },
  get TEST_SESSION_FINAL_LABEL() {
    return callImporter<string>("TEST_SESSION_FINAL_LABEL");
  },
  get TEST_SESSION_ALIASES_TO_RENAME() {
    return callImporter<string[]>("TEST_SESSION_ALIASES_TO_RENAME");
  },
  get EXPECTED_COUNTS() {
    return callImporter<Record<string, number>>("EXPECTED_COUNTS");
  },
};

describe("vpps-import-latest-2026-05-15 helpers", () => {
  describe("normalizeClass", () => {
    it("maps common aliases to canonical labels", () => {
      expect(importer.normalizeClass("Nursery")).toBe("Nursery");
      expect(importer.normalizeClass("nur")).toBe("Nursery");
      expect(importer.normalizeClass("LKG")).toBe("JKG");
      expect(importer.normalizeClass("Class 5")).toBe("Class 5");
      expect(importer.normalizeClass("class5")).toBe("Class 5");
      expect(importer.normalizeClass("5")).toBe("Class 5");
      expect(importer.normalizeClass("11 Science")).toBe("11 Science");
      expect(importer.normalizeClass("XIIScience")).toBe("12 Science");
    });
    it("returns null for unrecognized input", () => {
      expect(importer.normalizeClass("")).toBeNull();
      expect(importer.normalizeClass("Mystery Stream")).toBeNull();
    });
  });

  describe("normalizeTransportRoute", () => {
    it("treats 'No Transport' as no-transport", () => {
      const r = importer.normalizeTransportRoute("No Transport");
      expect(r.isNoTransport).toBe(true);
      expect(r.routeName).toBeNull();
    });
    it("preserves route names verbatim otherwise", () => {
      const r = importer.normalizeTransportRoute("Surajpole Route");
      expect(r.routeName).toBe("Surajpole Route");
      expect(r.isNoTransport).toBe(false);
    });
  });

  describe("normalizePaymentMode", () => {
    it("maps Offline via Cash to cash", () => {
      expect(importer.normalizePaymentMode("Offline via Cash").mode).toBe("cash");
    });
    it("maps UPI transfers to upi", () => {
      expect(importer.normalizePaymentMode("Offline via UPI Transfer").mode).toBe("upi");
      expect(importer.normalizePaymentMode("UPI").mode).toBe("upi");
    });
    it("maps online gateway/Coffee to bank_transfer", () => {
      expect(importer.normalizePaymentMode("Coffee / Custom Payment Report").mode).toBe(
        "bank_transfer",
      );
    });
    it("flags unknown modes for review without guessing", () => {
      const r = importer.normalizePaymentMode("???");
      expect(r.requiresReview).toBe(true);
      expect(r.mode).toBeNull();
    });
  });

  describe("parseDate", () => {
    it("accepts ISO YYYY-MM-DD", () => {
      expect(importer.parseDate("2026-03-07")).toBe("2026-03-07");
    });
    it("accepts dd-mm-yyyy", () => {
      expect(importer.parseDate("07-03-2026")).toBe("2026-03-07");
    });
    it("returns null for nonsense", () => {
      expect(importer.parseDate("not a date")).toBeNull();
    });
  });

  describe("idempotency keys", () => {
    it("studentSourceKey is stable across runs and prefers source_student_uid", () => {
      const row = { source_student_uid: "STU-0146", sr_no: "2317", student_name: "Gori Gurjar", class_name: "Class 10", date_of_birth: "" };
      expect(importer.studentSourceKey(row)).toBe("STU-0146");
    });
    it("paymentSourceKey uses workbook duplicate_check_key when present", () => {
      const row = {
        duplicate_check_key: "STU-0146|2026-03-07|8100.0|VPS00-2603-00035",
        source_student_uid: "STU-0146",
        payment_date: "2026-03-07",
        amount_paid: 8100,
        receipt_or_invoice_no: "VPS00-2603-00035",
      };
      expect(importer.paymentSourceKey(row)).toBe(
        "WB:STU-0146|2026-03-07|8100.0|VPS00-2603-00035",
      );
    });
    it("paymentSourceKey is deterministic without duplicate_check_key", () => {
      const row = {
        source_student_uid: "STU-0146",
        payment_date: "2026-03-07",
        amount_paid: 8100,
        receipt_or_invoice_no: "VPS00-2603-00035",
        source_transaction_id: "ord_X",
      };
      expect(importer.paymentSourceKey(row)).toBe(
        importer.paymentSourceKey({ ...row }),
      );
    });
  });

  describe("safety constants", () => {
    it("production session is 2026-27 (never touched by TEST rename)", () => {
      expect(importer.PRODUCTION_SESSION_LABEL).toBe("2026-27");
      expect(importer.TEST_SESSION_FINAL_LABEL).toBe("TEST");
      expect(importer.TEST_SESSION_ALIASES_TO_RENAME).not.toContain("2026-27");
      expect(importer.TEST_SESSION_ALIASES_TO_RENAME).toContain("TEST-2026-27");
    });
    it("expected workbook counts align with prompt facts", () => {
      expect(importer.EXPECTED_COUNTS).toEqual({
        latestStudentsActive: 466,
        supabaseStudentsActive: 466,
        reviewNeeded: 35,
        addedNewNotInPdf: 23,
        leftStudents: 67,
        paymentsCurrent: 363,
        paymentsLeft: 60,
        feeLinesCurrent: 621,
        feeLinesLeft: 98,
      });
    });
  });

  describe("validateWorkbookCounts", () => {
    it("flags mismatches with key/expected/detected detail", () => {
      const sheets = {
        Latest_Students_Active: new Array(466).fill({}),
        Supabase_Students_Active: new Array(466).fill({}),
        Review_Needed: new Array(35).fill({}),
        Added_New_Not_in_PDF: new Array(23).fill({}),
        Left_Students: new Array(67).fill({}),
        Payments_Current: new Array(363).fill({}),
        Payments_Left: new Array(60).fill({}),
        FeeLines_Current: new Array(621).fill({}),
        FeeLines_Left: new Array(98).fill({}),
      };
      expect(importer.validateWorkbookCounts(sheets).mismatches).toEqual([]);

      const bad = { ...sheets, Left_Students: new Array(70).fill({}) };
      const result = importer.validateWorkbookCounts(bad);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0]).toMatchObject({ key: "leftStudents", expected: 67, detected: 70 });
    });
  });
});
