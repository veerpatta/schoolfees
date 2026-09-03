/**
 * Who is allowed through.
 *
 * This app has three layers and only the third is authorisation:
 *
 *   1. `src/proxy.ts` → `src/platform/supabase/middleware.ts` redirects an unauthenticated
 *      visitor away from `/protected/**`. It checks no permission, and — this
 *      is the part that matters — it does not cover `/api/**` at all. An
 *      `src/app/api/.../route.ts` with no helper call is open to the internet.
 *   2. `src/app/protected/layout.tsx` calls `requireAuthenticatedStaff()`. Still
 *      no permission: every signed-in staff member passes, including
 *      `view_only`.
 *   3. The per-surface `requireStaffPermission(...)` / `hasStaffPermission(...)`
 *      call. This is the only thing standing between a teacher and the
 *      finance-controls export.
 *
 * So the two failures worth a P0 are different, and are recorded as different
 * rules: `scan.route-unguarded` (nothing at all — anonymous access) and
 * `scan.route-unauthorised` (authenticated but never authorised — any staff
 * member, any role).
 *
 * Two idioms both count as a guard and both must be recognised, because the
 * repo genuinely uses both:
 *
 *   await requireStaffPermission("payments:view");                 // throws
 *   const staff = await getAuthenticatedStaff();                   // manual
 *   if (!staff || !hasStaffPermission(staff, "payments:bulk")) …
 *
 * And one idiom looks like a guard and is not: `hasRolePermission` from
 * `@/platform/auth/roles` shapes the UI (which shortcuts to show, which nav item to
 * render). Counting it would bless `src/app/api/manifest/route.ts`, which uses it
 * to *choose* a payload and never to deny. It is excluded here on purpose.
 *
 * The known-hard case is the indirect guard: the four promotion actions in
 * `src/app/protected/admin-tools/promotion/actions.ts` hold no check themselves
 * and delegate to `src/modules/promotion/data/queries.ts`, which calls
 * `requireStaffPermission("students:write")`. A file-local rule reports four
 * false positives there, and four false positives is how a P0 rule gets muted.
 * So the check follows one hop into locally-imported modules before it accuses
 * anybody — and says so in the finding when it did.
 */

export const id = "guards";
export const title = "Route and action authorisation";

/** Denial helpers. Reaching one of these means the caller can be refused. */
const PERMISSION_GUARDS = [
  "requireStaffPermission",
  "requireAnyStaffPermission",
  "hasStaffPermission",
  "hasAnyStaffPermission",
  "staffCan",
];

/** Authentication only: proves who, never what they may do. */
const AUTH_ONLY = ["getAuthenticatedStaff", "requireAuthenticatedStaff"];

/**
 * Surfaces that are public by design, each with the reason.
 *
 * An allowlist and not a heuristic: "this route has no guard" is exactly the
 * finding, so the only honest way to exempt one is to name it and say why. A
 * new public route has to be added here deliberately, which is the review the
 * rule is trying to force.
 */
const PUBLIC_BY_DESIGN = new Map([
  ["src/app/auth/confirm/route.ts", "Supabase OTP verification — the pre-auth entry point itself."],
  [
    "src/app/r/[code]/page.tsx",
    "The QR receipt-verification page a parent opens without an account. Deliberately minimal "
      + "disclosure — receipt number, date, amount, reversed? — behind a point lookup on "
      + "receipt_number, and noindex. Widening what it returns is the change that needs review, "
      + "not the absence of a staff guard.",
  ],
  [
    "src/app/api/manifest/route.ts",
    "The PWA manifest. Reads the session opportunistically to pick shortcuts and never denies; carries no student data.",
  ],
  [
    "src/app/auth/login/actions.ts",
    "Sign-in. Guarding it would require the session it exists to create.",
  ],
  [
    "src/app/pay/[code]/page.tsx",
    "The pay link a parent taps from a WhatsApp reminder. There is no session to "
      + "require: the visitor is a parent on their own phone. It is a payment "
      + "link, not a portal — it shows an amount, a UPI id and a date, and "
      + "NOTHING else. No name, no class, no admission number, no history, which "
      + "is stricter than /r/[code]. The code is 160 bits of randomness in a "
      + "unique index, expires with the notice, and is rejected on shape before "
      + "reaching Postgres. Widening what this page shows is the change that "
      + "needs review, not the absence of a staff guard.",
  ],
  [
    "src/app/api/webhooks/aisensy/route.ts",
    "AiSensy delivery webhook. There is no staff session to require — the caller "
      + "is a provider, not a person. It is guarded by AISENSY_WEBHOOK_SECRET and "
      + "is a no-op 404 until that is set, which it is not (webhooks are a "
      + "Pro-plan feature). It writes only delivery_status/delivered_at/read_at "
      + "onto a row matched by provider_message_id, and returns no student data "
      + "in any response. Widening what it writes is the change that needs "
      + "review, not the absence of a staff guard.",
  ],
]);

/**
 * The sign-in flow. Pre-auth by definition — login, sign-up, the password
 * reset pair, and the two result screens. A route handler under here is not
 * covered: `src/app/auth/confirm/route.ts` is listed individually above, so
 * adding a second handler to this directory still has to be argued for.
 */
const PRE_AUTH_ZONE = /^src\/app\/auth\/[^/]+\/page\.tsx$/;

/** Shared-secret surfaces: no staff session, but a token that must be checked. */
const SECRET_GUARDED = [
  { pattern: /CRON_SECRET/, name: "CRON_SECRET" },
  { pattern: /SCHOOLFEES_DOC_TOKEN/, name: "SCHOOLFEES_DOC_TOKEN" },
  { pattern: /SCHOOLFEES_MCP_TOKEN/, name: "SCHOOLFEES_MCP_TOKEN" },
];

function mentions(text, names) {
  return names.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(text));
}

/**
 * Follow one hop into locally-imported modules.
 *
 * Deliberately one hop and not a full closure: two hops starts blessing files
 * that merely sit in the same dependency tree as a guard, and a permission
 * check three modules away from the route handler is not a check a reviewer
 * can see either.
 */
function guardsViaImport(file, project) {
  for (const target of project.imports.get(file.rel) ?? []) {
    const imported = project.get(target);
    if (!imported) continue;
    // Only follow into modules the file could plausibly be delegating to.
    // platform/ matters most here: requireAuthenticatedStaff lives in
    // src/platform/supabase/session.ts, so a route that delegates its guard
    // reads as unguarded if this does not follow into it. utils/ is gone.
    if (!/^src\/(lib|app|platform|ui|modules)\//.test(target)) continue;
    const found = mentions(imported.text, PERMISSION_GUARDS);
    if (found.length > 0) return { via: target, helpers: found };
  }
  return null;
}

/** A page that only redirects elsewhere inherits the destination's guard. */
function isPureRedirect(file) {
  const body = file.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  if (!/\bredirect\s*\(/.test(body)) return false;
  // No data access of its own: nothing to leak before the redirect happens.
  return !/createClient\(|createAdminClient\(|\.from\(/.test(body);
}

/** `export { default } from "…"` — the guard lives in the re-exported module. */
function isReExport(file) {
  return /export\s*\{\s*default\s*\}\s*from/.test(file.text);
}

function surfaceKind(rel) {
  if (/\/route\.[tj]sx?$/.test(rel)) return "route handler";
  if (/\/page\.tsx$/.test(rel)) return "page";
  return "server action module";
}

export async function run({ project, sink, coverage }) {
  const surfaces = [
    ...project.routeHandlers,
    ...project.pages,
    ...project.serverActions,
  ];
  // A file can be both a page and an action module only in theory; dedupe anyway.
  const seen = new Set();
  const unique = surfaces.filter((file) => {
    if (seen.has(file.rel)) return false;
    seen.add(file.rel);
    return true;
  });

  let examined = 0;

  for (const file of unique) {
    examined += 1;
    const kind = surfaceKind(file.rel);

    if (PUBLIC_BY_DESIGN.has(file.rel)) continue;
    // Everything under app/auth/ is the sign-in flow itself: a guard there
    // would need the session the flow exists to produce. Named as a zone
    // rather than six individual entries, because the whole directory has
    // one reason and it is the same reason.
    if (PRE_AUTH_ZONE.test(file.rel)) continue;
    if (isPureRedirect(file) || isReExport(file)) continue;

    const permission = mentions(file.text, PERMISSION_GUARDS);
    if (permission.length > 0) continue;

    const secret = SECRET_GUARDED.find((entry) => entry.pattern.test(file.text));
    const auth = mentions(file.text, AUTH_ONLY);
    const indirect = guardsViaImport(file, project);

    if (indirect) continue;

    if (secret) {
      // A shared secret is a real guard for a machine caller. It is not a
      // staff permission, and the distinction matters if the route ever grows
      // a UI — but it is not a finding today.
      continue;
    }

    if (auth.length > 0) {
      sink.record({
        rule: "scan.route-unauthorised",
        file: file.rel,
        line: file.lines.findIndex((line) => new RegExp(`\\b${auth[0]}\\s*\\(`).test(line)) + 1,
        title: `${file.rel} authenticates but never authorises`,
        expected:
          "Every app surface that reads or writes school data checks a StaffPermission, "
          + "not just a session.",
        actual:
          `Calls ${auth.join(", ")} and no permission helper. Every signed-in staff member `
          + `reaches it — including view_only and teacher.`,
        evidence: file.lines[
          file.lines.findIndex((line) => new RegExp(`\\b${auth[0]}\\s*\\(`).test(line))
        ],
        why:
          "src/app/protected/layout.tsx already establishes the session. A surface that stops "
          + "there is guarded against the public and open to the whole staff roll.",
        fix:
          "Add requireStaffPermission(\"<permission>\") — or, for the manual idiom, "
          + "`if (!staff || !hasStaffPermission(staff, \"<permission>\")) return new Response(…, { status: 403 })`.",
      });
      continue;
    }

    sink.record({
      rule: "scan.route-unguarded",
      file: file.rel,
      line: 1,
      title: `${file.rel} has no authentication and no authorisation`,
      expected:
        "Every app surface either calls an auth helper, checks a StaffPermission, verifies a "
        + "shared secret, or is named in PUBLIC_BY_DESIGN with a reason.",
      actual:
        `This ${kind} calls none of ${[...PERMISSION_GUARDS, ...AUTH_ONLY].join(", ")}, `
        + "verifies no shared secret, and delegates to no locally-imported module that does.",
      evidence: file.lines.slice(0, 3).join(" ").slice(0, 200),
      why:
        file.rel.startsWith("src/app/api/")
          ? "proxy.ts redirects unauthenticated traffic away from /protected only. /api/** is not "
            + "covered, so an unguarded handler here is reachable without a session at all."
          : "The protected layout covers authentication, but a surface that never names a "
            + "permission cannot refuse anybody who is signed in.",
      fix:
        "Add the guard, or — if it really is public — add it to PUBLIC_BY_DESIGN in "
        + "tests/scan/checks/guards.mjs with the reason, so the next reader sees a decision "
        + "rather than an omission.",
    });
  }

  coverage.declare({
    check: id,
    dimension: "app route handlers, pages and server-action modules",
    domainSize: unique.length,
    examined,
    strategy: "exhaustive",
    note:
      "Sees a guard only where it is named in the file or one import hop away. A guard behind "
      + "two hops, or inside a helper this check does not follow, reports as a finding — which "
      + "is the safer direction to be wrong in. In-page conditional rendering is not "
      + "authorisation and is deliberately not counted.",
  });
}
