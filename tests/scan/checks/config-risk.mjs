/**
 * Configuration that only bites in production.
 *
 * Every other check in this directory reads code that runs the same way on a
 * laptop and on Vercel. This one reads the files that make those two places
 * different — `next.config.ts`, `vercel.json`, `tsconfig.json`, and the route
 * segment exports Next.js reads at build time. A mistake in any of them
 * typecheck-passes, test-passes, works in `next dev`, and then fails once, in
 * Mumbai, at 00:00 IST, with nobody watching.
 *
 * The rule is `scan.config-risk` (P2) throughout, with one deliberate demotion
 * to `scan.observation` (P3) explained below. P2 and not P1 because none of
 * these is a wrong number in a ledger: they are the conditions under which a
 * right number never arrives.
 *
 * **This check reports what it read, and nothing else.** A configuration
 * scanner is unusually easy to write badly, because every well-known
 * misconfiguration is a tempting thing to warn about whether or not it is
 * present. So every candidate below is evaluated against the real file, a
 * candidate that comes back correctly configured produces no finding at all,
 * and the coverage note lists those by name — a reader who wants to know
 * whether `ignoreBuildErrors` was checked should not have to guess from an
 * empty findings list.
 *
 * Three candidates were harder than they look, and the reasoning is worth
 * keeping:
 *
 * **`revalidate` on a staff page is not automatically a leak.** Two pages
 * under `app/protected` declare `export const revalidate = 60`, and a cached
 * render of a staff page served to a second staff member would be the worst
 * finding this file could produce. It is not what happens. `app/layout.tsx`
 * sets `dynamic = "force-dynamic"` at the root, and independently both pages
 * reach `cookies()` through `requireStaffPermission()` — either one on its own
 * makes the render dynamic, so the ISR window never opens. `docs/design/
 * design-system.md` section 5.6 documents the directive and says to leave it
 * alone. Reporting a P2 here would be contradicting a decision the repo has
 * already recorded, so the finding is a P3 observation about a directive that
 * states an intent it cannot carry out, and the check keeps the machinery to
 * fire properly if the root directive or the auth call ever goes away.
 *
 * **A missing `maxDuration` is only interesting where the work is unbounded.**
 * Every cron handler runs unattended, but "unattended" is not "slow": one of
 * the two reads a single day of receipts and writes one row. Flagging both
 * would put a real finding next to a shrug. So the check asks for evidence in
 * the handler itself — an explicit row cap in the thousands, or an object
 * storage upload — and names the handler it did not report in the note.
 *
 * **Absent security headers are absent, and that is the whole claim.** The
 * check does not have an opinion about which CSP this app should ship. It
 * verifies that no security response header is configured anywhere a header
 * can be configured — `next.config.ts`, `vercel.json`, `proxy.ts` and the
 * proxy helper — and reports that one fact once, against the `headers()` block
 * that already exists and covers only four public assets.
 *
 * Not checked, on purpose: anything set in the Vercel dashboard rather than in
 * the repo (environment variables, deployment protection, the plan's function
 * duration ceiling), because this scanner reads files and would otherwise be
 * guessing.
 */

export const id = "config-risk";
export const title = "Deployment configuration that only fails in production";

/**
 * The absolute Vercel function ceiling, in seconds.
 *
 * Deliberately the highest number any plan allows rather than the Hobby limit
 * of 300. The plan this project is on is not in the repo, so a check that
 * assumed 300 would report `maxDuration = 300` — a value chosen precisely to
 * sit on the Hobby ceiling — as an error. Above 800 is wrong on every plan,
 * which is a claim the file can actually support.
 */
const FUNCTION_DURATION_CEILING_SECONDS = 800;

/** The Hobby ceiling, quoted in findings so the reader sees both numbers. */
const HOBBY_DURATION_CEILING_SECONDS = 300;

/**
 * Handlers nobody is watching when they fail.
 *
 * A cron gets a 504 and a red dot in a dashboard; an admin maintenance route
 * gets a truncated response and a half-finished repair. Both are worse than an
 * interactive route timing out, where a human sees it immediately.
 */
const UNATTENDED_ROUTE = /^app\/api\/(cron|admin)\//;

/**
 * Evidence that a handler's work grows with the data.
 *
 * Two signals, both structural rather than stylistic. A `.limit(...)` call
 * says the author expected enough rows to need a cap; an object-storage upload
 * says bytes are leaving the process. A handler with neither is doing bounded
 * work and is not reported — which is the difference between the nightly
 * backup, which serialises five tables to CSV and uploads each one, and the
 * day close, which reads one date and writes one row.
 */
const BULK_WORK_SIGNALS = [
  {
    pattern: /\.limit\(/,
    describe: "caps a query with .limit(), so it expects rows in bulk",
    // A cap in the thousands is what makes .limit() evidence of size rather
    // than of a top-10 lookup.
    requiresLargeLiteral: true,
  },
  {
    pattern: /\.storage\b[\s\S]{0,200}?\.upload\(/,
    describe: "uploads to object storage inside the request",
    requiresLargeLiteral: false,
  },
];

/** 5000 and up, with or without numeric separators: 5000, 20_000, 50_000. */
const LARGE_LITERAL = /\b\d{1,3}(?:_\d{3})+\b|\b\d{4,}\b/;

function hasLargeLiteral(text) {
  const match = text.match(LARGE_LITERAL);
  if (!match) return false;
  return Number(match[0].replace(/_/g, "")) >= 5000;
}

/**
 * Response headers that exist to stop an attack.
 *
 * `frame-ancestors` appears alongside `X-Frame-Options` because the modern
 * spelling lives inside a CSP and a check that only looked for the legacy
 * header would report a correctly configured app.
 */
const SECURITY_HEADERS = [
  "Content-Security-Policy",
  "frame-ancestors",
  "X-Frame-Options",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
];

/** Every file in this repo where a response header can be set. */
const HEADER_SURFACES = [
  "next.config.ts",
  "vercel.json",
  "proxy.ts",
  "lib/supabase/proxy.ts",
  "lib/supabase/middleware.ts",
];

/** A module that reads a file off disk through a path Vercel's tracer cannot see. */
const RUNTIME_DISK_READ = /path\.join\(\s*process\.cwd\(\)/;

function lineOf(file, pattern) {
  const index = file.lines.findIndex((line) => pattern.test(line));
  return index === -1 ? null : { line: index + 1, evidence: file.lines[index].trim() };
}

/** Every `export const <name> = <literal>` in a route segment, as a number. */
function segmentExport(file, name) {
  const pattern = new RegExp(`^\\s*export\\s+const\\s+${name}\\s*=\\s*([^;]+);?\\s*$`);
  for (let index = 0; index < file.lines.length; index += 1) {
    const match = file.lines[index].match(pattern);
    if (match) {
      return { line: index + 1, raw: match[1].trim(), evidence: file.lines[index].trim() };
    }
  }
  return null;
}

/**
 * The route path Next.js knows a file by.
 *
 * Route groups are stripped because they do not appear in the URL, and are
 * exactly what makes a hand-written `outputFileTracingIncludes` key drift out
 * of agreement with the file it was meant to name.
 */
function routePathOf(rel) {
  return `/${rel
    .replace(/^app\//, "")
    .replace(/\/(route|page)\.[tj]sx?$/, "")
    .split("/")
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .join("/")}`;
}

/** Files a module reaches, following the local import graph to a fixed point. */
function closureOf(rel, project) {
  const seen = new Set();
  const queue = [rel];
  while (queue.length > 0) {
    const current = queue.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of project.imports.get(current) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

export async function run({ project, sink, coverage }) {
  const nextConfig = project.get("next.config.ts");
  const vercelConfig = project.get("vercel.json");
  const tsConfig = project.get("tsconfig.json");
  const rootLayout = project.get("app/layout.tsx");

  /**
   * Candidates, declared up front.
   *
   * Every entry is answered exactly once below with `resolve(key, verdict)`.
   * The coverage note prints the verdicts, so "no finding" is legible as
   * "checked and clean" rather than as "possibly never ran".
   */
  const verdicts = new Map();
  const resolve = (key, verdict) => verdicts.set(key, verdict);
  const CANDIDATES = [
    "build-error-suppression",
    "function-duration-ceiling",
    "unattended-handler-duration",
    "cron-schedule-and-route-agreement",
    "protected-cache-directive",
    "security-response-headers",
    "sentry-dsn-and-sampling",
    "typescript-strictness",
    "remote-image-patterns",
    "serverless-file-tracing",
    "deployment-region",
  ];

  // ---- next.config.ts: a build that cannot fail ---------------------------
  if (!nextConfig) {
    resolve("build-error-suppression", "NOT CHECKED — next.config.ts is missing");
  } else {
    const suppressions = [
      {
        pattern: /ignoreBuildErrors\s*:\s*true/,
        name: "typescript.ignoreBuildErrors",
        consequence: "type errors ship instead of failing the build",
      },
      {
        pattern: /ignoreDuringBuilds\s*:\s*true/,
        name: "eslint.ignoreDuringBuilds",
        consequence: "lint errors ship instead of failing the build",
      },
    ];
    const found = suppressions.filter((entry) => entry.pattern.test(nextConfig.text));
    if (found.length === 0) {
      resolve(
        "build-error-suppression",
        "clean — neither typescript.ignoreBuildErrors nor eslint.ignoreDuringBuilds is set",
      );
    } else {
      resolve("build-error-suppression", `${found.length} suppression(s) reported`);
      for (const entry of found) {
        const spot = lineOf(nextConfig, entry.pattern);
        sink.record({
          rule: "scan.config-risk",
          file: nextConfig.rel,
          line: spot?.line ?? 1,
          title: `next.config.ts sets ${entry.name} — the production build cannot fail`,
          expected:
            "next build is the last gate before a deployment and reports every type and lint "
            + "error it finds. AGENTS.md names typecheck and lint as steps one and two of the "
            + "validation sequence for exactly that reason.",
          actual: `${entry.name} is true, so ${entry.consequence}.`,
          evidence: spot?.evidence ?? entry.name,
          why:
            "CI (.github/workflows/ci.yml) runs typecheck and lint on pull requests, but a "
            + "deployment does not go through CI — Vercel builds the pushed commit directly. "
            + "With this set, the only check that runs on the code actually being deployed is "
            + "the one that has been told to ignore what it finds.",
          fix:
            `Remove ${entry.name} and fix what the build then reports. If a single file has to `
            + "be excused, exclude that file rather than disabling the gate for the repository.",
        });
      }
    }
  }

  // ---- maxDuration against the platform ceiling ---------------------------
  const handlers = project.routeHandlers;
  const overCeiling = [];
  const unattendedWithoutDuration = [];
  const unattendedBounded = [];

  for (const file of handlers) {
    const declared = segmentExport(file, "maxDuration");
    const seconds = declared ? Number(declared.raw) : null;

    if (declared && Number.isFinite(seconds) && seconds > FUNCTION_DURATION_CEILING_SECONDS) {
      overCeiling.push({ file, declared, seconds });
      continue;
    }

    if (declared || !UNATTENDED_ROUTE.test(file.rel)) continue;

    const signals = BULK_WORK_SIGNALS.filter(
      (signal) =>
        signal.pattern.test(file.text)
        && (!signal.requiresLargeLiteral || hasLargeLiteral(file.text)),
    );
    if (signals.length > 0) unattendedWithoutDuration.push({ file, signals });
    else unattendedBounded.push(file.rel);
  }

  if (overCeiling.length === 0) {
    resolve(
      "function-duration-ceiling",
      `clean — ${handlers.length} route handler(s) checked, the highest declared maxDuration is `
        + `${Math.max(0, ...handlers.map((file) => Number(segmentExport(file, "maxDuration")?.raw ?? 0)))}s`,
    );
  } else {
    resolve("function-duration-ceiling", `${overCeiling.length} handler(s) reported`);
    for (const { file, declared, seconds } of overCeiling) {
      sink.record({
        rule: "scan.config-risk",
        file: file.rel,
        line: declared.line,
        title: `${file.rel} asks for ${seconds}s, above the platform maximum`,
        expected:
          `A route handler's maxDuration is at or below the platform ceiling — `
          + `${HOBBY_DURATION_CEILING_SECONDS}s on Hobby, ${FUNCTION_DURATION_CEILING_SECONDS}s at `
          + "the very most on any plan.",
        actual:
          `Declares maxDuration = ${seconds}. Vercel clamps the value at deploy time, so the `
          + "handler runs with a shorter budget than the file says it has.",
        evidence: declared.evidence,
        why:
          "The number in the file is what the next reader will believe when they decide whether "
          + "a slow operation fits. A clamped value makes that reasoning wrong without ever "
          + "producing an error message.",
        fix:
          `Lower it to a value the plan actually grants, or split the work so it fits — a `
          + "handler that needs longer than the ceiling needs a queue, not a larger number.",
      });
    }
  }

  if (unattendedWithoutDuration.length === 0) {
    resolve(
      "unattended-handler-duration",
      "clean — every cron and admin handler doing bulk work declares a maxDuration",
    );
  } else {
    resolve("unattended-handler-duration", `${unattendedWithoutDuration.length} handler(s) reported`);
    for (const { file, signals } of unattendedWithoutDuration) {
      const spot = lineOf(file, signals[0].pattern) ?? { line: 1, evidence: file.lines[0] };
      sink.record({
        rule: "scan.config-risk",
        file: file.rel,
        line: spot.line,
        title: `${file.rel} does bulk work on a schedule and declares no maxDuration`,
        expected:
          "A handler that runs unattended and whose work grows with the data declares its own "
          + "maxDuration, the way the two admin maintenance routes and every export route do.",
        actual:
          `No export const maxDuration in this file, so it takes the platform default of 60s. `
          + `The handler ${signals.map((signal) => signal.describe).join(", and ")}.`,
        evidence: spot.evidence,
        why:
          "Nobody is watching a cron. It is scheduled in vercel.json, it runs at night, and when "
          + "it exceeds its budget the platform kills it mid-flight — here that means a partial "
          + "set of table dumps under tonight's date prefix, with the manifest that records what "
          + "succeeded never written, because it is uploaded last. The backup looks present and "
          + "is incomplete, which is worse than one that is plainly missing.",
        fix:
          `Add export const maxDuration = <seconds> (up to ${HOBBY_DURATION_CEILING_SECONDS} on `
          + "Hobby) to this route, sized against the row caps it already declares.",
      });
    }
  }

  // ---- vercel.json crons and the routes they name ------------------------
  const cronRoutes = handlers
    .filter((file) => file.rel.startsWith("app/api/cron/"))
    .map((file) => ({ file, path: routePathOf(file.rel) }));

  if (!vercelConfig) {
    resolve("cron-schedule-and-route-agreement", "NOT CHECKED — vercel.json is missing");
  } else {
    let parsed = null;
    try {
      parsed = JSON.parse(vercelConfig.text);
    } catch {
      parsed = null;
    }

    if (!parsed) {
      resolve("cron-schedule-and-route-agreement", "NOT CHECKED — vercel.json did not parse as JSON");
    } else {
      const scheduled = Array.isArray(parsed.crons) ? parsed.crons : [];
      const scheduledPaths = new Set(scheduled.map((entry) => String(entry.path ?? "")));
      const routePaths = new Set(cronRoutes.map((entry) => entry.path));

      const danglingSchedules = scheduled.filter((entry) => !routePaths.has(String(entry.path ?? "")));
      const unscheduledRoutes = cronRoutes.filter((entry) => !scheduledPaths.has(entry.path));

      if (danglingSchedules.length === 0 && unscheduledRoutes.length === 0) {
        resolve(
          "cron-schedule-and-route-agreement",
          `clean — ${scheduled.length} schedule(s) and ${cronRoutes.length} cron handler(s) name `
            + "each other exactly",
        );
      } else {
        resolve(
          "cron-schedule-and-route-agreement",
          `${danglingSchedules.length + unscheduledRoutes.length} mismatch(es) reported`,
        );
      }

      for (const entry of danglingSchedules) {
        const spot = lineOf(vercelConfig, new RegExp(`"${String(entry.path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
        sink.record({
          rule: "scan.config-risk",
          file: vercelConfig.rel,
          line: spot?.line ?? 1,
          title: `vercel.json schedules ${entry.path}, which is not a route handler in this repo`,
          expected:
            "Every path in vercel.json crons resolves to an app/api/cron handler that exists in "
            + "the deployed tree.",
          actual:
            `Scheduled at "${entry.schedule}", but no route handler produces the path `
            + `${entry.path}. The known cron handlers are: `
            + `${cronRoutes.map((route) => route.path).join(", ") || "(none)"}.`,
          evidence: spot?.evidence ?? `"path": "${entry.path}"`,
          why:
            "Vercel invokes the schedule regardless. The request 404s, the cron is recorded as "
            + "having run, and the work it was supposed to do silently never happens — this is "
            + "the failure mode where a nightly backup is 'configured' for months and has no "
            + "files behind it.",
          fix:
            "Correct the path to match the handler's route, or delete the schedule if the "
            + "handler was intentionally removed.",
        });
      }

      for (const entry of unscheduledRoutes) {
        sink.record({
          rule: "scan.config-risk",
          file: entry.file.rel,
          line: 1,
          title: `${entry.file.rel} is a cron handler that nothing schedules`,
          expected:
            "A handler under app/api/cron has a matching entry in the vercel.json crons array — "
            + "that array is the only thing that ever calls it.",
          actual:
            `No vercel.json cron entry names ${entry.path}. Scheduled paths are: `
            + `${[...scheduledPaths].join(", ") || "(none)"}.`,
          evidence: entry.file.lines.slice(0, 2).join(" ").trim().slice(0, 200),
          why:
            "Nothing else in the app calls a cron route. Unscheduled, it is dead code that reads "
            + "like an operational guarantee — and it will keep passing every test, because the "
            + "tests call it directly.",
          fix:
            "Add the schedule to vercel.json, or delete the handler if the job was retired.",
        });
      }
    }
  }

  // ---- cache directives on staff surfaces --------------------------------
  const rootIsForceDynamic =
    Boolean(rootLayout) && /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(rootLayout.text);

  const protectedSurfaces = [...project.pages, ...project.routeHandlers].filter((file) =>
    file.rel.startsWith("app/protected/"),
  );

  const cached = [];
  for (const file of protectedSurfaces) {
    const revalidate = segmentExport(file, "revalidate");
    const dynamic = segmentExport(file, "dynamic");
    const seconds = revalidate ? Number(revalidate.raw) : null;

    // revalidate = 0 is the opposite of a risk: it is "never cache this".
    if (revalidate && Number.isFinite(seconds) && seconds > 0) {
      cached.push({ file, directive: `revalidate = ${seconds}`, spot: revalidate });
    }
    if (dynamic && /force-static/.test(dynamic.raw)) {
      cached.push({ file, directive: `dynamic = ${dynamic.raw}`, spot: dynamic });
    }
  }

  if (cached.length === 0) {
    resolve(
      "protected-cache-directive",
      `clean — none of the ${protectedSurfaces.length} staff surfaces declares a caching directive`,
    );
  } else {
    resolve(
      "protected-cache-directive",
      rootIsForceDynamic
        ? `${cached.length} inert directive(s) reported as P3 — the root layout forces dynamic rendering`
        : `${cached.length} directive(s) reported`,
    );
  }

  for (const { file, directive, spot } of cached) {
    // Auth is read per request, and reading a cookie opts the render out of
    // caching on its own. Established by finding the call, not by assuming it:
    // a staff surface that somehow reached the data without one is the case
    // this rule exists for.
    const readsSession =
      /require(?:AuthenticatedStaff|StaffPermission|AnyStaffPermission)\s*\(|getAuthenticatedStaff\s*\(|\bcookies\s*\(/.test(
        file.text,
      );
    const inert = rootIsForceDynamic || readsSession;

    if (inert) {
      sink.record({
        rule: "scan.observation",
        file: file.rel,
        line: spot.line,
        title: `${file.rel} declares ${directive}, which never takes effect`,
        expected:
          "A route segment's caching directive describes what actually happens to that segment.",
        actual:
          `${directive} is declared here and cannot apply. `
          + (rootIsForceDynamic
            ? "app/layout.tsx sets dynamic = \"force-dynamic\" at the root. "
            : "")
          + (readsSession
            ? "This surface also reaches cookies() through its auth call, which opts the render "
              + "out of caching on its own."
            : ""),
        evidence: spot.evidence,
        why:
          "Not a data-exposure risk today, and deliberately filed as an observation rather than "
          + "a config risk so it cannot gate: docs/design/design-system.md section 5.6 records "
          + "the force-dynamic decision and says to leave it alone. What it is, is a line that "
          + "tells the next reader this page is cached for a minute when it is rendered fresh "
          + "every time — so a performance investigation starts from a false premise, and if "
          + "the auth call ever moves the directive is sitting there ready to be believed.",
        fix:
          "Delete the directive, or keep it with a comment saying it is aspirational and what "
          + "would have to change for it to apply.",
      });
      continue;
    }

    sink.record({
      rule: "scan.config-risk",
      file: file.rel,
      line: spot.line,
      title: `${file.rel} caches a staff surface across requests`,
      expected:
        "Nothing under app/protected is cached across requests. Every surface there is scoped to "
        + "the signed-in staff member's role and the session they have selected.",
      actual:
        `${directive} is declared, this surface names no auth helper and reads no cookie, and the `
        + "root layout does not force dynamic rendering — so the rendered output is reusable "
        + "between requests.",
      evidence: spot.evidence,
      why:
        "A cached render of a staff page is one staff member's view served to another. Role "
        + "decides what a page shows — a teacher and an accountant see different figures on the "
        + "same route — and the session pill decides which academic year those figures come "
        + "from. Neither is part of the cache key.",
      fix:
        "Remove the directive. If the page is genuinely session-independent and expensive, cache "
        + "the data instead with unstable_cache and record the reason in "
        + "docs/cache-safety-notes.md, which is where this repo keeps that argument.",
    });
  }

  // ---- security response headers -----------------------------------------
  const headerHaystack = HEADER_SURFACES.map((rel) => project.get(rel)?.text ?? "").join("\n");
  const configuredSecurityHeaders = SECURITY_HEADERS.filter((name) =>
    new RegExp(name, "i").test(headerHaystack),
  );

  if (configuredSecurityHeaders.length > 0) {
    resolve(
      "security-response-headers",
      `clean — ${configuredSecurityHeaders.join(", ")} configured`,
    );
  } else if (!nextConfig) {
    resolve("security-response-headers", "NOT CHECKED — next.config.ts is missing");
  } else {
    resolve("security-response-headers", "reported — no security header configured anywhere");
    const spot = lineOf(nextConfig, /async\s+headers\s*\(/) ?? { line: 1, evidence: "headers()" };
    sink.record({
      rule: "scan.config-risk",
      file: nextConfig.rel,
      line: spot.line,
      title: "No security response header is configured for any document response",
      expected:
        "An authenticated admin app sends at least a framing policy — X-Frame-Options, or "
        + "frame-ancestors inside a Content-Security-Policy — on the HTML responses staff load.",
      actual:
        `The headers() block configures Cache-Control on four public asset paths and nothing `
        + `else. None of ${SECURITY_HEADERS.join(", ")} appears in `
        + `${HEADER_SURFACES.join(", ")}. Next.js sets none of them by default; poweredByHeader: `
        + "false is the only header-level setting present.",
      evidence: spot.evidence,
      why:
        "Without a framing policy any page can put /protected/payments in an invisible iframe "
        + "over a page a signed-in staff member is already looking at, and their click lands on "
        + "the app instead. This app's buttons post payments, reverse receipts and publish fee "
        + "policy, and the session cookie is sent with the framed request like any other. The "
        + "same block is where X-Content-Type-Options: nosniff belongs, which matters here "
        + "because several routes stream XLSX and PDF bytes back to the browser.",
      fix:
        "Add a headers() entry for source: \"/:path*\" carrying, at minimum, X-Frame-Options: "
        + "DENY and X-Content-Type-Options: nosniff. A full Content-Security-Policy is a larger "
        + "piece of work — the Sentry replay CDN and the Supabase origin both have to be allowed "
        + "for — and is worth doing separately from the framing fix.",
    });
  }

  // ---- Sentry: a DSN that is not there, a sample rate that is too high ----
  const sentryConfigs = [
    "sentry.server.config.ts",
    "sentry.edge.config.ts",
    "instrumentation-client.ts",
  ]
    .map((rel) => project.get(rel))
    .filter(Boolean);

  if (sentryConfigs.length === 0) {
    resolve("sentry-dsn-and-sampling", "NOT CHECKED — no Sentry init file found");
  } else {
    const alwaysFullTracing = sentryConfigs
      .map((file) => ({ file, spot: lineOf(file, /tracesSampleRate\s*:\s*1(?:\.0+)?\s*,?\s*$/) }))
      .filter((entry) => entry.spot);

    if (alwaysFullTracing.length === 0) {
      resolve(
        "sentry-dsn-and-sampling",
        `clean — ${sentryConfigs.length} init file(s), each reading the DSN from the environment `
          + "and each sampling traces at less than 1.0 outside development",
      );
    } else {
      resolve("sentry-dsn-and-sampling", `${alwaysFullTracing.length} init file(s) reported`);
      for (const { file, spot } of alwaysFullTracing) {
        sink.record({
          rule: "scan.config-risk",
          file: file.rel,
          line: spot.line,
          title: `${file.rel} sends every transaction to Sentry, in every environment`,
          expected:
            "tracesSampleRate is conditioned on the environment, so production sampling is a "
            + "deliberate fraction rather than everything.",
          actual:
            "tracesSampleRate is the literal 1.0 with no environment check, so production traces "
            + "at 100%.",
          evidence: spot.evidence,
          why:
            "Full tracing on a paid quota is exhausted by ordinary traffic, and the month it runs "
            + "out is the month the errors stop arriving — the failure is silent and lands at "
            + "exactly the wrong time.",
          fix:
            "Condition it the way the other init files do: 1.0 in development, a fraction "
            + "otherwise.",
        });
      }
    }
  }

  // ---- tsconfig strictness ------------------------------------------------
  if (!tsConfig) {
    resolve("typescript-strictness", "NOT CHECKED — tsconfig.json is missing");
  } else {
    const strictOff = /"strict"\s*:\s*false/.test(tsConfig.text);
    const nullChecksOff = /"strictNullChecks"\s*:\s*false/.test(tsConfig.text);
    if (!strictOff && !nullChecksOff) {
      resolve("typescript-strictness", "clean — strict is on and strictNullChecks is not disabled");
    } else {
      resolve("typescript-strictness", "reported — strictness disabled");
      const spot =
        lineOf(tsConfig, /"strict"\s*:\s*false/) ?? lineOf(tsConfig, /"strictNullChecks"\s*:\s*false/);
      sink.record({
        rule: "scan.config-risk",
        file: tsConfig.rel,
        line: spot?.line ?? 1,
        title: "TypeScript strictness is disabled",
        expected: "compilerOptions.strict is true, which is what CLAUDE.md documents this repo as.",
        actual: strictOff ? "\"strict\": false." : "\"strictNullChecks\": false.",
        evidence: spot?.evidence ?? "\"strict\": false",
        why:
          "Without strict null checks, a nullable amount reads as a number all the way to the "
          + "arithmetic. In this codebase that is a money bug that typechecks.",
        fix: "Turn strict back on and fix what surfaces, file by file.",
      });
    }
  }

  // ---- images.remotePatterns ---------------------------------------------
  if (!nextConfig) {
    resolve("remote-image-patterns", "NOT CHECKED — next.config.ts is missing");
  } else if (!/remotePatterns/.test(nextConfig.text)) {
    // Absent is the closed default: next/image refuses every remote host. The
    // finding would be a wildcard, not an omission.
    resolve(
      "remote-image-patterns",
      "clean — no remotePatterns, so next/image optimises no remote host at all",
    );
  } else {
    const wildcard = lineOf(nextConfig, /hostname\s*:\s*["'](?:\*\*?|\*\*\.[^"']*)["']/);
    if (!wildcard) {
      resolve("remote-image-patterns", "clean — remotePatterns present, no wildcard hostname");
    } else {
      resolve("remote-image-patterns", "reported — wildcard hostname");
      sink.record({
        rule: "scan.config-risk",
        file: nextConfig.rel,
        line: wildcard.line,
        title: "images.remotePatterns allows a wildcard hostname",
        expected: "Every remote image host next/image will fetch is named explicitly.",
        actual: "A remotePatterns entry uses a wildcard hostname, so any host qualifies.",
        evidence: wildcard.evidence,
        why:
          "The image optimiser fetches whatever URL it is handed and serves the bytes from this "
          + "origin, which makes it an open proxy and a way to run up the optimisation quota.",
        fix: "Replace the wildcard with the hostnames the app actually loads images from.",
      });
    }
  }

  // ---- serverless file tracing for runtime disk reads ---------------------
  //
  // The comment in next.config.ts already records what this costs: a route
  // whose data files are not traced works in `next dev` and 500s on Vercel,
  // and the failure only ever appears in a deployment. So the check is worth
  // running even though it currently finds nothing.
  const tracedRoutes = new Set();
  if (nextConfig) {
    const block = nextConfig.text.match(/outputFileTracingIncludes\s*:\s*\{([\s\S]*?)\n {2}\}/);
    if (block) {
      for (const match of block[1].matchAll(/["'](\/[^"']*)["']\s*:/g)) tracedRoutes.add(match[1]);
    }
  }

  const diskReaders = new Set(
    project.source.filter((file) => RUNTIME_DISK_READ.test(file.text)).map((file) => file.rel),
  );

  const untracedRoutes = [];
  let diskReadingRoutes = 0;
  if (diskReaders.size > 0) {
    for (const file of handlers) {
      const closure = closureOf(file.rel, project);
      const reached = [...diskReaders].filter((rel) => closure.has(rel));
      if (reached.length === 0) continue;
      diskReadingRoutes += 1;
      const routePath = routePathOf(file.rel);
      if (!tracedRoutes.has(routePath)) untracedRoutes.push({ file, routePath, reached });
    }
  }

  if (!nextConfig) {
    resolve("serverless-file-tracing", "NOT CHECKED — next.config.ts is missing");
  } else if (untracedRoutes.length === 0) {
    resolve(
      "serverless-file-tracing",
      `clean — ${diskReadingRoutes} route(s) reach a module that reads from process.cwd(), and `
        + `all ${diskReadingRoutes} are named in outputFileTracingIncludes`,
    );
  } else {
    resolve("serverless-file-tracing", `${untracedRoutes.length} route(s) reported`);
    for (const { file, routePath, reached } of untracedRoutes) {
      sink.record({
        rule: "scan.config-risk",
        file: file.rel,
        line: 1,
        title: `${routePath} reads a file off disk and is not in outputFileTracingIncludes`,
        expected:
          "Every route reaching a module that builds a path from process.cwd() is listed in "
          + "next.config.ts outputFileTracingIncludes, so Vercel packages the data files with "
          + "the function.",
        actual:
          `This handler reaches ${reached.join(", ")}, which reads from process.cwd(). `
          + `outputFileTracingIncludes names ${[...tracedRoutes].join(", ") || "(nothing)"} and `
          + `not ${routePath}.`,
        evidence: file.lines.slice(0, 2).join(" ").trim().slice(0, 200),
        why:
          "Vercel's tracer follows imports, not computed paths. The file is present locally and "
          + "absent from the deployed bundle, so the route works in next dev and throws on "
          + "Vercel — a failure that can only ever be discovered in a deployment. The existing "
          + "entries in that config exist because this happened.",
        fix:
          `Add "${routePath}" to outputFileTracingIncludes with the asset globs the module reads.`,
      });
    }
  }

  // ---- deployment region --------------------------------------------------
  if (!vercelConfig) {
    resolve("deployment-region", "NOT CHECKED — vercel.json is missing");
  } else if (/"regions"\s*:\s*\[\s*"[^"]+"/.test(vercelConfig.text)) {
    const spot = lineOf(vercelConfig, /"regions"/);
    resolve("deployment-region", `clean — pinned (${spot?.evidence ?? "regions declared"})`);
  } else {
    resolve("deployment-region", "reported — no region pinned");
    sink.record({
      rule: "scan.config-risk",
      file: vercelConfig.rel,
      line: 1,
      title: "vercel.json pins no deployment region",
      expected:
        "Functions are pinned to the region the database is in — Supabase for this project is in "
        + "Mumbai, and CLAUDE.md records bom1 as the deployment region.",
      actual: "No regions array in vercel.json, so functions deploy to the platform default.",
      evidence: vercelConfig.lines[0],
      why:
        "Every page in this app is dynamically rendered and every render makes several round "
        + "trips to Postgres. A function in Washington talking to a database in Mumbai pays that "
        + "latency once per query, and the Payment Desk is the screen where it is felt.",
      fix: "Add \"regions\": [\"bom1\"] to vercel.json.",
    });
  }

  // ---- coverage -----------------------------------------------------------
  const unanswered = CANDIDATES.filter((key) => !verdicts.has(key));
  coverage.declare({
    check: id,
    dimension: "deployment and build configuration candidates",
    domainSize: CANDIDATES.length,
    examined: CANDIDATES.length - unanswered.length,
    strategy: "exhaustive",
    note:
      "Each candidate is answered against the real file, and the verdicts are listed here so an "
      + "empty findings list is legible as checked rather than as skipped. "
      + CANDIDATES.map((key) => `${key}: ${verdicts.get(key) ?? "NOT ANSWERED"}`).join("; ")
      + ". "
      + (unattendedBounded.length > 0
        ? `Deliberately not reported: ${unattendedBounded.join(", ")} — unattended and without a `
          + "maxDuration, but the handler shows neither a bulk row cap nor a storage upload, so "
          + "its work is bounded and the platform default is enough. "
        : "")
      + "skipLibCheck is true in tsconfig.json and is not reported: it is the Next.js default and "
      + "it suppresses diagnostics in other people's .d.ts files, not in this repo's code. "
      + "What this check cannot see at all: anything configured in the Vercel dashboard rather "
      + "than in a file — environment variables and their values, deployment protection, the "
      + "plan's real function-duration ceiling, and whether the cron secret is actually set. It "
      + "also reads outputFileTracingIncludes with a regex rather than by evaluating "
      + "next.config.ts, so a route key assembled from a variable would read as absent.",
  });
}
