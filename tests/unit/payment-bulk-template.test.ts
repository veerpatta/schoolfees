import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { buildPaymentImportTemplateWorkbook } from "@/lib/payments/bulk/template";
import { PAYMENT_IMPORT_MAX_ROWS, PAYMENT_TEMPLATE_HEADERS } from "@/lib/payments/bulk/types";

describe("bulk payment workbook template", () => {
  it("keeps the upload sheet first and includes task-oriented instructions", async () => {
    const workbook = await buildPaymentImportTemplateWorkbook();

    expect(workbook.SheetNames).toEqual([
      "Fill Payments Here",
      "Read Me",
      "Examples — do not upload",
      "Field Guide",
      // Backs the Payment mode dropdown; last so it stays out of the way.
      "Current Lists",
    ]);

    const fillSheet = workbook.Sheets["Fill Payments Here"];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(fillSheet, {
      header: 1,
      raw: true,
    });
    expect(rows[0]).toEqual([...PAYMENT_TEMPLATE_HEADERS]);
    expect(fillSheet["!autofilter"]?.ref).toBe(`A1:E${PAYMENT_IMPORT_MAX_ROWS + 1}`);
    expect(fillSheet.A1.c?.[0]?.t).toContain("exact student SR");

    const readMe = XLSX.utils.sheet_to_csv(workbook.Sheets["Read Me"]);
    expect(readMe).toContain("SAFE 3-STEP CHECKLIST");
    expect(readMe).toContain("selected row count and total");
    expect(readMe).toContain("Cash | UPI | Bank transfer | Cheque");
    expect(readMe).toContain("TEST-2026-27");
    expect(readMe).toContain("leading zeroes as Text");
    expect(readMe).toContain("append-only history");
  });

  it("survives an XLSX write/read round trip with instructions and header comments", async () => {
    const workbook = await buildPaymentImportTemplateWorkbook();
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    const reopened = XLSX.read(bytes, { type: "buffer" });

    expect(reopened.Props?.Title).toBe("VPPS Bulk Payment Upload Template");
    expect(reopened.Sheets["Fill Payments Here"].A1.c?.[0]?.t).toContain(
      "exact student SR",
    );
    expect(XLSX.utils.sheet_to_csv(reopened.Sheets["Field Guide"])).toContain(
      "COMMON MISTAKE",
    );
  });
});
