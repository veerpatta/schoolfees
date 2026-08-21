/**
 * Validate a `?returnTo=` before a page renders it as a link.
 *
 * A detail screen is reached from several places — the Students list, a
 * Transactions table, a dashboard card — so its Back link has to be told where
 * back is. That value arrives in the query string, which means it arrives from
 * outside and cannot be trusted: an unchecked `returnTo` is an open redirect
 * wearing a Back button.
 *
 * Three guards used to do this inline, and each hardcoded a single parent —
 * the student page accepted only `/protected/students`, the receipt page only
 * `/protected/transactions`. So opening a child from a filtered Transactions
 * view failed the check and fell back to a bare, unfiltered list: the filter
 * survived the outbound hop and was thrown away on the way back.
 *
 * The rule that actually matters is narrower than "starts with the parent I
 * expect" and wider than any one route: it has to be a path inside this
 * workspace.
 */

const WORKSPACE_PREFIX = "/protected/";

export function safeReturnTo(raw: string | undefined | null, fallback: string): string {
  if (!raw) return fallback;

  // `//evil.example` is protocol-relative: browsers read it as another origin,
  // and it starts with a slash, so a naive prefix check waves it through.
  if (raw.startsWith("//")) return fallback;

  // Any scheme at all — http:, javascript:, data: — is off-site by definition.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;

  // A backslash is not a path separator in a URL, but Windows-flavoured
  // normalisation in some clients turns `/\evil.example` into `//evil.example`.
  if (raw.includes("\\")) return fallback;

  return raw.startsWith(WORKSPACE_PREFIX) ? raw : fallback;
}
