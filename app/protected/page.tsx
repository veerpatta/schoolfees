import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { RolePreview } from "@/components/admin/role-preview";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { protectedNavigation } from "@/lib/config/navigation";

const dashboardMetrics = [
  {
    title: "Students",
    value: "Placeholder",
    hint: "Student master summary cards will surface here.",
  },
  {
    title: "Payments",
    value: "Ready",
    hint: "Counter entry workflow slot is scaffolded in the shell.",
  },
  {
    title: "Receipts",
    value: "Pending",
    hint: "Receipt print and reprint views are set aside separately.",
  },
  {
    title: "Defaulters",
    value: "Pending",
    hint: "Outstanding follow-up reports will plug into this layout.",
  },
] as const;

const workQueues = [
  "Use Students to keep admissions, class assignment, and status clean.",
  "Configure Fee Setup before staff begin posting live collections.",
  "Record Payments and keep receipts append-only and auditable.",
  "Use Ledger and Defaulters to review balances instead of editing history.",
] as const;

const auditNotes = [
  "Historical payments should remain append-only even after correction flows are added.",
  "Receipt numbers, payment modes, and staff identity need to stay visible in operational views.",
  "This shell is intentionally simple so office staff can move fast without hunting for actions.",
] as const;

export default function ProtectedPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title="Admin shell overview"
        description="This is the initial internal workspace for VPPS fee operations. Each section is scaffolded for a clear office workflow, with room to connect live data next."
        actions={<StatusBadge label="Initial shell" tone="good" />}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardMetrics.map((metric) => (
          <MetricCard
            key={metric.title}
            title={metric.title}
            value={metric.value}
            hint={metric.hint}
          />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Open sections"
          description="The sidebar stays focused on the daily internal admin workflow."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {protectedNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-white"
              >
                <p className="text-sm font-semibold text-slate-950">
                  {item.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Current focus"
          description="The shell is optimized for clarity before feature depth."
        >
          <ul className="space-y-3 text-sm leading-6 text-slate-700">
            {workQueues.map((item) => (
              <li
                key={item}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                {item}
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>

      <SectionCard
        title="Role placeholders"
        description="Initial role names are available in the shell now, even before fine-grained permission enforcement is wired."
      >
        <RolePreview title={null} description={null} />
      </SectionCard>

      <SectionCard
        title="Audit reminders"
        description="Keep the shell aligned with the school’s correction-safe operating rules."
      >
        <ul className="space-y-3 text-sm leading-6 text-slate-700">
          {auditNotes.map((note) => (
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
