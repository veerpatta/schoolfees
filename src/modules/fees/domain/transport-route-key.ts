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
