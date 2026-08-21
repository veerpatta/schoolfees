import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  firstSearchParam,
  optionalSearchParam,
  searchParamInteger,
  searchParamIsoDate,
  searchParamString,
} from "@/platform/helpers/search-params";

/**
 * A repeated query parameter took two live pages down.
 *
 * `?session=A&session=B` — or the same value twice, which is exactly what a
 * re-shared link produces — makes Next hand a page `string[]`. Several pages
 * typed theirs as `string`, so TypeScript agreed with them and the array only
 * appeared at runtime as `trim is not a function`, thrown out of a Server
 * Component. In production that renders as a blank page with the message
 * redacted, which is why nobody reported it: the Dashboard and Transactions
 * simply looked broken (Sentry SCHOOLFEES-D, SCHOOLFEES-F).
 *
 * A sibling bug on the same page family: `/^\d{4}-\d{2}-\d{2}$/` accepts
 * `9999-99-99`, which reached Postgres as `date/time field value out of range`
 * (SCHOOLFEES-E). A date-shaped string is not a date.
 */

describe("reading a search param that arrived twice", () => {
  it("takes the first value, like every other switcher in the app", () => {
    expect(firstSearchParam(["TEST-2026-27", "2026-27"])).toBe("TEST-2026-27");
    expect(searchParamString(["  TEST-2026-27  ", "2026-27"])).toBe("TEST-2026-27");
  });

  it("never throws, whatever shape arrives", () => {
    for (const value of [undefined, [], ["", ""], "", "  "] as const) {
      expect(() => searchParamString(value as string | string[] | undefined)).not.toThrow();
    }
    expect(searchParamString([])).toBe("");
    expect(firstSearchParam([])).toBeNull();
  });

  it("treats an empty repeat as absent rather than as a filter", () => {
    expect(optionalSearchParam(["", ""])).toBeUndefined();
    expect(optionalSearchParam(["  "])).toBeUndefined();
    expect(optionalSearchParam(["bhilwara", "x"])).toBe("bhilwara");
  });
});

describe("integer search params", () => {
  it("accepts digits inside the bounds and rejects everything else", () => {
    expect(searchParamInteger("5000")).toBe(5000);
    expect(searchParamInteger(["5000", "1"])).toBe(5000);
    expect(searchParamInteger("-500")).toBeUndefined();
    expect(searchParamInteger("12.5")).toBeUndefined();
    expect(searchParamInteger("abc")).toBeUndefined();
    expect(searchParamInteger(undefined)).toBeUndefined();
  });

  it("honours an explicit ceiling", () => {
    expect(searchParamInteger("500", { max: 100 })).toBeUndefined();
    expect(searchParamInteger("50", { max: 100 })).toBe(50);
  });
});

describe("date search params", () => {
  it("accepts a real date", () => {
    expect(searchParamIsoDate("2026-07-01")).toBe("2026-07-01");
    expect(searchParamIsoDate(["2026-07-01", "2026-08-01"])).toBe("2026-07-01");
  });

  it("rejects a string that is merely shaped like a date", () => {
    // The exact value that reached Postgres and threw.
    expect(searchParamIsoDate("9999-99-99")).toBeNull();
    expect(searchParamIsoDate("2026-13-01")).toBeNull();
    expect(searchParamIsoDate("2026-00-10")).toBeNull();
  });

  it("rejects a day that does not exist in its month", () => {
    // `new Date("2026-02-31")` rolls forward to March rather than failing, so a
    // parse check alone is not enough — the value has to print back unchanged.
    expect(searchParamIsoDate("2026-02-31")).toBeNull();
    expect(searchParamIsoDate("2026-04-31")).toBeNull();
    expect(searchParamIsoDate("2026-02-28")).toBe("2026-02-28");
  });

  it("rejects a year outside the school's plausible range", () => {
    expect(searchParamIsoDate("1899-01-01")).toBeNull();
    expect(searchParamIsoDate("3000-01-01")).toBeNull();
  });

  it("rejects malformed shapes without throwing", () => {
    for (const value of ["", "not-a-date", "2026/07/01", "20260701", undefined]) {
      expect(searchParamIsoDate(value)).toBeNull();
    }
  });
});

describe("resolveViewSession tolerates the array form", () => {
  it("resolves a repeated session to its first value", async () => {
    vi.resetModules();
    vi.doMock("@/platform/session/active", () => ({
      getActiveSessionLabel: async () => "2026-27",
    }));

    const { resolveViewSession } = await import("@/platform/session/resolver");

    // The exact URL shape that threw in production: two identical valid values.
    const repeated = await resolveViewSession({
      searchParamSession: ["TEST-2026-27", "TEST-2026-27"],
      cookieSession: null,
    });
    expect(repeated.sessionLabel).toBe("TEST-2026-27");
    expect(repeated.source).toBe("url");

    const mixed = await resolveViewSession({
      searchParamSession: ["TEST-2026-27", "2026-27"],
      cookieSession: null,
    });
    expect(mixed.sessionLabel).toBe("TEST-2026-27");
  });

  it("falls through to the cookie when every repeated value is invalid", async () => {
    vi.resetModules();
    vi.doMock("@/platform/session/active", () => ({
      getActiveSessionLabel: async () => "2026-27",
    }));

    const { resolveViewSession } = await import("@/platform/session/resolver");

    const resolved = await resolveViewSession({
      searchParamSession: ["garbage", "2026-2027"],
      cookieSession: "TEST-2026-27",
    });

    expect(resolved.sessionLabel).toBe("TEST-2026-27");
    expect(resolved.source).toBe("cookie");
  });

  it("falls through to the active session with no usable input at all", async () => {
    vi.resetModules();
    vi.doMock("@/platform/session/active", () => ({
      getActiveSessionLabel: async () => "2026-27",
    }));

    const { resolveViewSession } = await import("@/platform/session/resolver");

    for (const searchParamSession of [[], ["", ""], undefined, null] as const) {
      const resolved = await resolveViewSession({
        searchParamSession: searchParamSession as string[] | undefined | null,
        cookieSession: null,
      });
      expect(resolved.sessionLabel).toBe("2026-27");
      expect(resolved.source).toBe("default");
    }
  });
});

describe("the pages that crashed no longer read a raw search param", () => {
  /**
   * A source assertion, because the runtime path needs a rendered Server
   * Component to reach. What made these pages fragile was calling `.trim()`
   * straight on a `searchParams` entry; the helper exists so that stops being
   * the habit.
   */
  const FIXED_PAGES = [
    "src/app/protected/imports/page.tsx",
    "src/app/protected/admin-tools/recovery/page.tsx",
    "src/app/protected/fee-setup/time-travel/page.tsx",
  ];

  for (const page of FIXED_PAGES) {
    it(`${page} does not call .trim() on a raw searchParams entry`, () => {
      const source = readFileSync(path.join(process.cwd(), page), "utf8");
      const rawTrim =
        /(resolved|resolvedSearchParams|params|searchParams)\?\.[a-zA-Z]+\??\.trim\(\)/.exec(
          source,
        );

      expect(
        rawTrim?.[0] ?? null,
        `${page} reads a search param as if it were always a string. ` +
          "Use searchParamString()/optionalSearchParam() from lib/helpers/search-params.ts.",
      ).toBeNull();
    });
  }
});
