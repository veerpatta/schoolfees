import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/**
 * Collect step 5 — the printed receipt and its Undo window (mobile app v2).
 *
 * The design shows an Undo button on the success screen. Its own prototype
 * captions that as "nothing was posted", but the design's home brief and money
 * glossary both say a reversal writes a compensating entry and both rows stay
 * in the register forever. The glossary wins: by step 5 the receipt EXISTS, so
 * Undo must reverse, never delete. Hard Safety Rule 1.
 */
describe("mobile collect step 5", () => {
  const sheet = readRepoFile("components/payments/success-receipt-sheet.tsx");
  const paper = readRepoFile("components/payments/mobile-printed-receipt.tsx");

  it("routes Undo through the reversal action, never a delete", () => {
    const action = readRepoFile("app/protected/payments/actions.ts");
    const data = readRepoFile("lib/payments/data.ts");

    // The sheet only ever calls the injected handler; the desk wires it to
    // undoRecentPaymentAction, which calls the undo_recent_payment RPC.
    expect(sheet).toContain("onUndoPayment");
    expect(action).toContain("undoRecentPayment({ receiptId, reason })");
    expect(data).toContain('supabase.rpc("undo_recent_payment"');

    // No direct mutation of posted money from any of these surfaces.
    for (const source of [sheet, paper]) {
      expect(source).not.toMatch(/\.from\("receipts"\)[\s\S]{0,80}\.delete\(/);
      expect(source).not.toMatch(/\.from\("payments"\)[\s\S]{0,80}\.(delete|update)\(/);
    }
  });

  it("gates Undo on the adjust permission and a live countdown", () => {
    expect(sheet).toContain("canUndo");
    expect(sheet).toContain("UNDO_WINDOW_SECONDS");
    expect(sheet).toContain("formatCountdown(secondsLeft)");
    // The window matches the receipt-page affordance and the RPC's own check.
    expect(sheet).toContain("10 * 60");
    expect(readRepoFile("components/receipts/receipt-undo-action.tsx")).toContain(
      "10 * 60_000",
    );
  });

  it("keeps a failed undo on screen instead of silently swallowing it", () => {
    // The money did NOT move — a clerk must not walk away thinking it did.
    expect(sheet).toContain('role="alert"');
    expect(sheet).toContain('undoState === "error" && undoMessage');
  });

  it("renders the paper stub without claiming to be the printable document", () => {
    // receipt-document-v3 owns A4 print fidelity; this is a confirmation
    // surface and must never compete with it in a print dialog.
    expect(paper).toContain("print:hidden");
    expect(paper).toContain("Parent copy");
    expect(paper).toContain("PAID");
    // Real school identity, never the design file's placeholder school.
    expect(paper).toContain("schoolProfile.name");
    expect(paper).not.toContain("Veer Public");
  });
});
