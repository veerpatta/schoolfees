import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { staffRoles } from "@/platform/auth/roles";
import { getDefaultProtectedHref } from "@/platform/config/navigation";

/**
 * `/protected` is redirected by the middleware, and why that matters.
 *
 * The page still calls `redirect(getDefaultProtectedHref(role))`, but the app
 * is `force-dynamic` and streams: by the time the page resolves, the root
 * layout has flushed, so Next answers 200 with the shell and carries the
 * redirect in the RSC payload. The client Router then swaps trees during
 * hydration, which is what produced "Rendered more hooks than during the
 * previous render" on `/protected` — 19 events over two weeks (SCHOOLFEES-8).
 *
 * Moving it to the middleware makes it a real 307 before anything renders. The
 * cost is a second copy of the role→landing map, because
 * `src/platform/config/navigation.ts` imports the whole lucide-react icon set and the
 * middleware runs on every request. This file is what stops that copy drifting.
 */

const middlewareSource = readFileSync(
  path.join(process.cwd(), "src/platform/supabase/middleware.ts"),
  "utf8",
);

/** Pull `DEFAULT_LANDING` out of the middleware source as data. */
function middlewareLandings(): Record<string, string> {
  const block = middlewareSource.match(
    /const DEFAULT_LANDING: Record<StaffRole, string> = \{([\s\S]*?)\};/,
  )?.[1];

  expect(block, "DEFAULT_LANDING is no longer a literal map in the middleware").toBeTruthy();

  const landings: Record<string, string> = {};
  for (const [, role, href] of block!.matchAll(/(\w+):\s*"([^"]+)"/g)) {
    landings[role] = href;
  }
  return landings;
}

describe("the /protected root redirect", () => {
  it("agrees with getDefaultProtectedHref for every role", () => {
    const landings = middlewareLandings();

    for (const role of staffRoles) {
      expect(
        landings[role],
        `src/platform/supabase/middleware.ts sends "${role}" somewhere other than ` +
          "getDefaultProtectedHref() does. One of them is wrong.",
      ).toBe(getDefaultProtectedHref(role));
    }

    expect(Object.keys(landings).sort()).toEqual([...staffRoles].sort());
  });

  it("never sends /protected back to itself", () => {
    // Hard safety rule 4. A self-redirect is an infinite loop that locks every
    // staff member out of the workspace entirely.
    for (const role of staffRoles) {
      expect(getDefaultProtectedHref(role)).not.toBe("/protected");
    }
    for (const href of Object.values(middlewareLandings())) {
      expect(href).not.toBe("/protected");
      expect(href.startsWith("/protected/")).toBe(true);
    }
  });

  it("only fires on the exact path, never on a child route", () => {
    // `/protected/students` must reach its page. Matching a prefix here would
    // redirect the entire workspace to the dashboard.
    expect(middlewareSource).toContain('pathname === "/protected"');
    expect(middlewareSource).toMatch(/if \(pathname === "\/protected"\) \{/);
  });

  it("falls through to the page when the claim gives no usable role", () => {
    // The DB `users.role` stays authoritative; the JWT mirror is only a
    // shortcut. No claim means the page does what it always did.
    expect(middlewareSource).toContain("const target = role ? DEFAULT_LANDING[role] : null;");
    expect(middlewareSource).toMatch(/if \(target && target !== "\/protected"\)/);
  });

  it("keeps the page redirect as the fallback", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/protected/page.tsx"),
      "utf8",
    );
    expect(
      pageSource,
      "The page redirect is the fallback for a missing or unrecognised claim; " +
        "removing it would leave /protected rendering nothing at all.",
    ).toContain("redirect(getDefaultProtectedHref(");
  });
});
