import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The Payment Desk must survive its own route re-rendering.
 *
 * `PaymentDeskDataLoader` returns two different trees — one for a URL with
 * `?studentId=`, one without — and both render `<PaymentEntryClient>`, which
 * holds the entire collect flow in client state: the selected student, the
 * amount, and the posted-receipt screen.
 *
 * Every successful payment re-renders this route, because the Server Action
 * revalidates. If the URL has also changed, the page swaps branches. React
 * matches fragment children BY POSITION, so when the branches had different
 * child counts the desk moved index, was unmounted and rebuilt — at the exact
 * moment it was holding a receipt. What the clerk saw: "it just reloads and
 * falls back to the same screen", with no receipt and no animation.
 *
 * Two independent guards, because either alone would have prevented it:
 *  1. the two branches render the same child sequence, and
 *  2. the desk carries a stable key, which React matches ahead of position.
 */

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const PAGE = "src/app/protected/payments/page.tsx";

describe("payment desk survives a route re-render", () => {
  it("gives the desk a stable key in every branch that renders it", () => {
    const source = read(PAGE);
    const mounts = source.match(/<PaymentEntryClient\b/g) ?? [];
    const keyed = source.match(/<PaymentEntryClient\s+key=\{PAYMENT_DESK_KEY\}/g) ?? [];

    expect(mounts.length).toBeGreaterThanOrEqual(2);
    expect(keyed.length).toBe(mounts.length);
  });

  it("keeps both branches' child sequences identical", () => {
    const source = read(PAGE);

    // Each branch that renders the desk must precede it with the same three
    // slots, in the same order: the recovery notice, the status badge row and
    // the blocking-reason guard. The no-student branch can never be in
    // recovery mode (it requires a student), but the SLOT still has to be
    // there — an absent slot is what shifted the desk one index. One shared
    // `recoveryNotice` binding rather than two copies, so the branches cannot
    // drift.
    const branches = source
      .split("return (")
      .slice(1)
      .filter((branch) => branch.includes("<PaymentEntryClient"));

    expect(branches.length).toBe(2);

    for (const branch of branches) {
      const beforeDesk = branch
        .slice(0, branch.indexOf("<PaymentEntryClient"))
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

      expect(beforeDesk.match(/\{recoveryNotice\}/g) ?? []).toHaveLength(1);
      expect(beforeDesk.match(/<StatusBadge/g) ?? []).toHaveLength(1);
      expect(beforeDesk.match(/\{blockingReason \?/g) ?? []).toHaveLength(1);
      // Order matters as much as presence.
      expect(beforeDesk.indexOf("{recoveryNotice}")).toBeLessThan(
        beforeDesk.indexOf("<StatusBadge"),
      );
      expect(beforeDesk.indexOf("<StatusBadge")).toBeLessThan(
        beforeDesk.indexOf("{blockingReason ?"),
      );
    }
  });

  it("does not rewrite the URL from inside the success effect", () => {
    // The trigger. Covered in behavioural terms by
    // tests/ui/interaction/payment-restart.test.tsx; asserted here too because
    // the two halves only make sense together.
    const desk = read("src/components/payments/payment-desk-mobile.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    const start = desk.indexOf('if (state.status === "success") {');
    const end = desk.indexOf('if (state.status === "duplicate") {', start);
    expect(desk.slice(start, end)).not.toContain("history.replaceState");
  });
});
