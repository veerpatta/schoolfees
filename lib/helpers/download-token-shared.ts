/**
 * The two names the client and the server have to agree on, and nothing else.
 *
 * Split out from download-token.ts so `DownloadAnchor` — a client component
 * rendered on eight routes — does not drag the server-side request/response
 * helpers into the browser bundle just to read two string constants.
 */

/** Query parameter carrying the client's nonce. */
export const DOWNLOAD_TOKEN_PARAM = "dl";

/** Cookie the server echoes it back in. Read by JS, so NOT HttpOnly. */
export const DOWNLOAD_TOKEN_COOKIE = "vpps-dl";
