import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";

type PlaceholderMetric = {
  title: string;
  value: string;
  hint: string;
};

type PlaceholderBlock = {
  title: string;
  description: string;
  items: readonly string[];
};

type PlaceholderLink = {
  href: string;
  label: string;
};

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  statusLabel: string;
  statusTone?: "good" | "warning" | "neutral" | "accent";
  metrics: readonly PlaceholderMetric[];
  blocks: readonly PlaceholderBlock[];
  links?: readonly PlaceholderLink[];
};

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  statusLabel,
  statusTone = "neutral",
  metrics,
  blocks,
  links,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={<StatusBadge label={statusLabel} tone={statusTone} />}
      />

      <section className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.title}
            title={metric.title}
            value={metric.value}
            hint={metric.hint}
          />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {blocks.map((block) => (
          <SectionCard
            key={block.title}
            title={block.title}
            description={block.description}
          >
            <ul className="space-y-3 text-sm leading-6 text-slate-700">
              {block.items.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  {item}
                </li>
              ))}
            </ul>
          </SectionCard>
        ))}
      </section>

      {links?.length ? (
        <SectionCard
          title="Related sections"
          description="Move through the shell with the same route structure used in the sidebar."
        >
          <div className="grid gap-3 md:grid-cols-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
