import "server-only";

import {
  isTestAcademicSessionLabel,
  parseAcademicSessionLabel,
} from "@/lib/config/fee-rules";
import { getFeePolicySummary } from "@/lib/fees/data";

export type ResolvedViewSession = {
  sessionLabel: string;
  source: "url" | "cookie" | "policy";
  isTest: boolean;
};

function normalizeValidSessionLabel(value: string | null | undefined) {
  const label = (value ?? "").trim();

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
  return {
    sessionLabel,
    source,
    isTest: isTestAcademicSessionLabel(sessionLabel),
  };
}

export async function resolveViewSession({
  searchParamSession,
  cookieSession,
}: {
  searchParamSession?: string | null;
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

  const policy = await getFeePolicySummary();
  const policySession =
    normalizeValidSessionLabel(policy.academicSessionLabel) ?? policy.academicSessionLabel;

  return buildResolvedSession(policySession, "policy");
}
