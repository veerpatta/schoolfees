/**
 * Canonical transport-route label. The one place that decides whether a student
 * is shown as having transport.
 *
 * The bug this exists to kill: every surface derived the label from the
 * `transport_route_id` join alone and never looked at
 * `student_fee_overrides.custom_transport_fee_amount`. The fee engine resolves
 * the override FIRST (see v_workbook_student_financials.transport_fee and
 * lib/fees/policy.ts), so a student with a custom transport amount and no route
 * was CHARGED for transport while every screen said "No Transport". Measured on
 * the live 2026-27 session: 3 active students, Rs 29,500 a year.
 *
 * Two distinct ways that happened, both handled here:
 *
 *   1. No route assigned + a custom amount set. The old ternary fell through to
 *      its "No Transport" else-branch.
 *   2. A real `transport_routes` row literally NAMED "No Transport", seeded with
 *      annual_fee_amount = 0 and still selectable in the student form. Its
 *      `route_name` printed as "No Transport" -- visually identical to case 1 --
 *      while an override could still charge. The fee engines already special-
 *      case this sentinel by name (lib/fees/generator.ts,
 *      lib/system-sync/financial-sync.ts); the display layer never did.
 *
 * Previously this logic was copy-pasted as a private `buildRouteLabel` in
 * lib/defaulters/data.ts, lib/receipts/data.ts, lib/workbook/data.ts and
 * lib/reports/data.ts, plus inline ternaries in lib/students/data.ts and a
 * scattering of `?? "No Transport"` fallbacks. All of them are now this.
 */

import { formatInr } from "@/lib/helpers/currency";

/**
 * A `transport_routes` row named this is a placeholder meaning "not on
 * transport", not a real route. Compared case-insensitively and trimmed.
 */
export const SENTINEL_NO_TRANSPORT_ROUTE_NAME = "no transport";

/** Shown when the student genuinely has no transport and is charged nothing. */
export const NO_TRANSPORT_LABEL = "No transport";

export type TransportRouteLike = {
  route_name?: string | null;
  route_code?: string | null;
  /** camelCase shape used by the payment desk / defaulters projections. */
  routeName?: string | null;
  routeCode?: string | null;
} | null | undefined;

export type TransportLabelInput = {
  /** Joined `transport_routes` row, in either snake_case or camelCase shape. */
  route?: TransportRouteLike;
  /** Or pass the pieces directly when there is no row to hand. */
  routeName?: string | null;
  routeCode?: string | null;
  /** `student_fee_overrides.custom_transport_fee_amount`. */
  customTransportFeeAmount?: number | null;
  /**
   * The amount actually being charged, if known -- e.g.
   * `v_workbook_student_financials.transport_fee`. Used only to detect a charge
   * with no route when no explicit override amount was passed.
   */
  transportFeeAmount?: number | null;
};

/**
 * True when this route row is the "No Transport" placeholder rather than a real
 * route. Accepts the name directly so callers filtering a picker can use it.
 */
export function isSentinelNoTransportRoute(routeName: string | null | undefined): boolean {
  return (routeName ?? "").trim().toLowerCase() === SENTINEL_NO_TRANSPORT_ROUTE_NAME;
}

function readRoute(input: TransportLabelInput): { name: string | null; code: string | null } {
  const name = input.routeName ?? input.route?.route_name ?? input.route?.routeName ?? null;
  const code = input.routeCode ?? input.route?.route_code ?? input.route?.routeCode ?? null;

  const trimmedName = name?.trim() ?? "";
  if (!trimmedName || isSentinelNoTransportRoute(trimmedName)) {
    return { name: null, code: null };
  }

  const trimmedCode = code?.trim() ?? "";
  return { name: trimmedName, code: trimmedCode || null };
}

function readChargedAmount(input: TransportLabelInput): number {
  const explicit = input.customTransportFeeAmount;
  if (explicit !== null && explicit !== undefined && Number.isFinite(explicit)) {
    return Math.max(0, Math.trunc(explicit));
  }

  const resolved = input.transportFeeAmount;
  if (resolved !== null && resolved !== undefined && Number.isFinite(resolved)) {
    return Math.max(0, Math.trunc(resolved));
  }

  return 0;
}

/**
 * The label to render wherever a student's transport route is shown.
 *
 * - Real route            -> `Route name (CODE)`, or just the name without a code.
 * - No route but charged  -> `Custom transport (₹12,000)` — never "No transport".
 * - Neither               -> `No transport`.
 *
 * The amount is deliberately NOT appended to a real route's label: every table
 * that shows a route also has its own transport-amount column, and doubling it
 * up would break those layouts. The custom case has no such column, which is
 * exactly why the charge was invisible.
 */
export function buildTransportRouteLabel(input: TransportLabelInput): string {
  const { name, code } = readRoute(input);

  if (name) {
    return code ? `${name} (${code})` : name;
  }

  const charged = readChargedAmount(input);
  if (charged > 0) {
    return `Custom transport (${formatInr(charged)})`;
  }

  return NO_TRANSPORT_LABEL;
}

/**
 * True when the student is on transport in any sense — a real route, or a
 * custom amount with no route. Use for "has transport" filters and badges so
 * they agree with the label.
 */
export function hasTransport(input: TransportLabelInput): boolean {
  return Boolean(readRoute(input).name) || readChargedAmount(input) > 0;
}
