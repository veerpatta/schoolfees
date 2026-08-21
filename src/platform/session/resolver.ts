import "server-only";

import {
  isTestAcademicSessionLabel,
  parseAcademicSessionLabel,
} from "@/platform/config/fee-rules";
import { getActiveSessionLabel } from "@/platform/session/active";

export type ResolvedViewSession = {
  sessionLabel: string;
  source: "url" | "cookie" | "default";
  isTest: boolean;
  isProduction: boolean;
  isEditable: boolean;
  isCollectable: boolean;
};

/**
 * A search param is `string | string[]`, and this used to assume `string`.
 *
 * `?session=A&session=B` — or the same value twice, which is what a re-shared
 * link produces — makes Next hand the page an array, and `(value ?? "").trim()`
 * threw `trim is not a function` straight out of a Server Component. In
 * production that renders as a blank error page with the message redacted, so
 * the Dashboard and Transactions both went down for a URL shape a staff member
 * can produce by copying a link twice (SCHOOLFEES-D, SCHOOLFEES-F).
 *
 * Taking the first value matches every other switcher in the app —
 * `resolveDashboardView` and `resolveOfficeWorkbookView` both read `value[0]`.
 * Fixed here rather than at the 25 call sites so a new page cannot reintroduce
 * it by forgetting to unwrap.
 */
function firstValue(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) return value.length > 0 ? (value[0] ?? null) : null;
  return value ?? null;
}

function normalizeValidSessionLabel(value: string | string[] | null | undefined) {
  const label = (firstValue(value) ?? "").trim();

  if (!label) {
    return null;
  }

  try {
    return parseAcademicSessionLabel(label).normalizedLabel;
  } catch {
    return null;
  }
}

function buildResolvedSession(
  sessionLabel: string,
  source: ResolvedViewSession["source"],
): ResolvedViewSession {
  const isTest = isTestAcademicSessionLabel(sessionLabel);

  return {
    sessionLabel,
    source,
    isTest,
    isProduction: !isTest,
    isEditable: true,
    isCollectable: true,
  };
}

export async function resolveViewSession({
  searchParamSession,
  cookieSession,
}: {
  /** Accepts the raw search param, array form included — see firstValue above. */
  searchParamSession?: string | string[] | null;
  cookieSession?: string | null;
}): Promise<ResolvedViewSession> {
  const urlSession = normalizeValidSessionLabel(searchParamSession);

  if (urlSession) {
    return buildResolvedSession(urlSession, "url");
  }

  const storedSession = normalizeValidSessionLabel(cookieSession);

  if (storedSession) {
    return buildResolvedSession(storedSession, "cookie");
  }

  const activeSessionLabel = await getActiveSessionLabel();
  const policySession =
    normalizeValidSessionLabel(activeSessionLabel) ?? activeSessionLabel;

  return buildResolvedSession(policySession, "default");
}
