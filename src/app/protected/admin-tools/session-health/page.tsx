import { MobileDesktopOnlyNotice } from "@/ui/mobile/mobile-kit";
import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/ui/shell/page-header";
import { OfficeNotice } from "@/ui/office/office-ui";
import { Button } from "@/ui/primitives/button";
import { LoadingBlock } from "@/ui/primitives/loading-skeleton";
import { requireStaffPermission } from "@/platform/supabase/session";
import { getViewSessionCookie } from "@/platform/session/cookie";
import { resolveViewSession } from "@/platform/session/resolver";
import { appendSessionParam } from "@/platform/navigation/session-href";

import { SessionHealthGrid } from "./session-health-grid";

type SessionHealthPageProps = {
  searchParams?: Promise<{
    reconciled?: string;
    prepared?: string;
    error?: string;
    session?: string;
  }>;
};

function SessionHealthGridFallback() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <LoadingBlock key={index} lines={6} />
      ))}
    </div>
  );
}

export default async function SessionHealthPage({ searchParams }: SessionHealthPageProps) {
  const t = await getTranslations("AdminTools");
  await requireStaffPermission("fees:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session,
    cookieSession: await getViewSessionCookie(),
  });
  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("sessionHealthTitle")}
        description={t("sessionHealthDescription")}
        actions={
          <Button asChild variant="outline">
            <Link href={withSession("/protected/admin-tools")}>{t("sessionHealthBackToAdmin")}</Link>
          </Button>
        }
      />
      <MobileDesktopOnlyNotice
        title="Session health"
        reason="Reconciling a session reads long diagnostic tables. Open this on a computer."
      />


      {resolvedSearchParams?.reconciled ? (
        <OfficeNotice title={t("sessionHealthReconcileTitle")} tone="success">
          {t("sessionHealthReconcileBody", {
            count: resolvedSearchParams.reconciled,
            prepared: resolvedSearchParams.prepared ?? "0",
          })}
        </OfficeNotice>
      ) : null}

      {resolvedSearchParams?.error ? (
        <OfficeNotice title={t("sessionHealthReconcileErrTitle")} tone="danger">
          {resolvedSearchParams.session ? `${resolvedSearchParams.session}: ` : ""}
          {resolvedSearchParams.error}
        </OfficeNotice>
      ) : null}

      <Suspense fallback={<SessionHealthGridFallback />}>
        <SessionHealthGrid t={t} />
      </Suspense>
    </div>
  );
}
