/**
 * The payloads. One file, one job: describe malformed input, not send it.
 *
 * `tests/deep/surface/negatives.ts` already owns 25 malformed *URLs*, and this
 * corpus deliberately does not repeat them. That file drives a browser, so it
 * can only ever produce the request a browser produces: a GET, with the
 * headers Chromium chooses, a body it will not let you attach, and a path the
 * URL parser has already normalised. Everything it found lives on the query
 * string for exactly that reason.
 *
 * Driving HTTP directly reaches the rest of the request:
 *
 *   - the body, and the four ways it can disagree with `Content-Type`
 *   - a body large enough that reading it is itself the denial of service
 *   - `Accept`, and a `Content-Type` that is missing, empty or unparseable
 *   - a method the route never exported, which must be a 405 and not a 500
 *   - a percent-encoded path segment, which `new URL()` in a browser would
 *     have collapsed before the server ever saw it
 *
 * Every entry states the reason it exists in `why`. That is not decoration:
 * the corpus is the part of a fuzzer that rots, because an entry nobody can
 * justify is an entry the next person deletes when it goes red.
 *
 * Shape of an entry:
 *
 *   id        stable, kebab-case; it becomes part of the finding fingerprint
 *   kind      body | query | path | header | method — decides applicability
 *   describe  one line, present tense, what the request looks like
 *   why       one line, why this shape is worth a request
 *   apply     mutates the request; returns false when it cannot apply
 *
 * Two flags travel with an entry and are read by `run.mjs`:
 *
 *   expectRejection  a 2xx here is itself suspicious, so `fuzz.wrong-status`
 *                    fires on success. Set it only where success is genuinely
 *                    wrong. It is NOT set on the query entries, because this
 *                    app's documented behaviour for a junk query parameter is
 *                    to fall back and render — see `resolveDashboardView` and
 *                    the "renders" expectations all through `negatives.ts`.
 *   heavy            the payload is large; skipped when the run is trimming to
 *                    fit its wall-clock budget.
 */

/* ── shared literals ─────────────────────────────────────────────────────── */

/** Right-to-left override, zero-width space, emoji, a 4-byte astral plane character. */
const UNICODE_SOUP = "‮gnirts‬​😀𝕏";

/**
 * A NUL, escaped so the JSON around it stays valid.
 *
 * The interesting failure is not the parser — it is Postgres, which cannot
 * store U+0000 in a `text` column and answers `22P05 unsupported Unicode
 * escape sequence`. A handler that passes user text straight through turns
 * that into a 500 for a character somebody can type.
 */
const NUL_IN_JSON = "before\\u0000after";

/** PostgREST reads these as operators, not as text. */
const POSTGREST_METACHARS = "*,.()'\"";

/** Quote, comment, and a paren, in the order an injection attempt writes them. */
const SQL_METACHARS = "');--";

const NONEXISTENT_UUID = "3f2b91c4-7d18-4a55-9e60-2c8ab41f0d73";

function jsonBody(request, text, contentType = "application/json") {
  request.body = text;
  if (contentType === null) delete request.headers["content-type"];
  else request.headers["content-type"] = contentType;
  request.sent.push(text.slice(0, 2000));
}

/**
 * Put a value where the route will actually read it.
 *
 * The route's own source names its query parameters — `run.mjs` scrapes
 * `searchParams.get("…")` out of the handler — so a fuzz value lands on a
 * parameter the code paths through, rather than on a `?q=` the handler never
 * looks at. Capped at two parameters per entry: past that the matrix grows
 * faster than the information does.
 */
function inject(request, value, { raw = false } = {}) {
  const names = request.params.length > 0 ? request.params.slice(0, 2) : ["q"];
  for (const name of names) request.setQuery(name, value, { raw });
  request.sent.push(value.slice(0, 2000));
}

/* ── body: only reachable on a method that carries one ───────────────────── */

/** @type {ReadonlyArray<object>} */
const BODY_CASES = [
  {
    id: "body-empty",
    kind: "body",
    describe: "POST with Content-Type: application/json and a zero-length body",
    why:
      "`await request.json()` on an empty body throws `Unexpected end of JSON input`. "
      + "A handler that does not wrap that call answers 500 to a request that carries nothing.",
    expectRejection: true,
    apply(request) {
      jsonBody(request, "");
    },
  },
  {
    id: "body-absent-entirely",
    kind: "body",
    describe: "POST with no body and no Content-Type at all",
    why:
      "Distinct from an empty body: `request.formData()` on a bodyless POST throws a "
      + "different error, and the import upload routes call formData() first.",
    expectRejection: true,
    apply(request) {
      request.body = null;
      delete request.headers["content-type"];
    },
  },
  {
    id: "body-not-json",
    kind: "body",
    describe: "Content-Type: application/json carrying text that is not JSON",
    why:
      "The commonest real shape — a client that serialised badly. The declared type is a "
      + "promise the handler is entitled to distrust, and the difference between 400 and 500 "
      + "is whether it did.",
    expectRejection: true,
    apply(request) {
      jsonBody(request, "not json at all { \"almost\": ");
    },
  },
  {
    id: "body-json-null",
    kind: "body",
    describe: "the body is the literal `null`",
    why:
      "Valid JSON, so the parse succeeds and the destructure is what throws: "
      + "`const { studentId } = await request.json()` is a TypeError on null, thrown one line "
      + "after the only line anybody thought to guard.",
    expectRejection: true,
    apply(request) {
      jsonBody(request, "null");
    },
  },
  {
    id: "body-json-array",
    kind: "body",
    describe: "the body is `[]` where an object is expected",
    why:
      "An array destructures without throwing and yields undefined for every field, so this "
      + "one does not crash — it reaches the database with nothing filled in.",
    expectRejection: true,
    apply(request) {
      jsonBody(request, "[]");
    },
  },
  {
    id: "body-json-scalar",
    kind: "body",
    describe: "the body is a bare JSON string",
    why: "The third shape of valid-JSON-wrong-type, and the one a schema check most often misses.",
    expectRejection: true,
    apply(request) {
      jsonBody(request, '"a bare string"');
    },
  },
  {
    id: "body-json-deep",
    kind: "body",
    describe: "5,000 levels of nested arrays",
    why:
      "JSON.parse answers RangeError rather than SyntaxError, so a catch that only handles "
      + "SyntaxError re-throws. A stack overflow is still a 500 a stranger chose.",
    expectRejection: true,
    apply(request) {
      jsonBody(request, `${"[".repeat(5000)}1${"]".repeat(5000)}`);
    },
  },
  {
    id: "body-oversized",
    kind: "body",
    describe: "a 5 MB JSON body",
    why:
      "Vercel caps a serverless request body at 4.5 MB, so the correct answer is 413 from the "
      + "platform. Locally there is no cap, and the handler reads all of it into memory before "
      + "it validates anything — which is the denial of service.",
    expectRejection: true,
    heavy: true,
    apply(request) {
      jsonBody(request, `{"note":"${"A".repeat(5 * 1024 * 1024)}"}`);
      // Not pushed to `sent`: subtracting five megabytes from every response
      // body before pattern-matching it costs more than it can possibly find.
      request.sent.pop();
    },
  },
  {
    id: "body-proto-pollution",
    kind: "body",
    describe: "a body carrying `__proto__` and `constructor.prototype`",
    why:
      "JSON.parse itself is safe; the merge downstream of it is not. Anything doing "
      + "`{ ...defaults, ...body }` into a shared object, or a deep-merge helper, can be made "
      + "to write onto Object.prototype and change a permission check three modules away.",
    expectRejection: true,
    apply(request) {
      jsonBody(
        request,
        '{"__proto__":{"isAdmin":true,"polluted":"yes"},'
          + '"constructor":{"prototype":{"polluted":"yes"}},'
          + '"studentId":"' + NONEXISTENT_UUID + '"}',
      );
    },
  },
  {
    id: "body-unicode-nul",
    kind: "body",
    describe: "valid JSON whose strings hold an escaped NUL, an RTL override and astral characters",
    why:
      "Postgres text cannot hold U+0000 and answers 22P05. The RTL override is the one that "
      + "reaches a parent: it survives into a receipt PDF and reverses the name printed on it.",
    apply(request) {
      jsonBody(
        request,
        `{"note":"${NUL_IN_JSON}","name":"${UNICODE_SOUP}","reference":"${UNICODE_SOUP}"}`,
      );
    },
  },
  {
    id: "body-content-type-missing",
    kind: "body",
    describe: "well-formed JSON sent with no Content-Type header",
    why:
      "`request.json()` in undici parses regardless of the declared type, but "
      + "`request.formData()` does not — it needs the header to pick a parser and throws "
      + "without one. Which of the two a route calls first decides the status code.",
    expectRejection: true,
    apply(request) {
      jsonBody(request, '{"studentId":"' + NONEXISTENT_UUID + '"}', null);
    },
  },
  {
    id: "body-content-type-lying",
    kind: "body",
    describe: "well-formed JSON declared as text/plain",
    why: "The header and the bytes disagree. A handler should trust neither on its own.",
    apply(request) {
      jsonBody(request, '{"studentId":"' + NONEXISTENT_UUID + '"}', "text/plain");
    },
  },
  {
    id: "body-content-type-malformed",
    kind: "body",
    describe: "Content-Type: application/json;;charset=",
    why:
      "An unparseable media type. The MIME parser is the first thing to touch the request and "
      + "the last thing anybody writes a test for.",
    expectRejection: true,
    apply(request) {
      jsonBody(request, '{"a":1}', "application/json;;charset=");
    },
  },
  {
    id: "body-multipart-no-boundary",
    kind: "body",
    describe: "Content-Type: multipart/form-data with no boundary parameter",
    why:
      "The two import upload routes and the photo route call `request.formData()`. A "
      + "multipart declaration without a boundary is unparseable by definition, and this is "
      + "the exact shape a hand-rolled client sends.",
    expectRejection: true,
    apply(request) {
      jsonBody(request, "--nope\r\nnot really multipart\r\n--nope--", "multipart/form-data");
    },
  },
];

/* ── query: applies to every target ──────────────────────────────────────── */

const QUERY_CASES = [
  {
    id: "query-sql-metachars",
    kind: "query",
    describe: "a quote, a paren and a SQL line comment in a declared parameter",
    why:
      "`negatives.ts` sends this through the browser to a page. A route handler builds its "
      + "own filters and is a separate code path with its own escaping.",
    apply(request) {
      inject(request, `${SQL_METACHARS} O'Brien`);
    },
  },
  {
    id: "query-postgrest-metachars",
    kind: "query",
    describe: "PostgREST's own operator characters as a parameter value",
    why:
      "This is the injection that actually applies here. `.or()`, `.in()` and `.ilike()` take "
      + "a comma-and-paren mini-language, so an unescaped comma in a value does not read as "
      + "text — it adds a disjunct, and the filter returns rows the caller should not see.",
    apply(request) {
      inject(request, POSTGREST_METACHARS);
    },
  },
  {
    id: "query-postgrest-metachars-encoded",
    kind: "query",
    describe: "the same operators percent-encoded (%2C, %2A, %28)",
    why:
      "Encoded and decoded take different paths: one is decoded by the URL parser before the "
      + "handler sees it, the other by PostgREST after. A guard on the raw string misses this.",
    apply(request) {
      inject(request, "%2A%2C%2E%28%29%27", { raw: true });
    },
  },
  {
    id: "query-duplicated",
    kind: "query",
    describe: "the same parameter twice, with different values",
    why:
      "The deep run found `?session=a&session=b` crashing a Server Component: searchParams "
      + "becomes string[] and the session resolver, alone among the switchers, does not take "
      + "value[0]. Route handlers use `searchParams.get()`, which quietly takes the first — so "
      + "the same bookmark that crashes a page silently changes a filter here.",
    apply(request) {
      const names = request.params.length > 0 ? request.params.slice(0, 1) : ["q"];
      for (const name of names) {
        request.setQuery(name, "first", { append: true });
        request.setQuery(name, "second", { append: true });
      }
    },
  },
  {
    id: "query-duplicated-many",
    kind: "query",
    describe: "the same parameter repeated fifty times",
    why:
      "Repetition is the cheapest amplification there is: one short URL, fifty array entries "
      + "to allocate and, on any handler that loops over getAll(), fifty round trips.",
    apply(request) {
      const name = request.params[0] ?? "q";
      for (let index = 0; index < 50; index += 1) {
        request.setQuery(name, `v${index}`, { append: true });
      }
    },
  },
  {
    id: "query-oversized",
    kind: "query",
    describe: "a 100 KB parameter value",
    why:
      "`negatives.ts` caps at 200 characters because that is what a person pastes. 100 KB is "
      + "what a script sends, and it is where a URL length limit either exists or does not.",
    heavy: true,
    apply(request) {
      inject(request, "x".repeat(100 * 1024));
    },
  },
  {
    id: "query-negative-number",
    kind: "query",
    describe: "-1 where a count or a page number is expected",
    why:
      "A negative page becomes a negative `.range()` offset. PostgREST answers that with an "
      + "error, not an empty list.",
    apply(request) {
      inject(request, "-1");
    },
  },
  {
    id: "query-huge-number",
    kind: "query",
    describe: "a 21-digit integer",
    why:
      "Past Number.MAX_SAFE_INTEGER the parse succeeds and the value is wrong, which is worse "
      + "than a rejection because nothing downstream can tell.",
    apply(request) {
      inject(request, "999999999999999999999");
    },
  },
  {
    id: "query-non-numeric",
    kind: "query",
    describe: "NaN, Infinity and hex where a number is expected",
    why:
      "`Number(\"0x10\")` is 16 and `Number(\"1e400\")` is Infinity — both parse, neither is what "
      + "the caller typed, and `Number.isInteger` is the only check that catches either.",
    apply(request) {
      inject(request, "NaN");
      const second = request.params[1] ?? "page";
      request.setQuery(second, "1e400");
      request.sent.push("1e400");
    },
  },
  {
    id: "query-empty-value",
    kind: "query",
    describe: "the parameter is present with an empty value",
    why:
      "`get()` returns \"\" and not null, so `?? \"default\"` does not fire and `|| \"default\"` "
      + "does. The repo uses both idioms, sometimes in the same file.",
    apply(request) {
      inject(request, "");
    },
  },
  {
    id: "query-unicode",
    kind: "query",
    describe: "RTL override, zero-width space, emoji and an astral character in a value",
    why:
      "A zero-width space survives `.trim()` and defeats an equality check that looks correct "
      + "on screen. The astral character is two UTF-16 units, so any `.slice(0, n)` cap can cut "
      + "it in half and produce a lone surrogate.",
    apply(request) {
      inject(request, UNICODE_SOUP);
    },
  },
  {
    id: "query-nul-byte",
    kind: "query",
    describe: "a percent-encoded NUL in a value",
    why:
      "Postgres refuses U+0000 in text with 22P05. Anything that reaches a column without "
      + "stripping it turns a single keystroke into a 500.",
    apply(request) {
      inject(request, "before%00after", { raw: true });
    },
  },
  {
    id: "query-crlf",
    kind: "query",
    describe: "an encoded CRLF and a header-shaped tail in a value",
    why:
      "Response splitting, for any value that is echoed into a header — and one is: the export "
      + "routes put a caller-influenced filename into Content-Disposition.",
    apply(request) {
      inject(request, "x%0d%0aX-Injected:%20yes", { raw: true });
    },
  },
  {
    id: "query-path-traversal",
    kind: "query",
    describe: "../../etc/passwd as a parameter value",
    why:
      "Two routes take a storage key as a query parameter and hand it to Supabase Storage: "
      + "the defaulters voice note and the student photo. Both name the parameter `path`.",
    apply(request) {
      inject(request, "../../../etc/passwd");
    },
  },
  {
    id: "query-bracket-array",
    kind: "query",
    describe: "PHP-style param[]=a&param[]=b",
    why:
      "URLSearchParams treats `param[]` as a parameter literally named `param[]`, so the value "
      + "the handler wanted is simply absent. It is the shape of an integration written against "
      + "the wrong framework, and it must read as missing rather than as broken.",
    apply(request) {
      const name = request.params[0] ?? "q";
      request.setQuery(`${name}[]`, "a", { append: true });
      request.setQuery(`${name}[]`, "b", { append: true });
    },
  },
  {
    id: "query-session-malformed",
    kind: "query",
    describe: "session=2026-2027 — a four-digit second half",
    why:
      "`parseAcademicSessionLabel` rejects it. What matters is what happens next: the request "
      + "must fall back to the pinned cookie, never to whatever session sorts first.",
    apply(request) {
      request.setQuery("session", "2026-2027");
      request.setQuery("sessionLabel", "2026-2027");
      request.sent.push("2026-2027");
    },
  },
  {
    id: "query-session-nonexistent",
    kind: "query",
    describe: "a well-formed session label that names no ledger",
    why:
      "Well-formed and absent is the harder case than malformed: the parser passes it through "
      + "and the query returns nothing. Zero collected must read as \"no such session\" and not "
      + "as a fact about money.",
    apply(request) {
      request.setQuery("session", "TEST-1999-00");
      request.setQuery("sessionLabel", "TEST-1999-00");
      request.sent.push("TEST-1999-00");
    },
  },
  {
    id: "query-unknown-param",
    kind: "query",
    describe: "a parameter no handler declares",
    why:
      "The control for every other query case. If this one changes the response, the handler "
      + "is reading something it never named and the corpus above is testing the wrong keys.",
    apply(request) {
      request.setQuery("scanFuzzUnknownParam", "1");
    },
  },
];

/* ── path: only where the route has a dynamic segment ────────────────────── */

const PATH_CASES = [
  {
    id: "path-uuid-nonexistent",
    kind: "path",
    describe: "a well-formed UUID that names no row",
    why:
      "The baseline every other path case is measured against. This one must be a 404 — and it "
      + "is the only path case where a 404 is unambiguously right.",
    apply(request) {
      return request.setSegments(NONEXISTENT_UUID);
    },
  },
  {
    id: "path-not-uuid",
    kind: "path",
    describe: "free text where a UUID belongs",
    why:
      "`lib/helpers/uuid.ts` exists because this reached Postgres and came back as "
      + "`invalid input syntax for type uuid` — a 500 for what is plainly a typo. "
      + "`negatives.ts` covers the pages; these are the handlers behind them.",
    apply(request) {
      return request.setSegments("not-a-uuid-at-all");
    },
  },
  {
    id: "path-numeric",
    kind: "path",
    describe: "a bare integer in a UUID segment",
    why:
      "The shape a stale bookmark from the pre-UUID era has, and the one Postgres is most "
      + "willing to try to cast before it fails.",
    apply(request) {
      return request.setSegments("9999999");
    },
  },
  {
    id: "path-traversal-encoded",
    kind: "path",
    describe: "%2e%2e%2f%2e%2e%2fetc%2fpasswd as the segment",
    why:
      "Encoded because a browser's URL parser collapses `..` before the request is sent — this "
      + "is precisely the case `negatives.ts` structurally cannot reach. Next.js should route "
      + "it as one opaque segment; anything that decodes it and joins it to a path should not.",
    apply(request) {
      return request.setSegments("%2e%2e%2f%2e%2e%2fetc%2fpasswd", { raw: true });
    },
  },
  {
    id: "path-sql-metachars",
    kind: "path",
    describe: "');-- as the segment",
    why: "The dynamic segment is the one user input that reaches a point lookup unfiltered.",
    apply(request) {
      return request.setSegments("');--");
    },
  },
  {
    id: "path-nul-byte",
    kind: "path",
    describe: "a percent-encoded NUL in the segment",
    why:
      "A NUL truncates in anything C-backed and is rejected outright by Postgres text. Which "
      + "of the two happens first tells you where the segment is being used.",
    apply(request) {
      return request.setSegments("abc%00def", { raw: true });
    },
  },
  {
    id: "path-overlong",
    kind: "path",
    describe: "a 2,000-character segment",
    why:
      "Long enough to exceed a proxy's URL limit and short enough to get through some of them, "
      + "which is where the two disagree and one of them 500s.",
    heavy: true,
    apply(request) {
      return request.setSegments("z".repeat(2000));
    },
  },
  {
    id: "path-unicode",
    kind: "path",
    describe: "RTL override, emoji and an astral character in the segment",
    why:
      "Segment decoding, route matching and the database each normalise Unicode differently, "
      + "and a 500 here means one of the three was not expecting the other two.",
    apply(request) {
      return request.setSegments(UNICODE_SOUP);
    },
  },
];

/* ── header and method ───────────────────────────────────────────────────── */

const HEADER_CASES = [
  {
    id: "header-accept-unsatisfiable",
    kind: "header",
    describe: "Accept: application/xml on a route that only produces JSON or XLSX",
    why:
      "Correct answers are 406 or ignoring it. A 500 means something is negotiating content "
      + "that was never negotiable.",
    apply(request) {
      request.headers.accept = "application/xml";
    },
  },
  {
    id: "header-accept-malformed",
    kind: "header",
    describe: "Accept: ;;;q=",
    why: "An unparseable Accept header, which the media-type parser sees before any handler does.",
    apply(request) {
      request.headers.accept = ";;;q=";
    },
  },
  {
    id: "header-content-type-on-bodyless-get",
    kind: "header",
    describe: "Content-Type: application/json on a GET with no body",
    why:
      "A declared body that does not exist. Any handler branching on the header rather than on "
      + "the bytes takes the parse path and finds nothing to parse.",
    apply(request) {
      request.headers["content-type"] = "application/json";
    },
  },
  {
    id: "header-oversized",
    kind: "header",
    describe: "an 8 KB custom request header",
    why:
      "Under Node's 16 KB limit on purpose: the point is to be accepted and carried, not to be "
      + "cut off at the socket, which would test the runtime rather than the app.",
    heavy: true,
    apply(request) {
      request.headers["x-scan-fuzz-padding"] = "p".repeat(8 * 1024);
    },
  },
  {
    id: "header-forwarded-spoof",
    kind: "header",
    describe: "spoofed X-Forwarded-For and X-Forwarded-Host",
    why:
      "Anything that builds an absolute URL from the forwarded host — a redirect, a receipt QR "
      + "target, an email link — can be pointed off-site by whoever sends the header.",
    apply(request) {
      request.headers["x-forwarded-for"] = "127.0.0.1, evil.example";
      request.headers["x-forwarded-host"] = "evil.example";
      request.sent.push("evil.example");
    },
  },
];

const METHOD_CASES = [
  {
    id: "method-trace",
    kind: "method",
    describe: "TRACE against a route that exports only GET",
    why:
      "TRACE is the method nobody implements and everybody forgets to refuse. 405 is the "
      + "answer; a 200 that echoes the request is a cross-site tracing primitive.",
    expectRejection: true,
    apply(request) {
      if (request.method !== "GET") return false;
      request.method = "TRACE";
    },
  },
  {
    id: "method-patch",
    kind: "method",
    describe: "PATCH against a route that exports only GET",
    why:
      "Next.js answers 405 for a verb the module does not export. If anything other than 405 "
      + "comes back, the dispatch is not doing what the route file says it does.",
    expectRejection: true,
    apply(request) {
      if (request.method !== "GET") return false;
      request.method = "PATCH";
    },
  },
  {
    id: "method-delete",
    kind: "method",
    describe: "DELETE against a route that exports only GET",
    why:
      "The one unsupported verb whose accidental implementation is unrecoverable. Worth its "
      + "own request even though PATCH covers the same dispatch.",
    expectRejection: true,
    apply(request) {
      if (request.method !== "GET") return false;
      request.method = "DELETE";
    },
  },
  {
    id: "method-put-with-body",
    kind: "method",
    describe: "PUT with a JSON body against a route that exports only GET",
    why:
      "The only way to attach a body to a read-only route without asking to fuzz writes. It "
      + "must be refused at dispatch, before any body is read.",
    expectRejection: true,
    apply(request) {
      if (request.method !== "GET") return false;
      request.method = "PUT";
      jsonBody(request, '{"amount":1,"studentId":"' + NONEXISTENT_UUID + '"}');
    },
  },
  {
    id: "method-options",
    kind: "method",
    describe: "OPTIONS",
    why:
      "Next auto-answers OPTIONS with an Allow header. Worth one request because that header is "
      + "the app telling you which verbs it thinks it has, which is checkable against the source.",
    apply(request) {
      if (request.method !== "GET") return false;
      request.method = "OPTIONS";
    },
  },
  {
    id: "method-head",
    kind: "method",
    describe: "HEAD against a GET route",
    why:
      "HEAD is derived from GET, so the handler runs in full and the body is discarded. A "
      + "handler that streams, or that sets Content-Length by hand, disagrees with itself here.",
    apply(request) {
      if (request.method !== "GET") return false;
      request.method = "HEAD";
    },
  },
];

/**
 * The corpus, in the order it is applied.
 *
 * Body cases first so that a run trimmed by its wall-clock budget loses the
 * cheap-and-plentiful query cases rather than the expensive-and-rare body ones.
 */
export const CORPUS = Object.freeze([
  ...BODY_CASES,
  ...PATH_CASES,
  ...METHOD_CASES,
  ...HEADER_CASES,
  ...QUERY_CASES,
].map((entry) => Object.freeze({ expectRejection: false, heavy: false, ...entry })));

export const CORPUS_BY_KIND = Object.freeze(
  CORPUS.reduce((byKind, entry) => {
    (byKind[entry.kind] ??= []).push(entry);
    return byKind;
  }, {}),
);

/** The benign request every target is measured against. Not a payload. */
export const BASELINE = Object.freeze({
  id: "baseline",
  kind: "baseline",
  describe: "the request as written: declared parameters, valid session, no payload",
  why:
    "Nothing is a finding on its own. A 404 only means \"404 where 403 belongs\" if the same "
    + "request authenticated returns 200, and a 9-second response is only slow relative to what "
    + "this route costs when nothing is wrong.",
  expectRejection: false,
  heavy: false,
  apply() {},
});
