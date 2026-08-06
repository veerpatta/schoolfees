import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "xlsx";

import {
  ADD_TEMPLATE_SHEET_NAME,
  UPDATE_TEMPLATE_SHEET_NAME,
  buildAddStudentsTemplateFile,
  buildUpdateStudentsTemplateFile,
} from "@/lib/import/templates";
import {
  PAYMENT_MODE_OPTIONS,
  buildPaymentImportTemplateFile,
} from "@/lib/payments/bulk/template";
import {
  BULK_UPDATE_SHEET_NAME,
  buildBulkUpdateTemplateWorkbook,
  buildBulkUpdateValidations,
  workbookToBuffer,
} from "@/lib/students/bulk-update/workbook";
import { resolveBulkUpdateFields } from "@/lib/students/bulk-update/fields";

const CLASSES = [{ label: "Nursery" }, { label: "JKG" }, { label: "Class 1 - A" }];
const ROUTES = [{ label: "Sanganer (R1)" }, { label: "Tonk Road (R2)" }];
const POLICIES = [{ label: "RTE" }, { label: "Staff Child" }];

/** Returns the XML parts of an .xlsx buffer, keyed by part path. */
function partsOf(buffer: Buffer | Uint8Array) {
  const archive = unzipSync(new Uint8Array(buffer));
  return Object.fromEntries(
    Object.entries(archive).map(([name, bytes]) => [name, strFromU8(bytes)]),
  );
}

/** Finds the worksheet XML for a named sheet by walking workbook.xml + rels. */
function sheetXmlFor(parts: Record<string, string>, sheetName: string) {
  const workbook = parts["xl/workbook.xml"]!;
  const rels = parts["xl/_rels/workbook.xml.rels"]!;
  const sheetTag = new RegExp(`<sheet\\b[^>]*name="${sheetName}"[^>]*/>`).exec(workbook)?.[0];
  if (!sheetTag) throw new Error(`sheet ${sheetName} not found`);
  const relId = /r:id="([^"]+)"/.exec(sheetTag)![1]!;
  const target = new RegExp(`<Relationship[^>]*Id="${relId}"[^>]*Target="([^"]+)"`).exec(
    rels,
  )![1]!;
  return parts[`xl/${target.replace(/^\/?xl\//, "")}`]!;
}

function dropdownColumns(sheetXml: string) {
  return [...sheetXml.matchAll(/<dataValidation\b[^>]*sqref="([A-Z]+)\d+:[A-Z]+\d+"/g)].map(
    (m) => m[1]!,
  );
}

describe("student add template", () => {
  it("puts dropdowns on class, route, new/old and both policy columns", async () => {
    const parts = partsOf(await buildAddStudentsTemplateFile(CLASSES, ROUTES, POLICIES));
    const sheet = sheetXmlFor(parts, ADD_TEMPLATE_SHEET_NAME);

    // Student name, Class(B), SR no, Father, Phone, Route(F), New/Old(G), P1(H), P2(I)
    expect(dropdownColumns(sheet).sort()).toEqual(["B", "F", "G", "H", "I"]);
    expect(parts["xl/workbook.xml"]).toContain("VPPS_Classes");
    expect(parts["xl/workbook.xml"]).toContain("VPPS_Routes");
  });

  it("points each list at its own exact range, so no blank dropdown entries", async () => {
    const parts = partsOf(await buildAddStudentsTemplateFile(CLASSES, ROUTES, POLICIES));
    const workbook = parts["xl/workbook.xml"]!;

    // 3 classes -> rows 2..4, 2 routes -> rows 2..3, New/Old -> rows 2..3
    expect(workbook).toContain("$A$2:$A$4");
    expect(workbook).toContain("$B$2:$B$3");
    expect(workbook).toContain("$C$2:$C$3");
  });

  it("still opens as a valid workbook", async () => {
    const buffer = await buildAddStudentsTemplateFile(CLASSES, ROUTES, POLICIES);
    const workbook = XLSX.read(buffer, { type: "buffer" });

    expect(workbook.SheetNames).toContain(ADD_TEMPLATE_SHEET_NAME);
    expect(workbook.SheetNames).toContain("Current Lists");
  });

  it("skips a dropdown whose list is empty rather than writing a broken range", async () => {
    const parts = partsOf(await buildAddStudentsTemplateFile([], [], []));
    const sheet = sheetXmlFor(parts, ADD_TEMPLATE_SHEET_NAME);

    // Only New/Old survives — it is a fixed two-value list.
    expect(dropdownColumns(sheet)).toEqual(["G"]);
    expect(parts["xl/workbook.xml"]).not.toContain("VPPS_Classes");
  });
});

describe("student update template", () => {
  const rows = [
    {
      studentId: "s-1",
      admissionNo: "SVP-001",
      fullName: "Aarav",
      classLabel: "Nursery",
      fatherName: null,
      fatherPhone: null,
      transportRouteLabel: null,
      studentTypeLabel: "New" as const,
      tuitionOverride: null,
      transportOverride: null,
      discountAmount: 0,
      lateFeeWaiverAmount: 0,
      otherAdjustmentHead: null,
      otherAdjustmentAmount: null,
      notes: null,
    },
  ];

  it("puts dropdowns on class, route, new/old and both policy columns", async () => {
    const parts = partsOf(
      await buildUpdateStudentsTemplateFile(rows, {
        classes: CLASSES,
        routes: ROUTES,
        conventionalPolicies: POLICIES,
      }),
    );
    const sheet = sheetXmlFor(parts, UPDATE_TEMPLATE_SHEET_NAME);

    // Student ID, SR no, Name, Class(D), Father, Phone, Route(G), New/Old(H), P1(I), P2(J)
    expect(dropdownColumns(sheet).sort()).toEqual(["D", "G", "H", "I", "J"]);
  });

  it("leaves the identity and free-text columns alone", async () => {
    const parts = partsOf(
      await buildUpdateStudentsTemplateFile(rows, { classes: CLASSES, routes: ROUTES }),
    );
    const columns = dropdownColumns(sheetXmlFor(parts, UPDATE_TEMPLATE_SHEET_NAME));

    // A = Student ID, B = SR no, C = Student name, F = Phone
    for (const identity of ["A", "B", "C", "F"]) {
      expect(columns).not.toContain(identity);
    }
  });
});

describe("payment import template", () => {
  it("puts a strict dropdown on the payment mode column only", async () => {
    const parts = partsOf(await buildPaymentImportTemplateFile());
    const sheet = sheetXmlFor(parts, "Fill Payments Here");

    // SR no, Amount, Payment date, Payment mode(D), Remarks
    expect(dropdownColumns(sheet)).toEqual(["D"]);
    // A mode outside the list is always a mistake, so it is refused outright.
    expect(sheet).toContain('errorStyle="stop"');
  });

  it("offers exactly the accepted payment modes", async () => {
    const buffer = await buildPaymentImportTemplateFile();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Current Lists"]!, {
      header: 1,
    });

    expect(rows.slice(1).map((row) => row[0])).toEqual([...PAYMENT_MODE_OPTIONS]);
  });
});

describe("bulk update template", () => {
  const snapshot = [
    {
      studentId: "s-1",
      admissionNo: "SVP-001",
      fullName: "Aarav",
      values: { fatherPhone: "9829000001", class: "class-1", route: null, status: "active" },
    },
  ];

  async function build(fieldKeys: string[]) {
    const fields = resolveBulkUpdateFields(fieldKeys);
    const workbook = await buildBulkUpdateTemplateWorkbook({
      students: snapshot,
      fields,
      labels: {
        classLabelById: new Map([["class-1", "Nursery"]]),
        routeLabelById: new Map(),
      },
      classLabels: ["Nursery"],
      allClassLabels: ["Nursery", "JKG", "Class 1 - A"],
      allRouteLabels: ["Sanganer", "Tonk Road"],
    });

    return partsOf(
      await workbookToBuffer(
        workbook,
        buildBulkUpdateValidations({
          fields,
          classCount: 3,
          routeCount: 2,
          rowCount: snapshot.length,
        }),
      ),
    );
  }

  it("adds dropdowns only for the list-backed fields that were ticked", async () => {
    const parts = await build(["fatherPhone", "route", "status"]);
    const sheet = sheetXmlFor(parts, BULK_UPDATE_SHEET_NAME);

    // Locked: A=Student ID, B=SR no, C=Student name. Then catalogue order:
    // D = Father phone (free text, no dropdown), E = Route, F = Record status.
    expect(dropdownColumns(sheet).sort()).toEqual(["E", "F"]);
  });

  it("adds no dropdowns at all when only free-text fields are ticked", async () => {
    const parts = await build(["fatherPhone", "notes"]);
    const sheet = sheetXmlFor(parts, BULK_UPDATE_SHEET_NAME);

    expect(sheet).not.toContain("<dataValidations");
  });

  it("lists every class in the session, not just the selected ones", async () => {
    const parts = await build(["class"]);

    // 3 classes in the session -> source range rows 2..4, even though only one
    // class was selected for the download.
    expect(parts["xl/workbook.xml"]).toContain("$A$2:$A$4");
  });

  it("still opens as a valid workbook", async () => {
    const fields = resolveBulkUpdateFields(["class", "route"]);
    const built = await buildBulkUpdateTemplateWorkbook({
      students: snapshot,
      fields,
      labels: {
        classLabelById: new Map([["class-1", "Nursery"]]),
        routeLabelById: new Map(),
      },
      classLabels: ["Nursery"],
      allClassLabels: ["Nursery", "JKG"],
      allRouteLabels: ["Sanganer"],
    });
    const buffer = await workbookToBuffer(
      built,
      buildBulkUpdateValidations({ fields, classCount: 2, routeCount: 1, rowCount: 1 }),
    );
    const reread = XLSX.read(buffer, { type: "buffer" });

    expect(reread.SheetNames).toEqual([BULK_UPDATE_SHEET_NAME, "Instructions", "Current Lists"]);
  });
});
