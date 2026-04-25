import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { RolePreview } from "@/components/admin/role-preview";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { schoolProfile } from "@/lib/config/school";
import { getRecentConfigChangeLog } from "@/lib/fees/change-log";
import { getFeePolicySummary } from "@/lib/fees/data";
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
  if (!value) {
    return "Not applied";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function SettingsPage() {
  const staff = await requireStaffPermission("settings:view", { onDenied: "redirect" });
  const [policy, recentConfigChanges] = await Promise.all([
    getFeePolicySummary(),
    getRecentConfigChangeLog(),
  ]);
  const serviceRoleConfigured = Boolean(
    getOptionalEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const deploymentEnvironment = getRuntimeEnvironmentLabel();
  const resolvedSiteUrl = getSiteUrl();
  const explicitSiteUrlConfigured = hasExplicitSiteUrl();
  const productionEnvironment = isVercelProductionEnvironment();
  const policyNotes = [
    `Academic session is ${policy.academicSessionLabel}.`,
    `Receipt prefix is ${policy.receiptPrefix}.`,
    `Late fee default is Rs ${policy.lateFeeFlatAmount}.`,
    `Installment due dates are ${policy.installmentSchedule.map((item) => item.dueDateLabel).join(", ")}.`,
    `Accepted payment modes are ${policy.acceptedPaymentModes.map((item) => item.label).join(", ")}.`,
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
      value:
        productionEnvironment && !isConfiguredSiteUrlSecure()
          ? "Needs HTTPS"
          : "OK",
      detail:
        "Production should use an HTTPS NEXT_PUBLIC_SITE_URL, not a localhost or protocol-less fallback.",
      healthy:
        !productionEnvironment ||
        (explicitSiteUrlConfigured && isConfiguredSiteUrlSecure()),
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
        title="System checks and policy notes"
        description="Use this page to confirm the internal admin app is configured safely and still matches the active school policy."
        actions={
          <StatusBadge
            label={staff.appRole === "admin" ? "Admin access" : "Read-only access"}
            tone={staff.appRole === "admin" ? "good" : "warning"}
          />
        }
      />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          This page is restricted to roles with settings access. It shows deployment readiness and active policy notes only.
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Current defaults stay aligned to the canonical school policy: session {policy.academicSessionLabel}, late fee Rs {policy.lateFeeFlatAmount}, due dates {policy.installmentSchedule.map((item) => item.dueDateLabel).join(", ")}.
        </div>
      </section>

      <SectionCard
        title="Before Real Data"
        description="Use dummy data first, then confirm the real AY 2026-27 setup before production entry."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/protected/fee-setup">Fee Setup</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/protected/students">Students</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/protected/imports">Student Imports</Link>
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Use TEST-2026-27 for trial runs. Do not post test payments against real students.
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
            Fee Setup owns school-wide defaults. Students owns student-specific records and
            overrides.
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
            Manual UAT docs: <code>docs/uat-test-plan.md</code>,{" "}
            <code>docs/test-data-setup.md</code>, and{" "}
            <code>docs/before-real-data-checklist.md</code>.
          </div>
        </div>
      </SectionCard>

      <section className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Deployment profile"
          description="These values define how the app should behave in production."
        >
          <ul className="space-y-3 text-sm leading-6 text-slate-700">
            <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              School: {schoolProfile.name}
            </li>
            <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              Mode: {schoolProfile.appMode}
            </li>
            <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              Audience: {schoolProfile.staffAudience}
            </li>
            <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              Runtime environment: {deploymentEnvironment}
            </li>
            <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              Resolved site URL: {resolvedSiteUrl}
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          title="Deployment checks"
          description="These checks are based on the current environment variables only. Secret values are never shown."
        >
          <ul className="space-y-3 text-sm leading-6 text-slate-700">
            {readinessChecks.map((check) => (
              <li
                key={check.label}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-950">
                    {check.label}
                  </span>
                  <StatusBadge
                    label={check.value}
                    tone={toneForStatus(check.healthy)}
                  />
                </div>
                <p className="mt-2 text-slate-600">{check.detail}</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>

      <SectionCard
        title="Role model"
        description="Unknown or missing role mappings still resolve to the least-privileged role instead of admin."
      >
        <RolePreview title={null} description={null} />
      </SectionCard>

      <SectionCard
        title="Current policy notes"
        description="This shell should stay aligned with the active school defaults."
      >
        <ul className="space-y-3 text-sm leading-6 text-slate-700">
          {policyNotes.map((note) => (
            <li
              key={note}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              {note}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Recent Fee Setup changes"
        description="Changes made through Fee Setup are recorded here with saved results and any rows that were held for manual review."
      >
        {recentConfigChanges.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            No recent Fee Setup changes are recorded yet. Initial setup writes are still captured by
            table-level audit logs.
          </div>
        ) : (
          <div className="space-y-3">
            {recentConfigChanges.map((batch) => (
              <div
                key={batch.id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">
                      {batch.scopeLabel}: {batch.targetLabel}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Created {formatDateTime(batch.createdAt)}
                      {batch.createdByName ? ` by ${batch.createdByName}` : ""}. Applied{" "}
                      {formatDateTime(batch.appliedAt)}.
                    </p>
                  </div>
                  <StatusBadge label={batch.statusLabel} tone={toneForBatchStatus(batch.status)} />
                </div>

                <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
                  Changed fields
                </p>
                <p className="mt-1">
                  {batch.changedFieldLabels.length > 0
                    ? batch.changedFieldLabels.join(", ")
                    : "Field-level summary not available"}
                </p>

                {batch.summary ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      Students affected: <strong>{batch.summary.studentsAffected}</strong>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      Inserts: <strong>{batch.summary.installmentsToInsert}</strong>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      Updates: <strong>{batch.summary.installmentsToUpdate}</strong>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      Cancels: <strong>{batch.summary.installmentsToCancel}</strong>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  Rows kept for review: <strong>{batch.blockedInstallmentCount}</strong>
                    </div>
                  </div>
                ) : null}

                {batch.applyNotes ? (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                    {batch.applyNotes}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
