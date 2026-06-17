import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { RolePreview } from "@/components/admin/role-preview";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { schoolProfile } from "@/lib/config/school";
import { formatDateTimeIst } from "@/lib/helpers/date";
import { getRecentConfigChangeLog } from "@/lib/fees/change-log";
import { getFeePolicyForSession } from "@/lib/fees/data";
import {
  getRuntimeEnvironmentLabel,
  getOptionalEnvVar,
  getSiteUrl,
  hasExplicitSiteUrl,
  hasRequiredEnvVars,
  isConfiguredSiteUrlSecure,
  isVercelProductionEnvironment,
} from "@/lib/env";
import { requireStaffPermission } from "@/lib/supabase/session";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { appendSessionParam } from "@/lib/navigation/session-href";

function toneForStatus(isHealthy: boolean) {
  return isHealthy ? "good" : "warning";
}

function toneForBatchStatus(status: string) {
  if (status === "applied") {
    return "good";
  }

  if (status === "preview_ready") {
    return "accent";
  }

  return "warning";
}

function formatDateTime(value: string | null) {
  return formatDateTimeIst(value, "Not applied");
}

type SettingsPageProps = {
  searchParams?: Promise<{
    session?: string | string[];
  }>;
};

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[value.length - 1] ?? "";
  return value ?? "";
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const staff = await requireStaffPermission("settings:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: asString(resolvedSearchParams?.session),
    cookieSession: await getViewSessionCookie(),
  });

  const [policy, recentConfigChanges] = await Promise.all([
    getFeePolicyForSession(viewSession.sessionLabel),
    getRecentConfigChangeLog(),
  ]);
  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);
  const serviceRoleConfigured = Boolean(getOptionalEnvVar("SUPABASE_SERVICE_ROLE_KEY"));
  const deploymentEnvironment = getRuntimeEnvironmentLabel();
  const resolvedSiteUrl = getSiteUrl();
  const explicitSiteUrlConfigured = hasExplicitSiteUrl();
  const productionEnvironment = isVercelProductionEnvironment();

  const identityRows = [
    { label: "School name", value: schoolProfile.name },
    { label: "Address", value: schoolProfile.address || "Not set" },
    { label: "Phone", value: schoolProfile.phone || "Not set" },
    { label: "Email", value: schoolProfile.email || "Not set" },
    { label: "Receipt prefix", value: policy.receiptPrefix },
  ] as const;

  const policyRows = [
    { label: "Academic session", value: policy.academicSessionLabel },
    { label: "Late fee", value: `Rs ${policy.lateFeeFlatAmount}` },
    {
      label: "Installment due dates",
      value: policy.installmentSchedule.map((item) => item.dueDateLabel).join(", "),
    },
    {
      label: "Payment modes",
      value: policy.acceptedPaymentModes.map((item) => item.label).join(", "),
    },
  ] as const;

  const readinessChecks = [
    {
      label: "Supabase public env vars",
      value: hasRequiredEnvVars ? "Configured" : "Missing",
      detail:
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set in every environment.",
      healthy: hasRequiredEnvVars,
    },
    {
      label: "Explicit site URL",
      value: explicitSiteUrlConfigured ? resolvedSiteUrl : "Fallback only",
      detail:
        "Set NEXT_PUBLIC_SITE_URL explicitly so auth emails and metadata use the correct production domain.",
      healthy: explicitSiteUrlConfigured,
    },
    {
      label: "Production HTTPS URL",
      value: productionEnvironment && !isConfiguredSiteUrlSecure() ? "Needs HTTPS" : "OK",
      detail:
        "Production should use an HTTPS NEXT_PUBLIC_SITE_URL, not a localhost or protocol-less fallback.",
      healthy:
        !productionEnvironment || (explicitSiteUrlConfigured && isConfiguredSiteUrlSecure()),
    },
    {
      label: "Public sign-up path",
      value: "Disabled",
      detail:
        "Initial account provisioning should happen through the server-only bootstrap script, not a public signup page.",
      healthy: true,
    },
    {
      label: "Service role key",
      value: serviceRoleConfigured ? "Configured" : "Not set",
      detail:
        "SUPABASE_SERVICE_ROLE_KEY must stay server-only and is required for bootstrap provisioning, admin staff creation, and staff password resets.",
      healthy: serviceRoleConfigured,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="School settings"
        description="One place to see how the school is configured. Edit fee policy in Fee Setup and school lists in Master Data — this page links you straight there."
        actions={
          <StatusBadge
            label={staff.appRole === "admin" ? "Admin access" : "Read-only access"}
            tone={staff.appRole === "admin" ? "good" : "warning"}
          />
        }
      />

      <SectionCard
        title="School identity"
        description="Shown on receipts and statements. Set via deployment configuration so printed documents stay stable across the year."
      >
        <ul className="grid gap-3 md:grid-cols-2">
          {identityRows.map((row) => (
            <li
              key={row.label}
              className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {row.label}
              </span>
              <p className="mt-1 break-words font-medium text-foreground">{row.value}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          The receipt prefix is part of the active fee policy and can be changed in Fee Setup.
        </p>
      </SectionCard>

      <SectionCard
        title="Fee policy"
        description="The active academic-year policy. Edit these in Fee Setup so preview, publish, and audit logging stay attached."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={withSession("/protected/fee-setup")}>Edit in Fee Setup</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={withSession("/protected/master-data")}>School lists</Link>
            </Button>
          </div>
        }
      >
        <ul className="grid gap-3 md:grid-cols-2">
          {policyRows.map((row) => (
            <li
              key={row.label}
              className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {row.label}
              </span>
              <p className="mt-1 break-words font-medium text-foreground">{row.value}</p>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Recent Fee Setup changes"
        description="Changes made through Fee Setup are recorded here with saved results and any rows that were held for manual review."
      >
        {recentConfigChanges.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-sm text-muted-foreground">
            No recent Fee Setup changes are recorded yet. Initial setup writes are still captured by
            table-level audit logs.
          </div>
        ) : (
          <div className="space-y-3">
            {recentConfigChanges.map((batch) => (
              <div
                key={batch.id}
                className="rounded-xl border border-border bg-surface-2 px-4 py-4 text-sm text-foreground"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {batch.scopeLabel}: {batch.targetLabel}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {formatDateTime(batch.createdAt)}
                      {batch.createdByName ? ` by ${batch.createdByName}` : ""}. Applied{" "}
                      {formatDateTime(batch.appliedAt)}.
                    </p>
                  </div>
                  <StatusBadge label={batch.statusLabel} tone={toneForBatchStatus(batch.status)} />
                </div>

                <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
                  Changed fields
                </p>
                <p className="mt-1">
                  {batch.changedFieldLabels.length > 0
                    ? batch.changedFieldLabels.join(", ")
                    : "Field-level summary not available"}
                </p>

                {batch.summary ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                      Students affected: <strong>{batch.summary.studentsAffected}</strong>
                    </div>
                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                      Inserts: <strong>{batch.summary.installmentsToInsert}</strong>
                    </div>
                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                      Updates: <strong>{batch.summary.installmentsToUpdate}</strong>
                    </div>
                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                      Cancels: <strong>{batch.summary.installmentsToCancel}</strong>
                    </div>
                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                      Rows kept for review: <strong>{batch.blockedInstallmentCount}</strong>
                    </div>
                  </div>
                ) : null}

                {batch.applyNotes ? (
                  <p className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground">
                    {batch.applyNotes}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <details className="group rounded-2xl border border-border bg-card">
        <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-semibold text-foreground">
          <span>System &amp; deployment health (advanced)</span>
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
          <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">
            Hide
          </span>
        </summary>
        <div className="space-y-5 border-t border-border px-5 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
              School: {schoolProfile.name} · Mode: {schoolProfile.appMode} · Audience:{" "}
              {schoolProfile.staffAudience}
            </div>
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
              Runtime: {deploymentEnvironment} · Site URL: {resolvedSiteUrl}
            </div>
          </div>

          <ul className="space-y-3 text-sm leading-6 text-foreground">
            {readinessChecks.map((check) => (
              <li key={check.label} className="rounded-xl border border-border bg-surface-2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{check.label}</span>
                  <StatusBadge label={check.value} tone={toneForStatus(check.healthy)} />
                </div>
                <p className="mt-2 text-muted-foreground">{check.detail}</p>
              </li>
            ))}
          </ul>

          <RolePreview title="Role model" description="Unknown or missing roles resolve to the least-privileged role." />
        </div>
      </details>
    </div>
  );
}
