/**
 * The only place this server talks to Postgres.
 *
 * Two rules earn their keep here:
 *
 * 1. **Nothing is silently truncated.** PostgREST caps a response and says
 *    nothing about it, which is how a 5,000-row select quietly becomes a wrong
 *    total. `selectAll` pages until the source is exhausted and reports when it
 *    stopped early, so a caller can put `truncated: true` in front of the model
 *    instead of handing it a short answer that looks complete.
 * 2. **A failed read is never an empty read.** Callers that can degrade say so
 *    explicitly via `tolerate()`, which records the reason. Everything else
 *    throws.
 */

/** Hard ceiling for one logical read. Above this the payload stops being useful. */
export const MAX_ROWS = 20_000;
const PAGE_SIZE = 1000;

function required(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required Worker secret: ${name}`);
  }
  return value;
}

export function getSupabaseSchema(env) {
  return env.SCHOOLFEES_MCP_SUPABASE_SCHEMA || "public";
}

function restBase(env) {
  return `${required(env, "NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "")}/rest/v1`;
}

function authHeaders(env) {
  const key = required(env, "SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, authorization: `Bearer ${key}` };
}

/**
 * PostgREST filter params. Values are `column: "operator.value"` pairs, plus an
 * optional `or` string for disjunctions — that is how the collectable student
 * scope (`active OR has paid`) is expressed over REST.
 */
function applyParams(url, params) {
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(name, String(value));
  }
}

/** One page. Returns rows plus the total row count when `count` was requested. */
export async function select(env, table, params = {}, { count = false } = {}) {
  const url = new URL(`${restBase(env)}/${table}`);
  applyParams(url, params);

  const response = await fetch(url, {
    headers: {
      ...authHeaders(env),
      "accept-profile": getSupabaseSchema(env),
      ...(count ? { prefer: "count=exact" } : {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${table} read failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const rows = await response.json();

  if (!count) return { rows, totalCount: null };

  // content-range looks like "0-24/531"; the tail is the exact count.
  const range = response.headers.get("content-range") || "";
  const total = Number(range.split("/")[1]);
  return { rows, totalCount: Number.isFinite(total) ? total : null };
}

/**
 * Every row, paged. `limit` in `params` is honoured as a caller-imposed cap and
 * paging stops there; without one it reads to `MAX_ROWS` and reports truncation.
 *
 * A caller-supplied `offset` is the starting point, not a suggestion. It used to
 * be overwritten by the page cursor, which silently restarted every read at row
 * 0 — that is why paging through `search_students` with a cursor returned the
 * first page forever while still advertising a next one.
 *
 * Truncation comes from an exact count on the first page rather than a probe
 * request after the last. The probe cost one extra round trip on every read that
 * reached its cap, including the nine single-row lookups that pass `limit: 1`
 * and can never be truncated in any sense the caller cares about.
 */
export async function selectAll(env, table, params = {}) {
  const cap = Math.min(Number(params.limit) || MAX_ROWS, MAX_ROWS);
  // `limit` becomes the cap on the whole read; each page carries its own.
  const rest = { ...params };
  delete rest.limit;
  const baseOffset = Number(rest.offset) || 0;
  delete rest.offset;

  const rows = [];
  let totalCount = null;

  while (rows.length < cap) {
    const pageSize = Math.min(PAGE_SIZE, cap - rows.length);
    const wantCount = rows.length === 0;
    const { rows: page, totalCount: counted } = await select(
      env,
      table,
      { ...rest, limit: pageSize, offset: baseOffset + rows.length },
      { count: wantCount },
    );
    if (wantCount) totalCount = counted;
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  // With an exact count the answer is arithmetic. Without one (the header can be
  // absent on some views) fall back to "a full cap means there may be more",
  // which errs towards warning rather than towards a short answer that looks
  // complete.
  const truncated =
    totalCount === null ? rows.length >= cap : baseOffset + rows.length < totalCount;

  return { rows, truncated, totalCount };
}

export async function rpc(env, functionName, args = {}) {
  const response = await fetch(`${restBase(env)}/rpc/${functionName}`, {
    method: "POST",
    headers: {
      ...authHeaders(env),
      "content-profile": getSupabaseSchema(env),
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Supabase ${functionName} RPC failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }

  return response.json();
}

/**
 * Collects the reads that were allowed to fail, so a payload can admit what is
 * missing. The old server logged a warning and returned an empty Map, which
 * turned every promise-due row and every no-call suppression off invisibly.
 */
export function createDegradationLog() {
  const entries = [];
  return {
    /** Runs `read`, and on failure records why and falls back. */
    async tolerate(source, read, fallback) {
      try {
        return await read();
      } catch (error) {
        entries.push({ source, reason: String(error?.message || error).slice(0, 300) });
        return fallback;
      }
    },
    /** Empty array means nothing degraded — safe to include unconditionally. */
    entries,
  };
}

/** `in.(a,b,c)` has a URL-length limit, so id lists are chunked by the caller. */
export function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
