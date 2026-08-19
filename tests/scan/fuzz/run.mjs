/**
 * The fuzz layer: malformed input at a running server.
 *
 * The static layer reads source and the ai layer reasons about it. Neither can
 * answer the only question this layer asks — what does the thing actually *do*
 * when the input is wrong? A handler can look perfectly guarded and still
 * answer 500 to an empty body, because `await request.json()` throws one line
 * above the try block somebody added later.
 *
 * Scope, stated up front so the coverage note is not the first place it
 * appears: this layer drives HTTP against route handlers only. Pages, Server
 * Actions and the MCP Worker are not fuzzed here. `tests/deep` walks the pages
 * with a browser and `tests/deep/mcp` drives the Worker; a Server Action is
 * reachable over HTTP but only with a valid, build-specific action id, and
 * guessing one produces noise rather than findings.
 *
 * ── Why this is not simply `tests/deep/surface/negatives.ts` with more rows ──
 *
 * That file is 25 malformed URLs driven through Chromium, and everything it
 * found lives on the query string — necessarily, because a browser will not
 * let you send a body on a GET, will not let you send a method it does not
 * know, normalises `..` out of a path before the request leaves, and chooses
 * its own `Accept` and `Content-Type`. This layer starts where that one stops:
 * bodies, oversized bodies, absent bodies, content types that lie, methods the
 * route never exported, and percent-encoded path segments a URL parser would
 * have collapsed. The corpus in `corpus.mjs` says which entry exists for which
 * of those reasons.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 *
 * This tool sends deliberately hostile input at a server that, pointed one
 * character wrong, is a school's live financial system. It is gated the way
 * `tests/deep/lib/writes.ts` gates writes, and for the same reason: a silent
 * skip and a silent write look identical in a log the next morning.
 *
 *   1. Base URL allowlist. Loopback is allowed on any port — a loopback
 *      address is by construction not somebody's deployment. Any other host
 *      must be in the allowlist mirrored from `WRITE_ALLOWED_HOSTS` *and* be
 *      asked for explicitly with `--fuzz-remote`.
 *   2. Session label. The live label `2026-27` is refused outright, at any
 *      URL, in any mode. Every request also pins `vpps_view_session` to the
 *      test label, because `app/protected/layout.tsx` resolves the session
 *      from that cookie and an export route that resolved to the live ledger
 *      would write real families into this run's JSONL.
 *   3. Methods. GET and HEAD only, unless `--fuzz-writes` is passed.
 *   4. `--fuzz-writes` is refused unless the session label carries a `TEST-`,
 *      `UAT-` or `DEMO-` prefix.
 *
 * Every refusal prints a REFUSED banner and lands a coverage row saying what
 * was not fuzzed and why. None of them throw: `runFuzzLayer` returning
 * normally is part of its contract with `tests/scan/run.mjs`, which treats a
 * throw as a layer that contributed nothing.
 *
 * ── Reading the output ────────────────────────────────────────────────────
 *
 * Every request and response is appended to `fuzz-requests.jsonl` in the
 * gitignored run directory, so a finding can be re-examined without re-running
 * the fuzzer. Bodies are truncated and redacted first — a 200 from this app is
 * a class list, and a QA artefact that leaks one is a worse outcome than the
 * bug it was chasing.
 */

import { existsSync, readFileSync, appendFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

import { lineAt } from "../lib/project.mjs";
import { CORPUS, BASELINE } from "./corpus.mjs";

/* ═══════════════════════════════════════════════════ identity and constants */

/**
 * Mirrors `LIVE_SESSION` in `tests/deep/lib/identity.ts`.
 *
 * Duplicated rather than imported because that file is TypeScript and this
 * layer is plain Node — the same reason `tests/deep/lib/rules.mjs` is `.mjs`.
 * A constant this load-bearing is worth the duplication only because it is
 * checked against, never derived from: if the live label ever changes, this
 * file refusing the old one still refuses too much rather than too little.
 */
const LIVE_SESSION = "2026-27";

const TEST_SESSION_PREFIXES = ["TEST-", "UAT-", "DEMO-"];

const DEFAULT_SESSION =
  process.env.SCHOOLFEES_SMOKE_SESSION?.trim() || "TEST-2026-27";

/** The session cookie `app/protected/layout.tsx` reads. Mirrors writes.ts. */
const VIEW_SESSION_COOKIE = "vpps_view_session";

/** Mirrors `WRITE_ALLOWED_HOSTS`. Loopback is handled separately, by shape. */
function allowedRemoteHosts() {
  const hosts = new Set();
  for (const raw of [
    process.env.SCHOOLFEES_SMOKE_BASE_URL,
    process.env.DEEP_PRODUCTION_ORIGIN,
    process.env.DEEP_LOCAL_ORIGIN,
    "https://schoolfees-two.vercel.app",
    ...(process.env.SCAN_FUZZ_ALLOWED_HOSTS ?? "").split(","),
  ]) {
    const value = raw?.trim();
    if (!value) continue;
    try {
      hosts.add(new URL(value.includes("://") ? value : `https://${value}`).host);
    } catch {
      /* an unparseable allowlist entry is not an allowlist entry */
    }
  }
  return hosts;
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/**
 * Routes never fuzzed, whatever the flags say, each with its reason.
 *
 * An allowlist would be the wrong shape here — the population is every route
 * handler and the default is to fuzz — so this is the denylist, and like
 * `PUBLIC_BY_DESIGN` in `tests/scan/checks/guards.mjs` an entry has to carry
 * an argument rather than a name.
 */
const NEVER_FUZZ = new Map([
  [
    "app/auth/confirm/route.ts",
    "Exchanges a one-time OTP token for a session and writes the auth cookie jar. A fuzz pass "
      + "that happened to be handed a live token would consume it, and every subsequent request "
      + "in the run would be authenticated as somebody nobody chose.",
  ],
]);

/**
 * Routes whose every response is expensive, capped rather than excluded.
 *
 * An XLSX export is a full session read plus a workbook build, with
 * `maxDuration = 60` on it. Fifty of those is most of the wall-clock budget
 * spent on one route, so these get the first N variants and the coverage note
 * says how many they did not get.
 */
const HEAVY_ROUTES = /\/(exports|export|template)\//;
const HEAVY_VARIANT_CAP = 8;

/** Mirrors `PUBLIC_BY_DESIGN` in checks/guards.mjs — a 2xx here is not a bypass. */
const PUBLIC_BY_DESIGN = new Set(["app/api/manifest/route.ts", "app/auth/confirm/route.ts"]);

/** Reaching one of these means the route can refuse an anonymous caller. */
const GUARD_MARKERS =
  /\b(requireStaffPermission|requireAnyStaffPermission|hasStaffPermission|hasAnyStaffPermission|getAuthenticatedStaff|requireAuthenticatedStaff|staffCan)\s*\(|\bCRON_SECRET\b|\bSCHOOLFEES_[A-Z_]*TOKEN\b/;

/**
 * The verbs a handler can export, in the order a report should list them.
 *
 * Used to sort what `VERB_EXPORT` finds, so two runs of the same handler name
 * its methods the same way and a finding's fingerprint does not depend on
 * which order the regex happened to match in.
 */
const HTTP_VERBS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const VERB_EXPORT =
  /export\s+(?:async\s+function|function|const)\s+(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/g;

/** Sort a handler's verbs into a stable, readable order. */
function orderVerbs(verbs) {
  return [...verbs].sort((a, b) => HTTP_VERBS.indexOf(a) - HTTP_VERBS.indexOf(b));
}

/** A UUID that is well formed and names nothing. */
const NONEXISTENT_UUID = "3f2b91c4-7d18-4a55-9e60-2c8ab41f0d73";

/**
 * What a dynamic segment is filled with before a path payload replaces it.
 *
 * `exportType` is an enum and not an id, so a UUID there only ever exercises
 * the unknown-type branch. `defaulters` is a real export and the cheapest one,
 * which means the query payloads aimed at that route reach the code that
 * builds a workbook instead of stopping at the 404.
 */
const SEGMENT_DEFAULTS = new Map([
  ["exportType", "defaulters"],
  ["batchId", NONEXISTENT_UUID],
]);

/* ═════════════════════════════════════════════════════════ leak detection */

/**
 * What a response body must never contain.
 *
 * Each pattern is matched *after* our own payload has been subtracted from the
 * body — see `withoutEcho`. Without that step this rule reports itself: send
 * `');--` as a query value, get it echoed back in a perfectly correct 400, and
 * call the echo a SQL leak. That false positive is how a P1 rule gets muted.
 */
const LEAK_PATTERNS = [
  {
    id: "stack-frame",
    label: "a stack frame with a file path and a line number",
    pattern: /\n\s*at\s+[^\n]{0,160}[/\\][^\s)]+:\d+:\d+/,
  },
  {
    id: "build-path",
    label: "a build-internal path",
    pattern: /webpack-internal:\/{2,}|\.next[/\\]server[/\\]|\/var\/task\/|node:internal\//,
  },
  {
    id: "filesystem-path",
    label: "an absolute filesystem path",
    pattern: /(?:\/home\/[\w.-]+|\/Users\/[\w.-]+|\/root)\/[\w./-]{4,}/,
  },
  {
    id: "env-var-name",
    label: "the name of a server-only environment variable",
    pattern:
      /\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_JWT_SECRET|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|CRON_SECRET|SCHOOLFEES_DOC_TOKEN|SCHOOLFEES_MCP_TOKEN|SCHOOLFEES_WORKER_MCP_TOKEN|DATABASE_URL|POSTGRES_[A-Z_]{3,})\b/,
  },
  {
    id: "sql-fragment",
    label: "a SQL statement fragment",
    pattern:
      /\b(?:select\s+[\w"*,.\s]{1,80}\s+from\s+\w|insert\s+into\s+\w|update\s+\w+\s+set\s|delete\s+from\s+\w)/i,
  },
  {
    id: "postgres-error-code",
    label: "a Postgres or PostgREST error code",
    pattern: /\b(?:22P02|22P05|42P01|42501|42883|23505|23503|40001|P0001|PGRST\d{3})\b/,
  },
  {
    id: "postgres-message",
    label: "a verbatim Postgres error message",
    pattern:
      /invalid input syntax for type|relation "[^"]{1,80}" does not exist|column "[^"]{1,80}" does not exist|permission denied for (?:table|relation|schema|function)|violates row-level security|unsupported Unicode escape/i,
  },
  {
    id: "supabase-internal",
    label: "a Supabase internal identifier",
    pattern: /\/rest\/v1\/[a-z_]|service_role|supabase_admin/,
  },
];

/** Body text that reads as a refusal — used to keep a polite 200 out of P0. */
const DENIAL_TEXT =
  /\b(unauthori[sz]ed|unauthenticated|forbidden|not\s+permitted|no\s+permission|permission\s+denied|sign\s?in|log\s?in\s+required|access\s+denied)\b/i;

/* ═════════════════════════════════════════════════════════════ redaction */

/**
 * A response body from this app is a class list.
 *
 * The run directory is gitignored, but "gitignored" is not "safe to leave on a
 * laptop", and the whole point of writing the JSONL is that somebody reads it
 * later. So values are stripped before they are written, keyed on the field
 * name rather than on the value's shape: a ten-digit number could be an
 * amount, but `"phone": <ten digits>` could not be anything else.
 */
const PII_FIELDS =
  /("(?:[a-z_]*name|phone|mobile|whatsapp|alt_?phone|contact|email|address|aadhaar|aadhar|dob|date_of_birth|photo_?url|guardian|father|mother|parent)[a-z_]*"\s*:\s*)("(?:[^"\\]|\\.)*")/gi;

function redact(text) {
  return String(text)
    .replace(PII_FIELDS, '$1"<redacted>"')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, "<email>")
    .replace(/(?<!\d)(?:\+91[ -]?)?[6-9]\d{9}(?!\d)/g, "<phone>")
    .replace(/(?<!\d)\d{12}(?!\d)/g, "<aadhaar-shaped>");
}

/** Header values that authenticate. Recorded as present, never as a value. */
const SECRET_HEADERS = new Set(["cookie", "authorization", "x-api-key", "x-scan-fuzz-padding"]);

function redactHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SECRET_HEADERS.has(key.toLowerCase())
      ? `<${String(value).length} chars, redacted>`
      : String(value).slice(0, 200);
  }
  return out;
}

/**
 * Remove our own payload from a body before accusing the server of leaking.
 *
 * Both the raw literal and its percent-decoded form: an error message that
 * quotes the offending value quotes whichever of the two the handler was
 * holding, and only one of them matches.
 */
function withoutEcho(body, sent) {
  let text = body;
  for (const literal of sent) {
    if (!literal || literal.length < 3) continue;
    for (const form of new Set([literal, safeDecode(literal), encodeURIComponent(literal)])) {
      if (!form || form.length < 3) continue;
      text = text.split(form).join(" ");
    }
  }
  return text;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/* ═══════════════════════════════════════════════ target enumeration */

/** `app/protected/receipts/[receiptId]/detail/route.ts` becomes its URL shape. */
function routePathFor(rel) {
  return rel
    .replace(/^app/, "")
    .replace(/\/route\.[tj]sx?$/, "")
    .split("/")
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .join("/") || "/";
}

function dynamicSegmentsOf(routePath) {
  return [...routePath.matchAll(/\[(?:\.{3})?([^\]]+)\]/g)].map((match) => match[1]);
}

/** The query parameters the handler names in its own source. */
function declaredParamsOf(file) {
  const names = new Set();
  for (const match of file.text.matchAll(/searchParams\.get(?:All)?\(\s*["'`]([^"'`]+)["'`]/g)) {
    names.add(match[1]);
  }
  // A secret is never guessed. Sending `secret=<junk>` is the auth probe;
  // sending anything else there is a credential-stuffing attempt, not a fuzz.
  return [...names];
}

function verbsOf(file) {
  const verbs = [];
  VERB_EXPORT.lastIndex = 0;
  let match;
  while ((match = VERB_EXPORT.exec(file.text))) {
    verbs.push({ verb: match[1], line: lineAt(file, match.index) });
  }
  if (verbs.length === 0) return [{ verb: "GET", line: 1 }];

  // Stable order, so the same handler produces the same target list — and the
  // same finding ids — on every run.
  const byVerb = new Map(verbs.map((entry) => [entry.verb, entry]));
  return orderVerbs([...byVerb.keys()]).map((verb) => byVerb.get(verb));
}

const READ_ONLY_VERBS = new Set(["GET", "HEAD", "OPTIONS"]);

function enumerateTargets(project, { fuzzWrites }) {
  const targets = [];
  const skipped = [];

  for (const file of project.routeHandlers) {
    const denied = NEVER_FUZZ.get(file.rel);
    if (denied) {
      skipped.push({ file: file.rel, reason: denied });
      continue;
    }

    const routePath = routePathFor(file.rel);
    const segments = dynamicSegmentsOf(routePath);
    const params = declaredParamsOf(file);
    const guarded = GUARD_MARKERS.test(file.text) && !PUBLIC_BY_DESIGN.has(file.rel);

    for (const { verb, line } of verbsOf(file)) {
      if (!READ_ONLY_VERBS.has(verb) && !fuzzWrites) {
        skipped.push({
          file: file.rel,
          reason:
            `exports ${verb}, and a ${verb} handler in this app posts a payment, commits an `
            + "import batch or re-runs the fee engine. Read-only by default; pass --fuzz-writes "
            + "against a TEST- session to include it.",
        });
        continue;
      }
      targets.push({
        file: file.rel,
        line,
        method: verb,
        routePath,
        segments,
        params,
        guarded,
        heavy: HEAVY_ROUTES.test(routePath),
      });
    }
  }

  return { targets, skipped };
}

/* ═══════════════════════════════════════════════════ request construction */

function makeRequest(target, sessionLabel) {
  const query = [];
  const segments = new Map(
    target.segments.map((name) => [name, SEGMENT_DEFAULTS.get(name) ?? NONEXISTENT_UUID]),
  );
  let segmentsRaw = false;

  const request = {
    method: target.method,
    params: target.params,
    headers: { accept: "application/json, text/plain, */*".replace("*/*", "*/*") },
    body: null,
    sent: [],

    setQuery(key, value, { raw = false, append = false } = {}) {
      const entry = { key, value: String(value), raw };
      if (!append) {
        const at = query.findIndex((existing) => existing.key === key);
        if (at >= 0) {
          query[at] = entry;
          return;
        }
      }
      query.push(entry);
    },

    setSegments(value, { raw = false } = {}) {
      if (target.segments.length === 0) return false;
      for (const name of target.segments) segments.set(name, String(value));
      segmentsRaw = raw;
      this.sent.push(String(value).slice(0, 2000));
      return true;
    },

    pathname() {
      return target.routePath.replace(/\[(?:\.{3})?([^\]]+)\]/g, (_all, name) => {
        const value = segments.get(name) ?? "";
        return segmentsRaw ? value : encodeURIComponent(value);
      });
    },

    search() {
      if (query.length === 0) return "";
      const parts = query.map((entry) =>
        entry.raw
          ? `${entry.key}=${entry.value}`
          : `${encodeURIComponent(entry.key)}=${encodeURIComponent(entry.value)}`,
      );
      return `?${parts.join("&")}`;
    },
  };

  // The session goes on every request that names it, and into the cookie for
  // every request that does not — see the cookie construction below. Both, not
  // either: the page resolves `?session=` first and the layout resolves the
  // cookie, exactly the split `tests/deep/lib/writes.ts` exists to close.
  for (const name of ["session", "sessionLabel"]) {
    if (target.params.includes(name)) request.setQuery(name, sessionLabel);
  }

  if (!READ_ONLY_VERBS.has(target.method)) {
    request.body = "{}";
    request.headers["content-type"] = "application/json";
  }

  return request;
}

/* ═════════════════════════════════════════════════════════════════ auth */

/**
 * The deep harness's storage state, reused rather than re-minted.
 *
 * Without it this layer can still run, but it can only ever see the
 * unauthenticated half of the app — and every 401 then reads as "guard works"
 * when it might equally be "the route is broken and never got far enough to
 * break". Running both passes is what makes a 500 attributable.
 */
function loadStorageState(root, baseURL, role = "admin") {
  const host = new URL(baseURL).hostname;
  const dir = LOOPBACK_HOSTNAMES.has(host) ? "local" : "production";
  const candidates = [
    path.join(root, `tests/deep/.auth/${dir}/${role}.json`),
    path.join(root, `tests/deep/.auth/local/${role}.json`),
    path.join(root, `tests/smoke-2026-05/.auth/${role}.json`),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const state = JSON.parse(readFileSync(candidate, "utf8"));
      const cookies = (state.cookies ?? []).filter((cookie) => {
        const domain = String(cookie.domain ?? "").replace(/^\./, "");
        return !domain || host === domain || host.endsWith(`.${domain}`);
      });
      if (cookies.length === 0) continue;
      return { path: path.relative(root, candidate), cookies };
    } catch {
      /* a corrupt storage state is a missing storage state */
    }
  }
  return null;
}

function cookieHeaderFor(storage, sessionLabel) {
  const pairs = (storage?.cookies ?? []).map((cookie) => `${cookie.name}=${cookie.value}`);
  // Pinned on both passes. It carries no identity, so it does not weaken the
  // anonymous probe, and it keeps an export route off the live ledger even if
  // the query string never mentions a session.
  pairs.push(`${VIEW_SESSION_COOKIE}=${encodeURIComponent(sessionLabel)}`);
  return pairs.join("; ");
}

/* ═════════════════════════════════════════════════════════════ the send */

const TEXTUAL = /^(?:text\/|application\/(?:json|xml|javascript|x-www-form-urlencoded|problem\+json))/i;
const BODY_READ_CAP = 512 * 1024;

async function send(baseURL, request, cookieHeader, timeoutMs) {
  const url = `${baseURL}${request.pathname()}${request.search()}`;
  const headers = { ...request.headers };
  if (cookieHeader) headers.cookie = cookieHeader;

  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body: request.body ?? undefined,
      // Manual, and this is not a detail. Following redirects turns the 307 to
      // /auth/login that PROVES the guard works into a 200 from the login page,
      // and the auth-bypass rule would then fire on every guarded route in the
      // app. The status is the finding; resolving it destroys it.
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    const contentType = response.headers.get("content-type") ?? "";
    let bodyText = "";
    let bytes = 0;
    if (TEXTUAL.test(contentType) || contentType === "") {
      bodyText = (await response.text()).slice(0, BODY_READ_CAP);
      bytes = bodyText.length;
    } else {
      // Consume it anyway so the socket is released, but never look at it: a
      // 400 KB XLSX is a class list and matching patterns against it would put
      // one in this run's evidence.
      bytes = (await response.arrayBuffer()).byteLength;
      bodyText = `<binary ${bytes} bytes, ${contentType}>`;
    }

    return {
      url,
      ok: true,
      status: response.status,
      location: response.headers.get("location"),
      contentType,
      bodyText,
      bytes,
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: null,
      error: String(error?.cause?.code ?? error?.name ?? error?.message ?? error).slice(0, 200),
      ms: Math.round(performance.now() - started),
      bodyText: "",
      bytes: 0,
    };
  }
}

/** Six in flight, a shared deadline, and no unbounded queue. */
async function pool(jobs, concurrency, deadline, worker) {
  let cursor = 0;
  let abandoned = 0;
  const runners = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= jobs.length) return;
      if (Date.now() > deadline) {
        abandoned += jobs.length - index;
        cursor = jobs.length;
        return;
      }
      await worker(jobs[index], index);
    }
  });
  await Promise.all(runners);
  return abandoned;
}

/* ═══════════════════════════════════════════════════════════ evaluation */

function isSuccess(status) {
  return status !== null && status >= 200 && status < 300;
}

function curlFor(result, pass, request) {
  const parts = ["curl -i -sS", `-X ${request.method}`];
  if (pass === "admin") parts.push('-H "cookie: $FUZZ_COOKIE"');
  for (const [key, value] of Object.entries(request.headers)) {
    if (SECRET_HEADERS.has(key)) continue;
    parts.push(`-H '${key}: ${String(value).slice(0, 60).replace(/'/g, "'\\''")}'`);
  }
  if (request.body) parts.push(`--data-binary '<${String(request.body).length} bytes>'`);
  parts.push(`'${result.url.slice(0, 300)}'`);
  return parts.join(" ");
}

/**
 * One response, every rule that can fire on it.
 *
 * Order matters in two places. `fuzz.route-500` short-circuits the status
 * rules, because a 500 already says everything a wrong-status heuristic could
 * add. And a downgraded auth finding suppresses the wrong-status one, so a
 * single polite 200 does not appear twice under two severities.
 */
function evaluate({ target, entry, pass, request, result, baselines, sink, sessionLabel }) {
  const repro = curlFor(result, pass, request);
  const where = { file: target.file, line: target.line, reproCommand: repro };
  /*
   * `context` deliberately carries no payload id and no concrete URL.
   *
   * A finding's id is sha1(rule | surface | fingerprint(actual)), so anything
   * that varies between payloads splits one defect into many. Fifty-one
   * payloads at a handler that 500s on all of them is one bug, and a report
   * that prints it fifty-one times has buried the other two. The payload
   * travels as a `variant` instead: the sink collects them onto the single
   * finding, which then reads "reached by 51 inputs, including …" — which is
   * the sentence somebody triaging actually wants.
   */
  const context = `${request.method} ${target.routePath} [${pass === "anon" ? "no session" : "admin session"}]`;
  const variant = `${entry.id}${pass === "anon" ? "" : "@admin"}`;

  if (!result.ok) {
    // A connection error is not a finding on its own — a reset under a 5 MB
    // body is the server's cap doing its job — but a 500 is, and we cannot see
    // one through a dropped socket. Recorded in the JSONL, not in findings.
    return;
  }

  const baseline = baselines.get(`${pass}:${target.file}:${target.method}`);

  /* ── P0: a 5xx ─────────────────────────────────────────────────────────── */
  if (result.status >= 500) {
    sink.record({
      rule: "fuzz.route-500",
      ...where,
      variant,
      title: `${target.routePath} answers ${result.status} to ${entry.describe}`,
      expected:
        "A malformed request is a 400. The server decides what it can parse; the caller only "
        + "decides what to send.",
      actual: `${context} → ${result.status} in ${result.ms}ms.`,
      evidence: redact(result.bodyText).slice(0, 300),
      why:
        `${entry.why} A 5xx here is input-triggered, and the input is controlled by whoever `
        + "has the URL — on `/api/**` that is anyone at all, because proxy.ts only redirects "
        + "unauthenticated traffic away from /protected.",
      fix:
        "Wrap the parse and the validation, and answer 400 with a shape the caller can act on. "
        + "If the input is legitimate and the handler is wrong, that is the bug this found.",
    });
    return;
  }

  /* ── P0: a 2xx with no session, from a route that can refuse ───────────── */
  let downgradedAuth = false;
  if (
    pass === "anon"
    && target.guarded
    && isSuccess(result.status)
    // OPTIONS is answered by the framework's method dispatch without running
    // the handler, so a 204 there discloses the verb list and nothing else.
    && entry.id !== "method-options"
  ) {
    if (DENIAL_TEXT.test(result.bodyText) || result.bytes === 0) {
      downgradedAuth = true;
      sink.record({
        rule: "fuzz.wrong-status",
        ...where,
        variant,
        title: `${target.routePath} refuses an anonymous caller with ${result.status}, not 401`,
        expected: "A refusal is a 401 or a 403. A 2xx carrying a refusal is a 2xx.",
        actual: `${context} → ${result.status}, body reads as a denial.`,
        evidence: redact(result.bodyText).slice(0, 200),
        why:
          "Every caller that checks `response.ok` — the command palette, the desk's preview "
          + "fetch, any script — treats this as data. The message is for a human; the status "
          + "is for the code.",
        fix: "Return the denial with a 401 or 403 status.",
      });
    } else {
      sink.record({
        rule: "fuzz.auth-bypassed",
        ...where,
        variant,
        title: `${target.routePath} answers ${result.status} with no session`,
        expected:
          "A route naming a permission helper or a shared secret refuses a caller that has "
          + "neither — 401, 403, or the 307 to /auth/login that the proxy issues.",
        actual: `${context} → ${result.status}, ${result.bytes} bytes of body.`,
        evidence: redact(result.bodyText).slice(0, 300),
        why:
          "The source names a guard, so this is not a route somebody forgot to protect — it is "
          + "a guard that did not run on this path. Under /api/** there is no second line: "
          + "proxy.ts does not cover it and app/protected/layout.tsx is not in the stack.",
        fix:
          "Check where the guard sits relative to the early returns. A permission check after "
          + "a cache hit, a preflight branch or an error path is a check with a way around it.",
      });
    }
  }

  /* ── P1: something internal in the body ────────────────────────────────── */
  if (result.bytes > 0 && !result.bodyText.startsWith("<binary ")) {
    const cleaned = withoutEcho(result.bodyText, [
      ...request.sent,
      sessionLabel,
      target.routePath,
    ]);
    for (const leak of LEAK_PATTERNS) {
      const hit = cleaned.match(leak.pattern);
      if (!hit) continue;
      sink.record({
        rule: "fuzz.stack-leaked",
        ...where,
        variant,
        title: `${target.routePath} returns ${leak.label} to the caller`,
        expected:
          "An error body names what the caller did wrong. It never names the server's files, "
          + "its environment variables, its tables or its Postgres error codes.",
        actual: `${context} → ${result.status}; body contains ${leak.label}: ${redact(hit[0]).slice(0, 160)}`,
        evidence: redact(cleaned).slice(0, 300),
        why:
          "Postgres error text names tables and columns, which is a schema map for anyone "
          + "probing; a stack frame names the deployment's paths. Our own payload is subtracted "
          + "from the body before this fires, so this is the server's text and not an echo of "
          + "ours.",
        fix:
          "Log the original and return a message the caller can act on. `Sentry.captureException` "
          + "keeps the detail where it belongs.",
      });
      break;
    }
  }

  /* ── P1: a 200 that did not finish ────────────────────────────────────── */
  if (result.status === 200 && request.method !== "HEAD") {
    if (result.bytes === 0 && (baseline?.bytes ?? 0) > 0) {
      sink.record({
        rule: "fuzz.unhandled-rejection",
        ...where,
        variant,
        title: `${target.routePath} answers 200 with an empty body`,
        expected:
          "A 200 carries the payload the route documents. Nothing is a valid answer only when "
          + "the status says so — 204.",
        actual:
          `${context} → 200, 0 bytes. The same request without the payload returned `
          + `${baseline.bytes} bytes.`,
        why:
          "This is the shape of a rejection that landed after the response headers were "
          + "flushed: the handler committed to 200, then the promise nobody awaited threw. "
          + "`scan.floating-promise` finds the source-level version of the same bug.",
        fix: "Await it, or answer 204 deliberately.",
      });
    } else if (/json/i.test(result.contentType) && result.bytes > 0) {
      try {
        JSON.parse(result.bodyText);
      } catch {
        if (result.bytes < BODY_READ_CAP) {
          sink.record({
            rule: "fuzz.unhandled-rejection",
            ...where,
        variant,
            title: `${target.routePath} answers 200 with a body that is not valid JSON`,
            expected: "A response declaring application/json parses as JSON.",
            actual: `${context} → 200, ${result.bytes} bytes, JSON.parse throws.`,
            evidence: redact(result.bodyText).slice(0, 200),
            why:
              "A half-written body is a stream that stopped mid-flight. Every caller sees a "
              + "parse error at its own end and blames itself.",
            fix: "Build the payload before the response starts, or set the status after it fails.",
          });
        }
      }
    }
  }

  /* ── P2: statuses that do not match the request ───────────────────────── */
  if (!downgradedAuth && entry.expectRejection && isSuccess(result.status)) {
    sink.record({
      rule: "fuzz.wrong-status",
      ...where,
      variant,
      title: `${target.routePath} answers ${result.status} to ${entry.describe}`,
      expected:
        entry.kind === "method"
          ? "A verb the route module does not export is a 405."
          : "A payload that cannot be valid is a 400.",
      actual: `${context} → ${result.status}.`,
      evidence: redact(result.bodyText).slice(0, 200),
      why: entry.why,
      fix:
        entry.kind === "method"
          ? "Nothing, if Next is answering. If the handler is, it is handling a verb the file "
            + "does not declare and a reader cannot see."
          : "Validate before acting, and say no with a status.",
    });
  }

  if (pass === "anon" && result.status === 404 && target.guarded) {
    const admin = baselines.get(`admin:${target.file}:${target.method}`);
    // Only when the same route answers the same request for a signed-in
    // caller. Without that pairing, a 404 is just a 404 and this rule would
    // fire on every route with a nonexistent id in its path — which is most
    // of them, by construction.
    if (admin && isSuccess(admin.status)) {
      sink.record({
        rule: "fuzz.wrong-status",
        ...where,
        variant,
        title: `${target.routePath} answers 404 to an anonymous caller and 200 to a signed-in one`,
        expected:
          "A missing permission is a 403. A 404 is a claim about the resource, and the resource "
          + "is plainly there.",
        actual: `${context} → 404 anonymous, ${admin.status} as admin.`,
        why:
          "Hiding existence is a defensible choice, but it has to be a choice: made everywhere, "
          + "or the difference between 404 and 403 across two routes is itself the oracle.",
        fix: "Return 403, or apply the same treatment on every guarded route and write it down.",
      });
    }
  }

  /* ── P3: a payload that costs the server real time ────────────────────── */
  const floor = Math.max(baseline?.ms ?? 0, 250);
  if (result.ms > 20_000 || (result.ms > 5_000 && result.ms > floor * 8)) {
    sink.record({
      rule: "fuzz.slow-path",
      ...where,
      variant,
      title: `${target.routePath} takes ${result.ms}ms on ${entry.describe}`,
      expected:
        "Rejecting bad input is cheaper than serving good input, not more expensive. Cost is "
        + "spent after validation, never before it.",
      actual: `${context} → ${result.status} in ${result.ms}ms; the benign request took ${baseline?.ms ?? "?"}ms.`,
      why:
        `${entry.why} A payload that is short to send and long to process is the whole shape of `
        + "a denial of service, and this app runs on a 60-second function ceiling.",
      fix:
        "Bound it before the work starts — a length cap, a parameter-count cap, a depth cap — "
        + "rather than after.",
    });
  }
}

/* ═════════════════════════════════════════════════════════════ the layer */

export async function runFuzzLayer({ project, sink, coverage, root, runDir, baseURL, args = [] }) {
  const flag = (name) => args.includes(`--${name}`);
  const value = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 && args[at + 1] && !args[at + 1].startsWith("--") ? args[at + 1] : fallback;
  };
  const number = (name, fallback) => {
    const parsed = Number(value(name, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const sessionLabel = value("session", DEFAULT_SESSION).trim();
  const fuzzWrites = flag("fuzz-writes");
  const concurrency = number("fuzz-concurrency", 6);
  const timeoutMs = number("fuzz-timeout-ms", 15_000);
  const budgetMs = number("fuzz-budget-ms", 300_000);
  const maxRequests = number("fuzz-max-requests", 2_000);
  const serverLog = value("fuzz-server-log", "");

  const jsonlPath = runDir ? path.join(runDir, "fuzz-requests.jsonl") : null;
  const routeHandlerCount = project.routeHandlers.length;

  /**
   * Every exit that is not a run goes through here.
   *
   * Loud on stdout and honest in the ledger, because the two failure modes
   * this layer has are symmetric: a run that quietly did nothing reports as
   * clean, and a run that quietly did something reports as safe.
   */
  const refuse = (headline, note) => {
    console.log(`  fuzz             REFUSED  ${headline}`);
    coverage.declare({
      check: "fuzz",
      dimension: "route handlers probed with malformed input",
      domainSize: routeHandlerCount,
      examined: 0,
      strategy: "refused",
      note: `REFUSED: ${headline} ${note}`,
    });
  };

  /* ── gate 1: is there anywhere to send this ──────────────────────────── */
  if (!baseURL) {
    refuse(
      "no --base-url was given, so nothing was fuzzed.",
      "This layer needs a running server; the static and ai layers do not. "
        + "Run `npm run scan -- --layers fuzz --base-url http://127.0.0.1:3000`.",
    );
    return;
  }

  let origin;
  try {
    origin = new URL(baseURL);
  } catch {
    refuse(`--base-url "${baseURL}" is not a URL.`, "Nothing was sent.");
    return;
  }

  /* ── gate 2: the host allowlist, mirroring writes.ts lock 2 ──────────── */
  const loopback = LOOPBACK_HOSTNAMES.has(origin.hostname);
  const remoteAllowed = allowedRemoteHosts();
  if (!loopback) {
    if (!remoteAllowed.has(origin.host)) {
      refuse(
        `host "${origin.host}" is not in the fuzz allowlist.`,
        "Loopback is allowed on any port because a loopback address is not somebody's "
          + "deployment. Any other host has to be named in SCAN_FUZZ_ALLOWED_HOSTS, "
          + "SCHOOLFEES_SMOKE_BASE_URL or DEEP_PRODUCTION_ORIGIN. Nothing was sent.",
      );
      return;
    }
    if (!flag("fuzz-remote")) {
      refuse(
        `"${origin.host}" is a remote deployment and --fuzz-remote was not passed.`,
        "Being on the allowlist makes a host permissible, not intended. Malformed input at a "
          + "shared deployment is somebody else's afternoon. Nothing was sent.",
      );
      return;
    }
  }

  /* ── gate 3: the session label, mirroring writes.ts locks 1 and 3 ────── */
  if (sessionLabel === LIVE_SESSION || sessionLabel.endsWith(`-${LIVE_SESSION}`) === false
      && !TEST_SESSION_PREFIXES.some((prefix) => sessionLabel.startsWith(prefix))) {
    // Two ways to be wrong and one message: the label is the live one, or it
    // is some third thing nobody declared. Either way it is not a session this
    // tool is allowed to point malformed input at.
    refuse(
      `session label "${sessionLabel}" is not a TEST-, UAT- or DEMO- session.`,
      `The live session is ${LIVE_SESSION} and carries real families' money. Even a read-only `
        + "pass would pull live rows into this run's JSONL. Pass --session TEST-2026-27. "
        + "Nothing was sent.",
    );
    return;
  }
  if (sessionLabel === LIVE_SESSION) {
    refuse(`session label "${sessionLabel}" is the live session.`, "Nothing was sent.");
    return;
  }

  /* ── gate 4: writes ──────────────────────────────────────────────────── */
  if (fuzzWrites && !TEST_SESSION_PREFIXES.some((prefix) => sessionLabel.startsWith(prefix))) {
    refuse(
      `--fuzz-writes was passed with session "${sessionLabel}".`,
      "Write verbs are only ever fuzzed against a TEST-, UAT- or DEMO- session. Nothing was sent.",
    );
    return;
  }

  /* ── enumerate ───────────────────────────────────────────────────────── */
  const { targets, skipped } = enumerateTargets(project, { fuzzWrites });
  if (targets.length === 0) {
    refuse("no route handler survived the target filters.", "Nothing was sent.");
    return;
  }

  const storage = loadStorageState(root, baseURL);
  const passes = storage ? ["anon", "admin"] : ["anon"];
  const cookieByPass = {
    anon: cookieHeaderFor(null, sessionLabel),
    admin: cookieHeaderFor(storage, sessionLabel),
  };

  /* ── reachability ────────────────────────────────────────────────────── */
  const probe = await send(
    origin.origin,
    { method: "GET", headers: {}, body: null, sent: [], params: [], pathname: () => "/", search: () => "" },
    cookieByPass.anon,
    Math.min(timeoutMs, 10_000),
  );
  if (!probe.ok) {
    console.log(`  fuzz             UNREACHABLE  ${origin.origin} — ${probe.error}`);
    coverage.declare({
      check: "fuzz",
      dimension: "route handlers probed with malformed input",
      domainSize: routeHandlerCount,
      examined: 0,
      strategy: "unreachable",
      note:
        `The server at ${origin.origin} did not answer (${probe.error}). No request was sent, `
        + "so nothing here is evidence that the app is healthy — start the server and run the "
        + "layer again.",
    });
    return;
  }

  /* ── build the matrix ────────────────────────────────────────────────── */
  const jobs = [];
  const perTargetVariants = new Map();
  for (const pass of passes) {
    for (const target of targets) {
      jobs.push({ pass, target, entry: BASELINE, phase: 0 });
    }
  }
  for (const pass of passes) {
    for (const target of targets) {
      const cap = target.heavy ? HEAVY_VARIANT_CAP : Number.POSITIVE_INFINITY;
      let used = 0;
      for (const entry of CORPUS) {
        if (entry.kind === "body" && READ_ONLY_VERBS.has(target.method)) continue;
        if (entry.kind === "path" && target.segments.length === 0) continue;
        if (used >= cap) break;
        used += 1;
        jobs.push({ pass, target, entry, phase: 1 });
      }
      perTargetVariants.set(`${pass}:${target.file}:${target.method}`, used);
    }
  }

  const planned = jobs.length;
  const trimmed = jobs.slice(0, maxRequests);

  console.log(
    `  fuzz             ${targets.length} target(s) × ${CORPUS.length} payload(s) `
      + `× ${passes.length} pass(es) → ${trimmed.length} request(s) at ${origin.origin}`,
  );
  if (!storage) {
    console.log(
      "  fuzz             no storage state under tests/deep/.auth — anonymous pass only",
    );
  }

  if (runDir) {
    writeFileSync(
      path.join(runDir, "fuzz-targets.json"),
      `${JSON.stringify({ baseURL: origin.origin, sessionLabel, fuzzWrites, targets, skipped }, null, 2)}\n`,
      "utf8",
    );
  }

  const logSizeBefore = serverLog && existsSync(serverLog) ? statSync(serverLog).size : null;

  /* ── run ─────────────────────────────────────────────────────────────── */
  const baselines = new Map();
  const deadline = Date.now() + budgetMs;
  let sent = 0;
  let errored = 0;

  const runJob = async (job, seq) => {
    const request = makeRequest(job.target, sessionLabel);
    if (job.entry.apply(request) === false) return;

    const result = await send(origin.origin, request, cookieByPass[job.pass], timeoutMs);
    sent += 1;
    if (!result.ok) errored += 1;

    if (job.phase === 0) {
      baselines.set(`${job.pass}:${job.target.file}:${job.target.method}`, result);
    }

    if (jsonlPath) {
      appendFileSync(
        jsonlPath,
        `${JSON.stringify({
          seq,
          at: new Date().toISOString(),
          pass: job.pass,
          payload: job.entry.id,
          file: job.target.file,
          method: request.method,
          url: result.url.slice(0, 1000),
          requestHeaders: redactHeaders(request.headers),
          requestBodyBytes: request.body ? String(request.body).length : 0,
          requestBodyPreview: request.body ? redact(String(request.body)).slice(0, 300) : null,
          status: result.status,
          error: result.error ?? null,
          location: result.location ?? null,
          contentType: result.contentType ?? null,
          ms: result.ms,
          responseBytes: result.bytes,
          responseBodyPreview: redact(result.bodyText).slice(0, 2_000),
        })}\n`,
        "utf8",
      );
    }

    if (job.phase === 1 || !result.ok) {
      evaluate({
        target: job.target,
        entry: job.entry,
        pass: job.pass,
        request,
        result,
        baselines,
        sink,
        sessionLabel,
      });
    }
  };

  // Phase 0 first, and to completion: every comparative rule below — slow-path,
  // the empty-200, the 404-versus-403 pairing — is measured against the benign
  // request for the same target. Interleaving them would make a finding depend
  // on the order the pool happened to drain.
  const phaseZero = trimmed.filter((job) => job.phase === 0);
  const phaseOne = trimmed.filter((job) => job.phase === 1);
  const abandonedZero = await pool(phaseZero, concurrency, deadline, runJob);
  for (const job of phaseZero) {
    evaluate({
      target: job.target,
      entry: job.entry,
      pass: job.pass,
      request: makeRequest(job.target, sessionLabel),
      result: baselines.get(`${job.pass}:${job.target.file}:${job.target.method}`) ?? { ok: false },
      baselines,
      sink,
      sessionLabel,
    });
  }
  const abandonedOne = await pool(phaseOne, concurrency, deadline, (job, index) =>
    runJob(job, phaseZero.length + index),
  );
  const abandoned = abandonedZero + abandonedOne;

  /* ── the server's own log, if we were pointed at one ─────────────────── */
  if (serverLog && logSizeBefore !== null && existsSync(serverLog)) {
    const after = statSync(serverLog).size;
    if (after > logSizeBefore) {
      const tail = readFileSync(serverLog, "utf8").slice(logSizeBefore);
      const match = tail.match(
        /(unhandledRejection|UnhandledPromiseRejection|ERR_UNHANDLED_REJECTION)[^\n]{0,300}/,
      );
      if (match) {
        sink.record({
          rule: "fuzz.unhandled-rejection",
          file: path.relative(root, serverLog),
          line: 1,
          title: "The server logged an unhandled rejection during the fuzz run",
          expected:
            "A request that fails fails inside its handler, where the status code is still "
            + "changeable.",
          actual: redact(match[0]),
          evidence: redact(tail.slice(0, 300)),
          why:
            "An unhandled rejection escapes the request that caused it. On a serverless "
            + "runtime it can take the instance with it, so the next caller pays for this "
            + "one's payload. Cross-reference fuzz-requests.jsonl by timestamp for the culprit.",
          fix: "Await the promise, or attach a catch that logs and moves on.",
          reproCommand: `grep -n unhandledRejection ${path.relative(root, serverLog)}`,
        });
      }
    }
  }

  /* ── the ledger ──────────────────────────────────────────────────────── */
  const bodyEntries = CORPUS.filter((entry) => entry.kind === "body").length;
  const skippedNote = skipped
    .slice(0, 6)
    .map((entry) => `${entry.file} (${entry.reason.split(".")[0]})`)
    .join("; ");

  coverage.declare({
    check: "fuzz",
    dimension: "route handler × HTTP verb, probed with malformed input",
    domainSize: routeHandlerCount,
    examined: new Set(targets.map((target) => target.file)).size,
    strategy: "exhaustive",
    note:
      `${sent} request(s) against ${targets.length} target(s) at ${origin.origin}, session `
      + `${sessionLabel}, ${passes.join(" + ")} pass(es); ${errored} did not complete `
      + `(timeout or reset) and ${abandoned} were abandoned at the ${Math.round(budgetMs / 1000)}s `
      + `budget${planned > trimmed.length ? `, ${planned - trimmed.length} trimmed at --fuzz-max-requests` : ""}. `
      + `NOT fuzzed: ${skipped.length} route/verb pair(s) — ${skippedNote || "none"}. `
      + (fuzzWrites
        ? "Write verbs WERE included (--fuzz-writes, TEST- session). "
        : `Write verbs were excluded, so the ${bodyEntries} body payloads were declared and not `
          + "sent — nothing here is evidence about how a POST handler parses its body. ")
      + (storage
        ? `Authenticated pass used ${storage.path} (admin only; the other four roles are ${""}`
          + "covered by the deep harness's RBAC matrix, not here). "
        : "NO storage state was found under tests/deep/.auth, so only the anonymous pass ran: "
          + "every 401 below is unverified as a guard rather than as a broken handler. ")
      + "Pages, Server Actions and the MCP Worker are out of scope for this layer. "
      + "False-positive sources, in order: a dev server renders real stack traces by design, "
      + "so fuzz.stack-leaked against `next dev` reports the framework rather than the app; "
      + "fuzz.slow-path measures against a warm baseline and a cold lambda will still trip it; "
      + "and fuzz.wrong-status is heuristic by registration.",
  });

  console.log(
    `  fuzz             ${sent} sent · ${errored} unfinished · ${sink.size} finding(s)`,
  );
}
