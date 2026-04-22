import { PageHeader } from "@/components/admin/page-header";
import { RolePreview } from "@/components/admin/role-preview";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { schoolProfile } from "@/lib/config/school";
import { getFeePolicySummary } from "@/lib/fees/data";
import {
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

export default async function SettingsPage() {
  const staff = await requireStaffPermission("settings:view", { onDenied: "redirect" });
  const policy = await getFeePolicySummary();
  const serviceRoleConfigured = Boolean(
    getOptionalEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const deploymentEnvironment = getOptionalEnvVar("VERCEL_ENV") ?? "local";
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
        title="Deployment readiness and policy"
        description="Use this page to verify that the internal admin shell is configured safely before production deployment."
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
    </div>
  );
}
