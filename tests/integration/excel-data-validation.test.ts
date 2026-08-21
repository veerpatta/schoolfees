import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "xlsx";

import { applyListValidations, columnLetter } from "@/platform/excel/data-validation";

function buildWorkbook() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["SR no", "Student name", "Transport route"],
      ["SVP-001", "Aarav", "Sanganer"],
      ["SVP-002", "Diya", ""],
    ]),
    "Fill Here",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Routes"], ["Sanganer"], ["Tonk Road"], ["Amet City"]]),
    "Current Lists",
  );

  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer);
}

const validation = {
  sheetName: "Fill Here",
  sourceSheetName: "Current Lists",
  sourceColumn: 1,
  sourceFirstRow: 2,
  sourceLastRow: 4,
  targetColumn: 3,
  targetFirstRow: 2,
  targetLastRow: 500,
  definedName: "VPPS_Routes",
  prompt: "Choose a route already in the system.",
  error: "That route is not in the system.",
};

function partsOf(buffer: Uint8Array) {
  const archive = unzipSync(buffer);
  return Object.fromEntries(
    Object.entries(archive).map(([name, bytes]) => [name, strFromU8(bytes)]),
  );
}

describe("excel list validations", () => {
  it("maps column indexes to spreadsheet letters", () => {
    expect(columnLetter(1)).toBe("A");
    expect(columnLetter(26)).toBe("Z");
    expect(columnLetter(27)).toBe("AA");
    expect(columnLetter(28)).toBe("AB");
    expect(columnLetter(52)).toBe("AZ");
    expect(columnLetter(53)).toBe("BA");
    expect(() => columnLetter(0)).toThrow();
  });

  it("adds a defined name pointing at the source range", () => {
    const parts = partsOf(applyListValidations(buildWorkbook(), [validation]));

    expect(parts["xl/workbook.xml"]).toContain("<definedNames>");
    expect(parts["xl/workbook.xml"]).toContain(
      `<definedName name="VPPS_Routes">&apos;Current Lists&apos;!$A$2:$A$4</definedName>`,
    );
  });

  it("adds a list dataValidation over the target column", () => {
    const parts = partsOf(applyListValidations(buildWorkbook(), [validation]));
    const sheet = parts["xl/worksheets/sheet1.xml"]!;

    expect(sheet).toContain("<dataValidations count=\"1\">");
    expect(sheet).toContain('type="list"');
    expect(sheet).toContain('sqref="C2:C500"');
    expect(sheet).toContain("<formula1>VPPS_Routes</formula1>");
    // Blank must stay legal — empty means "leave this value alone".
    expect(sheet).toContain('allowBlank="1"');
  });

  it("warns rather than blocks unless strict is requested", () => {
    const lenient = partsOf(applyListValidations(buildWorkbook(), [validation]));
    expect(lenient["xl/worksheets/sheet1.xml"]).toContain('errorStyle="warning"');

    const strict = partsOf(
      applyListValidations(buildWorkbook(), [{ ...validation, strict: true }]),
    );
    expect(strict["xl/worksheets/sheet1.xml"]).toContain('errorStyle="stop"');
  });

  // Excel refuses to open a file whose <worksheet> children are out of order.
  it("places dataValidations before pageMargins and friends", () => {
    const parts = partsOf(applyListValidations(buildWorkbook(), [validation]));
    const sheet = parts["xl/worksheets/sheet1.xml"]!;
    const dv = sheet.indexOf("<dataValidations");

    expect(dv).toBeGreaterThan(sheet.indexOf("</sheetData>"));

    for (const tag of ["<pageMargins", "<hyperlinks", "<pageSetup", "<drawing"]) {
      const at = sheet.indexOf(tag);
      if (at !== -1) expect(dv).toBeLessThan(at);
    }
  });

  it("leaves the workbook readable by a spreadsheet parser", () => {
    const patched = applyListValidations(buildWorkbook(), [validation]);
    const reread = XLSX.read(patched, { type: "buffer" });

    expect(reread.SheetNames).toEqual(["Fill Here", "Current Lists"]);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(reread.Sheets["Fill Here"]!, { header: 1 });
    expect(rows[0]).toEqual(["SR no", "Student name", "Transport route"]);
    expect(rows[1]).toEqual(["SVP-001", "Aarav", "Sanganer"]);
  });

  it("supports several dropdowns across different sheets", () => {
    const parts = partsOf(
      applyListValidations(buildWorkbook(), [
        validation,
        {
          ...validation,
          definedName: "VPPS_Routes_Alt",
          targetColumn: 2,
          sheetName: "Current Lists",
        },
      ]),
    );

    expect(parts["xl/worksheets/sheet1.xml"]).toContain("VPPS_Routes<");
    expect(parts["xl/worksheets/sheet2.xml"]).toContain("VPPS_Routes_Alt<");
    expect(parts["xl/workbook.xml"]).toContain("VPPS_Routes_Alt");
  });

  it("rejects a duplicate defined name instead of silently dropping one", () => {
    expect(() =>
      applyListValidations(buildWorkbook(), [validation, { ...validation, targetColumn: 2 }]),
    ).toThrow(/Duplicate defined name/);
  });

  it("rejects a sheet name that is not in the workbook", () => {
    expect(() =>
      applyListValidations(buildWorkbook(), [{ ...validation, sheetName: "Nope" }]),
    ).toThrow(/not in the workbook/);
    expect(() =>
      applyListValidations(buildWorkbook(), [{ ...validation, sourceSheetName: "Nope" }]),
    ).toThrow(/not in the workbook/);
  });

  it("returns the input untouched when there is nothing to apply", () => {
    const original = buildWorkbook();
    expect(applyListValidations(original, [])).toBe(original);
  });
});
