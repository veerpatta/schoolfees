import {
  roleDescriptions,
  roleLabels,
  rolePermissions,
  type StaffRole,
} from "@/lib/auth/roles";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { activeFeeRules } from "@/lib/config/fee-rules";
import { schoolProfile } from "@/lib/config/school";

const envChecklist = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", note: "Required public project URL" },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    note: "Required public key for auth and browser sessions",
  },
  { name: "NEXT_PUBLIC_SITE_URL", note: "Recommended for metadata and auth redirects" },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    note: "Server-only key for future admin jobs and imports",
  },
  { name: "NEXT_PUBLIC_SCHOOL_NAME", note: "Optional display override" },
  { name: "NEXT_PUBLIC_APP_MODE", note: "Keep this as internal-admin" },
] as const;

const roleOrder: StaffRole[] = ["admin", "accounts", "clerk"];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="School profile, roles, and setup checks"
        description="Use settings to keep the deployment single-school, internal-only, and aligned with current fee policy."
        actions={<StatusBadge label="Single-school deployment" tone="good" />}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Deployment profile"
          description="Core assumptions for this app should stay stable."
        >
          <div className="space-y-3 text-sm leading-6 text-slate-700">
            <div className="rounded-[22px] bg-slate-50 px-4 py-3">
              <p className="font-semibold text-slate-900">
                School: {schoolProfile.name}
              </p>
            </div>
            <div className="rounded-[22px] bg-slate-50 px-4 py-3">
              <p className="font-semibold text-slate-900">
                Access model: {schoolProfile.appMode}
              </p>
            </div>
            <div className="rounded-[22px] bg-slate-50 px-4 py-3">
              <p className="font-semibold text-slate-900">
                Late fee default: Rs {activeFeeRules.lateFeeFlatRupees}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Environment checklist"
          description="Set these values locally and again in Vercel."
        >
          <div className="space-y-3">
            {envChecklist.map((entry) => (
              <div
                key={entry.name}
                className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4"
              >
                <p className="font-mono text-sm font-semibold text-slate-950">
                  {entry.name}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {entry.note}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Role access model"
        description="Start with simple operational roles before introducing more granular restrictions."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {roleOrder.map((role) => (
            <div
              key={role}
              className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4"
            >
              <p className="text-base font-semibold text-slate-950">
                {roleLabels[role]}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {roleDescriptions[role]}
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {rolePermissions[role].map((permission) => (
                  <li key={permission}>- {permission}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Change control"
        description="Fee-policy edits should never live in one place only."
      >
        <ul className="space-y-3 text-sm leading-6 text-slate-700">
          <li>
            - Reflect fee-rule changes in <code>lib/config/fee-rules.ts</code>.
          </li>
          <li>- Update the settings UI so staff can see the active policy.</li>
          <li>- Update the README so deployment notes stay accurate.</li>
          <li>
            - Prefer corrections and audit records over destructive deletes in
            operational tables.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
