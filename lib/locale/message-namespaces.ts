/**
 * Which translation namespaces each route ships to the browser.
 *
 * `app/layout.tsx` handed the whole catalog to `LanguageProvider`, a client
 * component, so React serialized all of it into the flight payload of every
 * response: 100 KB for English, 155 KB for Hindi, on the login screen as much
 * as on the Payment Desk. A page uses one or two namespaces.
 *
 * Server Components are unaffected either way — `getTranslations` reads the
 * full catalog server-side through `i18n/request.ts` and never serializes it.
 * This only decides what client components can look up.
 *
 * **Be generous.** A namespace missing from a route renders the raw key
 * (`Defaulters.title`) in front of office staff. The saving from trimming one
 * more 5 KB namespace is not worth that, so where a screen might reach a
 * component from another module, list the other module too. `ALL_NAMESPACES`
 * is the fallback for anything unmatched, which keeps a new route correct until
 * somebody adds it here.
 */

export const ALL_NAMESPACES = [
  "Common",
  "Locale",
  "Toasts",
  "Roles",
  "Navigation",
  "Activity",
  "Segments",
  "MobileApp",
  "Dashboard",
  "Students",
  "Payments",
  "Receipts",
  "Transactions",
  "Defaulters",
  "FeeSetup",
  "Exports",
  "AdminTools",
] as const;

export type MessageNamespace = (typeof ALL_NAMESPACES)[number];

/** Needed anywhere, including the signed-out pages. */
const CORE: MessageNamespace[] = [
  "Common",
  "Locale",
  "Toasts",
  "Roles",
  "Navigation",
  "Activity",
  "Segments",
];

/** CORE plus what the signed-in shell itself renders (mobile nav, takeover bar). */
const SHELL: MessageNamespace[] = [...CORE, "MobileApp"];

/**
 * Longest prefix wins, so `/protected/students/bulk-update` can differ from
 * `/protected/students` if it ever needs to. Order does not matter.
 */
const ROUTE_NAMESPACES: ReadonlyArray<readonly [string, MessageNamespace[]]> = [
  ["/protected/dashboard", [...SHELL, "Dashboard"]],
  ["/protected/settings/glossary", [...SHELL, "Dashboard"]],
  // Student screens reach the collect button, receipt share and print actions.
  ["/protected/students", [...SHELL, "Students", "Payments", "Receipts"]],
  ["/protected/fee-setup", [...SHELL, "FeeSetup", "Students"]],
  ["/protected/fee-structure", [...SHELL, "FeeSetup", "Students"]],
  ["/protected/payments", [...SHELL, "Payments", "Students", "Receipts"]],
  ["/protected/collections", [...SHELL, "Payments", "Students", "Receipts"]],
  // Transactions hosts nine boards, including the defaulter and receipt tables.
  [
    "/protected/transactions",
    [...SHELL, "Transactions", "Payments", "Receipts", "Students", "Defaulters"],
  ],
  [
    "/protected/dues",
    [...SHELL, "Transactions", "Payments", "Receipts", "Students", "Defaulters"],
  ],
  ["/protected/defaulters", [...SHELL, "Defaulters", "Students", "Payments"]],
  ["/protected/receipts", [...SHELL, "Receipts", "Payments", "Students"]],
  ["/protected/ledger", [...SHELL, "Transactions", "Students", "Receipts"]],
  ["/protected/exports", [...SHELL, "Exports", "Transactions", "Students"]],
  ["/protected/reports", [...SHELL, "Exports", "Transactions", "Students"]],
  ["/protected/imports", [...SHELL, "AdminTools", "Students"]],
  ["/protected/password", SHELL],
  ["/protected/access-denied", SHELL],
];

const PUBLIC_PREFIXES = ["/auth", "/r"];

/**
 * The namespaces a path needs.
 *
 * Anything under `/protected` that is not listed above — Admin Tools, Master
 * Data, Staff, Settings, and every route added after this file was written —
 * gets the whole catalog. Those are low-traffic setup screens, so the safe
 * answer costs little there and costs nothing to keep correct.
 */
export function namespacesForPath(pathname: string | null | undefined): MessageNamespace[] {
  if (!pathname) {
    return [...ALL_NAMESPACES];
  }

  if (pathname === "/" || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return CORE;
  }

  let best: { length: number; namespaces: MessageNamespace[] } | null = null;

  for (const [prefix, namespaces] of ROUTE_NAMESPACES) {
    if (
      (pathname === prefix || pathname.startsWith(`${prefix}/`)) &&
      (best === null || prefix.length > best.length)
    ) {
      best = { length: prefix.length, namespaces };
    }
  }

  return best ? best.namespaces : [...ALL_NAMESPACES];
}

/** Copy only the listed top-level namespaces out of a catalog. */
export function pickNamespaces(
  catalog: Record<string, unknown>,
  namespaces: readonly MessageNamespace[],
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};

  for (const namespace of namespaces) {
    if (namespace in catalog) {
      picked[namespace] = catalog[namespace];
    }
  }

  return picked;
}
