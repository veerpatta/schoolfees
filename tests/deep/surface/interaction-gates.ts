import { registerDimension } from "../lib/coverage";
import type { StaffRoleName } from "./permissions";

/**
 * The permission gates that only exist after somebody clicks something.
 *
 * `surface/permissions.ts` declared these two uncovered, and the reason it
 * gave was honest: the contact-log form lives inside
 * `components/defaulters/contact-popover.tsx` and the payment history inside
 * the worklist drawer, so a locator run against a freshly loaded
 * `/protected/defaulters` matched nothing and reported two confident P0s about
 * permissions that were working. Naming the gap beat faking the assertion.
 *
 * This file closes it. Each gate carries an `open` recipe — the clicks that
 * bring the control into existence — so the assertion happens against a page
 * that actually has the control on it. The recipes are written as ordered
 * candidate selectors rather than one exact locator because the row that opens
 * a drawer is data-dependent: a defaulters worklist with no rows has no row to
 * click, and that is a fixture problem the harness must report rather than
 * silently pass.
 *
 * When a recipe cannot be driven, spec 09 records `harness.gate-unreachable`
 * — a P1 that fails the run and says, in the report, that this gate was not
 * asserted. The alternative is a green run whose green covers two permissions
 * nobody checked, which is the exact failure the coverage ledger exists to
 * prevent.
 */

export type InteractionGate = {
  id: string;
  route: string;
  permission: string;
  /**
   * Clicks that expose the control, in order. Each step is a list of candidate
   * selectors; the first visible match is used. A step that matches nothing
   * makes the gate unreachable, and that is a finding.
   */
  open: readonly { describe: string; candidates: readonly string[] }[];
  /** The control itself, once the recipe has run. */
  locator: string;
  presentFor: readonly StaffRoleName[];
  note: string;
};

export const INTERACTION_GATES: readonly InteractionGate[] = [
  {
    id: "defaulters.contact-log",
    route: "/protected/defaulters",
    permission: "contacts:write",
    open: [
      {
        describe: "open the contact popover on the first worklist row",
        candidates: [
          '[data-testid="defaulter-row"] button:has-text("Log")',
          'button:has-text("Log contact")',
          'button:has-text("Log call")',
          'button[aria-label*="contact" i]',
          '[data-defaulter-row] button',
        ],
      },
    ],
    // The form's submit, not the popover itself — a read-only role may well be
    // allowed to READ the contact history and must still not be able to write.
    locator:
      'form button[type="submit"]:has-text("Save"), button:has-text("Log contact"), textarea[name*="note" i]',
    presentFor: ["admin", "fee_collector"],
    note:
      "contacts:write gates the form inside the popover. admin and fee_collector "
      + "write contact history; nobody else does.",
  },
  {
    id: "defaulters.payment-history",
    route: "/protected/defaulters",
    permission: "payments:view",
    open: [
      {
        describe: "open the worklist drawer on the first defaulter",
        candidates: [
          '[data-testid="defaulter-row"] button:has-text("Details")',
          'button:has-text("Fee breakdown")',
          'button:has-text("View details")',
          '[data-defaulter-row]',
          'table tbody tr:first-child',
        ],
      },
    ],
    // view_only lacks payments:view and receives a REDACTED payload rather than
    // a hidden panel — lib/defaulters/data.ts nulls lastPaymentDate. So the
    // assertion is on a rendered date, not on the panel's existence.
    locator:
      '[data-testid="last-payment-date"], text=/Last paid/i, text=/Last payment/i',
    presentFor: ["admin", "accountant", "teacher", "fee_collector"],
    note:
      "payments:view decides whether the drawer shows a last-payment date or a "
      + "redaction. view_only must see the redaction.",
  },
];

export const INTERACTION_GATE_DIMENSION = registerDimension({
  id: "rbac.interaction-gate",
  label: "In-page gates behind a popover or drawer",
  domain: INTERACTION_GATES.map((gate) => gate.id),
  strategy: "exhaustive-single-factor",
});

/**
 * Segment x role.
 *
 * The last run's note read: "Segment × role is not covered; only the
 * permission-gated chip is checked per role." The chip check answers whether a
 * role can *see* a filter. It does not answer whether applying that filter as
 * that role returns a page rather than a crash — which is the question a
 * teacher opening a saved link actually asks.
 */
export const SEGMENT_ROLE_DIMENSION = registerDimension({
  id: "param.student-segment-by-role",
  label: "Student segments crossed with staff role",
  domain: [],
  strategy: "exhaustive-pairwise",
  pairedWith: ["rbac.role", "param.student-segment"],
});
