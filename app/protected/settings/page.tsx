import { PageHeader } from "@/components/admin/page-header";
import { RolePreview } from "@/components/admin/role-preview";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { activeFeeRules } from "@/lib/config/fee-rules";
import { schoolProfile } from "@/lib/config/school";

const environmentNotes = [
  "Keep NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY configured in local and deployed environments.",
  "Treat SUPABASE_SERVICE_ROLE_KEY as server-only and never expose it to browser code.",
  "Keep NEXT_PUBLIC_APP_MODE aligned with the repo’s internal-admin posture.",
] as const;

const policyNotes = [
  `Receipt prefix remains ${schoolProfile.receiptPrefix}.`,
  `Late fee default remains Rs ${activeFeeRules.lateFeeFlatRupees}.`,
  `Installment due dates remain ${activeFeeRules.installmentDueDates.join(", ")}.`,
] as const;

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Shell settings and access placeholders"
        description="Use settings to keep the admin shell single-school, internal-only, and consistent with the current fee policy."
        actions={<StatusBadge label="Internal admin" tone="good" />}
      />

      <section className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Deployment profile"
          description="These assumptions should remain stable while the shell grows."
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
          </ul>
        </SectionCard>

        <SectionCard
          title="Environment notes"
          description="Keep auth and deployment wiring simple and explicit."
        >
          <ul className="space-y-3 text-sm leading-6 text-slate-700">
            {environmentNotes.map((note) => (
              <li
                key={note}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                {note}
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>

      <SectionCard
        title="Role placeholders"
        description="The requested initial roles are wired into the shell as clean TypeScript placeholders."
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
