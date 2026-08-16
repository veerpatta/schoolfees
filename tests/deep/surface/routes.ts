import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { registerDimension } from "../lib/coverage";

/**
 * The route surface, read off the filesystem rather than typed out.
 *
 * A hand-maintained route list is the thing that silently shrinks coverage: the
 * app grows a page, nobody adds it here, and the report still says "every
 * protected route". Globbing `app/protected/**` + "/page.tsx" means a new page is
 * either covered or — if it needs a dynamic id the harness cannot invent — it
 * shows up by name in the ledger's `notVisited` list.
 *
 * The old suite's hand-list had already drifted: it probed
 * `/protected/students/families` and `/protected/students/family/[id]/pay`,
 * neither of which has a `page.tsx`, and counted both as covered routes.
 */

const APP_ROOT = path.resolve(process.cwd(), "app");

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** `app/protected/students/[studentId]/page.tsx` -> `/protected/students/[studentId]` */
function toRoutePath(file: string): string {
  const relative = path.relative(APP_ROOT, path.dirname(file)).split(path.sep).join("/");
  const withoutGroups = relative
    .split("/")
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
    .join("/");
  return `/${withoutGroups}`.replace(/\/+$/, "") || "/";
}

const allFiles = walk(APP_ROOT);

export const DYNAMIC_SEGMENT = /\[[^\]]+\]/;

/** Every page under `app/protected`, dynamic ones included. */
export const ALL_PROTECTED_PAGES: readonly string[] = [
  ...new Set(
    allFiles
      .filter((file) => path.basename(file) === "page.tsx")
      .map(toRoutePath)
      .filter((route) => route.startsWith("/protected")),
  ),
].sort();

/** Pages a sweep can visit with no id substitution. */
export const STATIC_PROTECTED_PAGES: readonly string[] = ALL_PROTECTED_PAGES.filter(
  (route) => !DYNAMIC_SEGMENT.test(route),
);

export const DYNAMIC_PROTECTED_PAGES: readonly string[] = ALL_PROTECTED_PAGES.filter((route) =>
  DYNAMIC_SEGMENT.test(route),
);

/** Every route handler in the app, including `/api/**` and the co-located ones. */
export const ALL_ROUTE_HANDLERS: readonly string[] = [
  ...new Set(
    allFiles.filter((file) => path.basename(file) === "route.ts").map(toRoutePath),
  ),
].sort();

export const STATIC_ROUTE_HANDLERS: readonly string[] = ALL_ROUTE_HANDLERS.filter(
  (route) => !DYNAMIC_SEGMENT.test(route),
);

/** Public pages that must render without a session. */
export const PUBLIC_PAGES: readonly string[] = ["/", "/auth/login"];

/**
 * Legacy aliases and how each is supposed to behave.
 *
 * The three redirects do NOT treat their query strings alike, and that is a
 * documented difference rather than an accident:
 *   /protected/collections  rebuilds the full query, repeated keys included
 *   /protected/dues         keeps the first value of a repeated key, drops empties
 *   /protected/advanced     drops the query entirely
 * The harness asserts each one's actual contract, so "fixing" one to match the
 * others would show up as a finding rather than as a silent behaviour change.
 */
export type LegacyAlias = {
  from: string;
  expect: RegExp;
  kind: "redirect" | "shim";
  /** Whether the alias is expected to carry `?session=` through. */
  keepsQuery: boolean;
};

export const LEGACY_ALIASES: readonly LegacyAlias[] = [
  { from: "/protected/collections", expect: /\/protected\/payments/, kind: "redirect", keepsQuery: true },
  { from: "/protected/dues", expect: /\/protected\/transactions/, kind: "redirect", keepsQuery: true },
  { from: "/protected/advanced", expect: /\/protected\/admin-tools/, kind: "redirect", keepsQuery: false },
  { from: "/protected/setup", expect: /\/protected\/admin-tools/, kind: "redirect", keepsQuery: false },
  // A file re-export, not a redirect: the URL stays put and Fee Setup renders.
  { from: "/protected/fee-structure", expect: /\/protected\/fee-structure/, kind: "shim", keepsQuery: true },
];

/**
 * Route families for the device sweep.
 *
 * Layout breaks are a property of a component family, not of a URL — the
 * students list and the defaulters list share their table shell, so visiting
 * both on three devices buys almost nothing over visiting one. 14 families
 * across 3 devices is 42 loads; 44 pages across 3 devices is 132 for the same
 * signal.
 */
export const ROUTE_FAMILIES: Readonly<Record<string, string>> = {
  dashboard: "/protected/dashboard",
  students: "/protected/students",
  studentDetail: "/protected/students/:id",
  feeSetup: "/protected/fee-setup",
  payments: "/protected/payments",
  transactions: "/protected/transactions",
  receipts: "/protected/receipts",
  defaulters: "/protected/defaulters",
  exports: "/protected/exports",
  imports: "/protected/imports",
  adminTools: "/protected/admin-tools",
  financeControls: "/protected/finance-controls",
  settings: "/protected/settings",
  ledger: "/protected/ledger",
};

/**
 * Routes whose page identity is worth asserting: the sweep should know the
 * difference between "rendered" and "rendered the right thing".
 */
export const ROUTE_IDENTITY: Readonly<Record<string, RegExp>> = {
  "/protected/dashboard": /dashboard|collected|pending/i,
  "/protected/students": /student|SR no|class/i,
  "/protected/fee-setup": /fee|installment|tuition/i,
  "/protected/payments": /payment|collect|receipt|amount/i,
  "/protected/transactions": /transaction|receipt|collection/i,
  "/protected/defaulters": /defaulter|pending|follow/i,
  "/protected/exports": /export|download|xlsx/i,
  "/protected/admin-tools": /admin|tools|session/i,
};

export const PAGES_DIMENSION = registerDimension({
  id: "route.page",
  label: "Protected pages",
  domain: STATIC_PROTECTED_PAGES,
  strategy: "exhaustive-single-factor",
  pairedWith: ["rbac.role", "device.viewport"],
});

export const HANDLERS_DIMENSION = registerDimension({
  id: "route.handler",
  label: "Route handlers",
  domain: STATIC_ROUTE_HANDLERS,
  strategy: "exhaustive-single-factor",
});

export const DYNAMIC_PAGES_DIMENSION = registerDimension({
  id: "route.dynamic-page",
  label: "Dynamic pages (visited with a discovered id)",
  domain: DYNAMIC_PROTECTED_PAGES,
  strategy: "targeted-scenarios",
  note: "Visited only when discovery found an id of the right shape.",
});

export const ALIAS_DIMENSION = registerDimension({
  id: "route.legacy-alias",
  label: "Legacy route aliases",
  domain: LEGACY_ALIASES.map((alias) => alias.from),
  strategy: "exhaustive-single-factor",
});

export const FAMILY_DIMENSION = registerDimension({
  id: "route.family",
  label: "Route families (device sweep)",
  domain: Object.keys(ROUTE_FAMILIES),
  strategy: "exhaustive-pairwise",
  pairedWith: ["device.viewport"],
});
