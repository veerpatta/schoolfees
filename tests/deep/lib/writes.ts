import { createHash } from "node:crypto";

import type { BrowserContext, Page } from "@playwright/test";

import type { DiscoveredStudent } from "./discovery";
import { LIVE_SESSION, TEST_SESSION, WRITE_ALLOWED_HOSTS } from "./identity";

/**
 * Four locks before anything is written.
 *
 * Three of them are obvious. The fourth is the one that was missing, and it is
 * the reason this module exists rather than an inline `startsWith("TEST-")`:
 *
 * `src/app/protected/layout.tsx` resolves the active session from the **cookie
 * only** — App Router layouts get no `searchParams` — while the page itself
 * resolves `?session=` first. So a browser whose cookie says `2026-27` renders
 * a TEST page inside live chrome, and the desk's own `data.sessionLabel` comes
 * from the page. The old smoke suite posted on exactly that arrangement and
 * called the query string proof.
 *
 * The fix is to make the cookie agree *before* the write, then read it back
 * from the context rather than trusting what we asked for.
 */

export class WriteRefused extends Error {
  constructor(readonly lock: string, message: string) {
    super(message);
    this.name = "WriteRefused";
  }
}

export const VIEW_SESSION_COOKIE = "vpps_view_session";

export type WriteContext = {
  page: Page;
  context: BrowserContext;
  subject: DiscoveredStudent;
  baseURL: string;
};

/**
 * Pin the view session in the cookie so the layout and the page agree.
 *
 * Set through `context.addCookies` rather than by clicking the switcher pill:
 * the pill writes the cookie via a Server Action and then navigates, and a
 * write suite that depends on that sequence is testing the switcher, not the
 * desk. The switcher has its own coverage in spec 02.
 */
export async function pinSessionCookie(
  context: BrowserContext,
  baseURL: string,
  session: string = TEST_SESSION,
): Promise<void> {
  const url = new URL(baseURL);
  await context.addCookies([
    {
      name: VIEW_SESSION_COOKIE,
      value: session,
      domain: url.hostname,
      path: "/",
      httpOnly: false,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}

export async function readSessionCookie(
  context: BrowserContext,
): Promise<string | null> {
  const cookies = await context.cookies();
  return cookies.find((cookie) => cookie.name === VIEW_SESSION_COOKIE)?.value ?? null;
}

export async function assertWritable(ctx: WriteContext): Promise<void> {
  // 1. The subject. Mirrors the `TEST-` shape `src/modules/students/domain/delete-policy.ts`
  //    uses, so the harness and the app agree on what a test student is.
  const admissionNo = ctx.subject.admissionNo?.toUpperCase() ?? "";
  if (!admissionNo.startsWith("TEST-")) {
    throw new WriteRefused(
      "admission-number",
      `Refusing to write against "${ctx.subject.admissionNo}" — not a TEST- student.`,
    );
  }

  // 2. The host. A base URL outside the allowlist means the harness is pointed
  //    at a deployment nobody planned for.
  const host = new URL(ctx.baseURL).host;
  if (!WRITE_ALLOWED_HOSTS.has(host)) {
    throw new WriteRefused("host", `Refusing to write against host "${host}".`);
  }

  // 3. The cookie the LAYOUT will read.
  const cookieSession = await readSessionCookie(ctx.context);
  if (cookieSession !== TEST_SESSION) {
    throw new WriteRefused(
      "cookie-session",
      `The ${VIEW_SESSION_COOKIE} cookie says "${cookieSession ?? "(unset)"}", not ${TEST_SESSION}. ` +
        "The layout resolves from the cookie, so a write here could land in the wrong ledger.",
    );
  }

  // 4. What the PAGE actually rendered. `body[data-vpps-test-session]` is set by
  //    the session pill, which is a client component — so the attribute appears
  //    during hydration, not in the server HTML. Sampling it right after
  //    `networkidle` refused every write on a page that was about to be
  //    perfectly fine. Waiting is correct; assuming is not, in either direction.
  // 30s, not 10: on `next dev` the Payment Desk compiles on first request and
  // its client bundle is the largest in the app, so the pill can hydrate well
  // after `networkidle`. On a real build it is set within a second. The long
  // wait costs nothing when the attribute is already there.
  await ctx.page
    .waitForFunction(() => document.body?.dataset?.vppsTestSession === "true", null, {
      timeout: 30_000,
    })
    .catch(() => null);

  const rendered = await ctx.page.evaluate(() => ({
    isTest: document.body?.dataset?.vppsTestSession === "true",
    text: (document.body?.innerText ?? "").slice(0, 4000),
  }));

  if (!rendered.isTest) {
    throw new WriteRefused(
      "rendered-session",
      "The page is not rendering a test session (body[data-vpps-test-session] is unset).",
    );
  }

  const mentionsLive = new RegExp(`(?<!TEST-|UAT-|DEMO-)\\b${LIVE_SESSION}\\b`).test(
    rendered.text,
  );
  if (mentionsLive) {
    throw new WriteRefused(
      "live-session-visible",
      `The rendered page mentions the live session ${LIVE_SESSION}. Refusing to write.`,
    );
  }
}

/**
 * A deterministic idempotency key.
 *
 * The posting RPC dedupes on `p_client_request_id`, so the same run replaying
 * the same case must produce the same UUID — that is what makes
 * `post-idempotent-retry` a real assertion rather than a second receipt. A new
 * run produces a new key, which is intended: a fresh run is a fresh payment.
 */
export function clientRequestIdFor(runId: string, caseId: string): string {
  const hash = createHash("sha1").update(`${runId}:${caseId}`).digest("hex");
  // Shape it as a v5-looking UUID; the RPC only requires uniqueness and a uuid cast.
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

/** The marker every free-text row this harness creates carries. */
export function deepTestMarker(runId: string, caseId: string): string {
  return `DEEPTEST ${runId} ${caseId}`;
}

/** `TEST-DEEP-<runId>-<n>` — deterministic, unique per run, and obviously ours. */
export function deepTestAdmissionNo(runId: string, index: number): string {
  return `TEST-DEEP-${runId}-${index}`;
}
