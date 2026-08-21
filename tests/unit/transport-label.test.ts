import { describe, expect, it } from "vitest";

import {
  NO_TRANSPORT_LABEL,
  buildTransportRouteLabel,
  hasTransport,
  isSentinelNoTransportRoute,
} from "@/modules/fees/domain/label";

describe("buildTransportRouteLabel", () => {
  it("shows the route name and code for a real route", () => {
    expect(
      buildTransportRouteLabel({ route: { route_name: "Sanganer", route_code: "R3" } }),
    ).toBe("Sanganer (R3)");
  });

  it("omits the bracket when a route has no code", () => {
    expect(
      buildTransportRouteLabel({ route: { route_name: "Sanganer", route_code: null } }),
    ).toBe("Sanganer");
  });

  it("accepts the camelCase projection shape", () => {
    expect(
      buildTransportRouteLabel({ route: { routeName: "Tonk Road", routeCode: "R7" } }),
    ).toBe("Tonk Road (R7)");
  });

  it("says no transport when there is no route and nothing is charged", () => {
    expect(buildTransportRouteLabel({ route: null })).toBe(NO_TRANSPORT_LABEL);
    expect(buildTransportRouteLabel({ route: null, customTransportFeeAmount: 0 })).toBe(
      NO_TRANSPORT_LABEL,
    );
  });

  // The reported bug: 3 live students were charged Rs 29,500 a year while every
  // screen said "No Transport", because the label came from the route join only
  // and the fee engine resolves the override first.
  it("shows the amount when a custom transport fee is charged with no route", () => {
    expect(
      buildTransportRouteLabel({ route: null, customTransportFeeAmount: 12000 }),
    ).toBe("Custom transport (₹12,000)");
  });

  it("falls back to the resolved transport fee when no override amount is passed", () => {
    expect(buildTransportRouteLabel({ route: null, transportFeeAmount: 9500 })).toBe(
      "Custom transport (₹9,500)",
    );
  });

  it("prefers the explicit override amount over the resolved fee", () => {
    expect(
      buildTransportRouteLabel({
        route: null,
        customTransportFeeAmount: 8000,
        transportFeeAmount: 12000,
      }),
    ).toBe("Custom transport (₹8,000)");
  });

  // The second way "No Transport" appeared while money was charged: a real
  // transport_routes row literally named "No Transport".
  it("treats a route named 'No Transport' as no route at all", () => {
    expect(
      buildTransportRouteLabel({ route: { route_name: "No Transport", route_code: null } }),
    ).toBe(NO_TRANSPORT_LABEL);
  });

  it("shows the charge for a student parked on the sentinel route with an override", () => {
    expect(
      buildTransportRouteLabel({
        route: { route_name: "  no transport  ", route_code: "NA" },
        customTransportFeeAmount: 6000,
      }),
    ).toBe("Custom transport (₹6,000)");
  });

  it("never appends an amount to a real route, so table columns do not double up", () => {
    expect(
      buildTransportRouteLabel({
        route: { route_name: "Sanganer", route_code: "R3" },
        transportFeeAmount: 12000,
      }),
    ).toBe("Sanganer (R3)");
  });

  it("ignores negative and non-finite amounts", () => {
    expect(buildTransportRouteLabel({ route: null, customTransportFeeAmount: -500 })).toBe(
      NO_TRANSPORT_LABEL,
    );
    expect(buildTransportRouteLabel({ route: null, transportFeeAmount: Number.NaN })).toBe(
      NO_TRANSPORT_LABEL,
    );
  });
});

describe("isSentinelNoTransportRoute", () => {
  it.each(["No Transport", "no transport", "  NO TRANSPORT  "])("matches %s", (name) => {
    expect(isSentinelNoTransportRoute(name)).toBe(true);
  });

  it.each(["Sanganer", "", null, undefined, "No Transport Route"])(
    "does not match %s",
    (name) => {
      expect(isSentinelNoTransportRoute(name)).toBe(false);
    },
  );
});

describe("hasTransport", () => {
  it("agrees with the label in every case", () => {
    expect(hasTransport({ route: { route_name: "Sanganer", route_code: "R3" } })).toBe(true);
    expect(hasTransport({ route: null, customTransportFeeAmount: 1 })).toBe(true);
    expect(hasTransport({ route: { route_name: "No Transport", route_code: null } })).toBe(false);
    expect(hasTransport({ route: null })).toBe(false);
  });
});
