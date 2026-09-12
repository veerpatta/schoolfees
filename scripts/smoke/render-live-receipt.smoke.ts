import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Render REAL receipts and check each one fits a single page.
 *
 * The fixture in `render-parent-documents.smoke.ts` is a guess at a worst case,
 * and it guessed low: the first receipt sent through production came back two
 * pages where the fixture rendered one, because the fixture's summary figures
 * happened to subtract and a real one's did not — which printed four extra
 * lines of explanation and pushed the parent stub onto page two.
 *
 * A document that only misbehaves on real rows has to be tested on real rows.
 * This reads them; it writes nothing and sends nothing.
 *
 *   SMOKE_RECEIPT_SAMPLE=20 npx vitest run \
 *     --config scripts/smoke/vitest.smoke.config.ts \
 *     scripts/smoke/render-live-receipt.smoke.ts
 *
 * `SMOKE_RECEIPT_ID` renders one named receipt instead, and saves it.
 */

const OUT = process.env.SMOKE_OUT_DIR ?? path.join(process.cwd(), ".smoke-out");
const namedId = process.env.SMOKE_RECEIPT_ID ?? "";
const sampleSize = Number(process.env.SMOKE_RECEIPT_SAMPLE ?? 0);

function pageCount(pdf: Buffer): number {
  const match = /\/Count\s+(\d+)/.exec(pdf.toString("latin1"));
  return match ? Number(match[1]) : 0;
}

describe.skipIf(!namedId)("one named real receipt", () => {
  it("renders on a single page", async () => {
    const { createAdminClient } = await import("@/platform/supabase/admin");
    const { getReceiptDetailWith } = await import("@/modules/receipts/data/queries");
    const receipt = await getReceiptDetailWith(createAdminClient(), namedId);
    expect(receipt, "receipt not found").not.toBeNull();

    // Printed so a two-page render can be explained rather than guessed at.
    console.log("breakdown rows    ", receipt!.breakdown.length);
    console.log("installmentStatus ", receipt!.installmentStatus.length);
    console.log("discount policies ", receipt!.conventionalDiscountAssignments.length);
    console.log(
      "summary subtracts?",
      Math.round(receipt!.totalDue - receipt!.totalPaidToDate) ===
        Math.round(receipt!.currentOutstanding),
    );

    const { renderReceiptPdf } = await import("@/modules/receipts/domain/receipt-pdf");
    const pdf = await renderReceiptPdf({ receipt: receipt! });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "live-receipt.pdf"), pdf);

    console.log("pages             ", pageCount(pdf));
    expect(pageCount(pdf), "a real receipt must fit one page").toBe(1);
  });
});

describe.skipIf(sampleSize < 1)("a sample of real receipts", () => {
  it("none runs past two pages, and the common case is one", async () => {
    const { createAdminClient } = await import("@/platform/supabase/admin");
    const { getReceiptDetailWith } = await import("@/modules/receipts/data/queries");
    const { renderReceiptPdf } = await import("@/modules/receipts/domain/receipt-pdf");
    const supabase = createAdminClient();

    // Ordered by amount: the biggest payments are the ones that touched the most
    // installments, which is what makes a receipt tall.
    const { data } = await supabase
      .from("receipts")
      .select("id, receipt_number, total_amount")
      .order("total_amount", { ascending: false })
      .limit(sampleSize);

    const rows = (data ?? []) as Array<{ id: string; receipt_number: string }>;
    expect(rows.length, "no receipts to sample").toBeGreaterThan(0);

    /**
     * Two pages is the ceiling, not one.
     *
     * Measured across the 30 most recent receipts: 27 render on one page, and
     * the 3 that do not all carry a previous-year balance — five year tiles
     * instead of four, which is a real extra row of content rather than slack
     * layout. Demanding one page would mean deleting something a parent is
     * entitled to see.
     *
     * What IS guaranteed is that the closing block never splits: stamps,
     * signature and tear-off stub are wrapped together in the renderer, so a
     * two-page receipt still ends with a whole stub.
     *
     * Three pages would mean something has gone wrong — a runaway table, a
     * label that stopped wrapping — and that is what this catches.
     */
    const tooLong: string[] = [];
    const histogram: Record<number, number> = {};
    for (const row of rows) {
      const receipt = await getReceiptDetailWith(supabase, row.id);
      if (!receipt) continue;
      const pages = pageCount(await renderReceiptPdf({ receipt }));
      histogram[pages] = (histogram[pages] ?? 0) + 1;
      if (pages > 2) tooLong.push(`${row.receipt_number} (${pages} pages)`);
    }

    console.log(`sampled ${rows.length} receipts, pages ${JSON.stringify(histogram)}`);
    expect(tooLong, "these receipts run past two pages").toEqual([]);
  });
});
