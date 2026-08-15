import "server-only";

import {
  isTestAcademicSessionLabel,
  parseAcademicSessionLabel,
} from "@/lib/config/fee-rules";
import { getActiveSessionLabel } from "@/lib/session/active";

export type ResolvedViewSession = {
  sessionLabel: string;
  source: "url" | "cookie" | "default";
  isTest: boolean;
  isProduction: boolean;
  isEditable: boolean;
  isCollectable: boolean;
};

function toScalar(
  value: string | string[] | null | undefined,
): string | null | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeValidSessionLabel(
  value: string | string[] | null | undefined,
) {
  const label = (toScalar(value) ?? "").trim();

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
