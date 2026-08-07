/**
 * Tells the browser that a download has actually started.
 *
 * Export routes generate XLSX and printable HTML on demand and can legitimately
 * take tens of seconds (they declare `maxDuration = 60`). Because a download is
 * a plain navigation to an attachment response, the page never changes, so
 * clicking one produced no UI change whatsoever — and staff, reasonably,
 * clicked again. And again.
 *
 * There is no client event for "an attachment response arrived": `<a download>`
 * fires nothing, and an iframe's `onload` does not fire for an attachment. So
 * the client puts a nonce on the URL and the server echoes it straight back as
 * a short-lived cookie. The client polls for that cookie and clears its spinner
 * the moment the response reaches the browser.
 *
 * Why not fetch + blob: it would work, but it discards the native download
 * shelf, breaks the `target="_blank"` printable-HTML flow, buffers an entire
 * workbook in tab memory, and loses the file if the tab closes mid-request.
 */

import {
  DOWNLOAD_TOKEN_COOKIE,
  DOWNLOAD_TOKEN_PARAM,
} from "@/lib/helpers/download-token-shared";

export { DOWNLOAD_TOKEN_COOKIE, DOWNLOAD_TOKEN_PARAM };

/** Long enough for the client's 250ms poll to see it, short enough to vanish. */
const TOKEN_MAX_AGE_SECONDS = 30;

/** Nonces are opaque ids; reject anything else rather than reflect it. */
const SAFE_TOKEN = /^[A-Za-z0-9_-]{8,64}$/;

export function readDownloadToken(url: string | URL): string | null {
  const parsed = typeof url === "string" ? new URL(url) : url;
  const token = parsed.searchParams.get(DOWNLOAD_TOKEN_PARAM);

  return token && SAFE_TOKEN.test(token) ? token : null;
}

/**
 * Adds the echo cookie to a download response.
 *
 * `SameSite=Lax` is required, not incidental: a download is a top-level
 * navigation, and `Strict` would drop the cookie on the `target="_blank"` PDF
 * route — exactly the slowest download in the app.
 */
export function withDownloadToken(request: Request, response: Response): Response {
  const token = readDownloadToken(request.url);

  if (!token) {
    return response;
  }

  response.headers.append(
    "set-cookie",
    `${DOWNLOAD_TOKEN_COOKIE}=${token}; Path=/; Max-Age=${TOKEN_MAX_AGE_SECONDS}; SameSite=Lax`,
  );

  return response;
}

/**
 * Strips the nonce from a URL before it is logged or recorded as activity.
 * It is not a secret, but it has no business in an audit trail.
 */
export function stripDownloadToken(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete(DOWNLOAD_TOKEN_PARAM);
    return parsed.toString();
  } catch {
    return url;
  }
}
