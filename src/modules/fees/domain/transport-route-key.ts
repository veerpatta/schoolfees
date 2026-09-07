/**
 * The two constants a route picker needs, and nothing else.
 *
 * Kept apart from `label.ts` on purpose: that module pulls in the currency
 * formatter, and the client components that render a route picker sit under
 * gzip ceilings in `quality/route-bundle-baseline.json`. A student charged
 * transport through `student_fee_overrides.custom_transport_fee_amount` has no
 * `transport_route_id`, so a picker keyed on ids could never select them and
 * every route-grouped board filed them under "No transport". This key gives
 * them a bucket of their own.
 */

/** The filter/group value for "on transport at a custom amount, not on any route". */
export const CUSTOM_TRANSPORT_ROUTE_KEY = "custom";

/** The label for that bucket wherever routes are rolled up or filtered. */
export const CUSTOM_TRANSPORT_BUCKET_LABEL = "Custom amount (no route)";

/**
 * A `transport_routes` row named this is a placeholder meaning "not on
 * transport", not a real route. Compared case-insensitively and trimmed.
 */
export const SENTINEL_NO_TRANSPORT_ROUTE_NAME = "no transport";

/** Shown when the student genuinely has no transport and is charged nothing. */
export const NO_TRANSPORT_LABEL = "No transport";

/**
 * True when this route row is the placeholder rather than a real route.
 *
 * Lives here rather than in `label.ts` for the reason this module exists: every
 * route PICKER needs it, and `label.ts` pulls in the currency formatter that
 * those client components cannot afford. `label.ts` re-exports it, so no
 * existing import path changes.
 */
export function isSentinelNoTransportRoute(routeName: string | null | undefined): boolean {
  return (routeName ?? "").trim().toLowerCase() === SENTINEL_NO_TRANSPORT_ROUTE_NAME;
}
