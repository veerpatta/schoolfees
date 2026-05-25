import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInr } from "@/lib/helpers/currency";
import { listPromotionRuns } from "@/lib/promotion/data";
import { requireStaffPermission } from "@/lib/supabase/session";

import { createPromotionPreviewAction } from "./actions";

type Props = {
  searchParams?: Promise<{
    error?: string;
    notice?: string;
  }>;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function PromotionIndexPage({ searchParams }: Props) {
  await requireStaffPermission("students:write", { onDenied: "redirect" });
  const resolved = searchParams ? await searchParams : undefined;
  const runs = await listPromotionRuns(25);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Tools"
        title="Year-End Class Promotion"
        description="Build a per-student preview that proposes next-year classes (Class 8 → Class 9, etc.), apply it once verified, and roll back if needed."
      />

      {resolved?.error ? (
        <div className="rounded-xl border bg-destructive-soft px-4 py-3 text-sm text-destructive-soft-foreground">
          {resolved.error}
        </div>
      ) : null}

      {resolved?.notice ? (
        <div className="rounded-xl border bg-success-soft px-4 py-3 text-sm text-success-soft-foreground">
          {resolved.notice}
        </div>
      ) : null}

      <SectionCard
        title="Start a new promotion run"
        description="Sessions follow the format 2026-27 / 2027-28. The target session's classes and fee setup must already be in place."
      >
        <form action={createPromotionPreviewAction} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sourceSessionLabel">Source session</Label>
            <Input
              id="sourceSessionLabel"
              name="sourceSessionLabel"
              placeholder="2026-27"
              className="mt-2 h-10"
              required
            />
          </div>
          <div>
            <Label htmlFor="targetSessionLabel">Target session</Label>
            <Input
              id="targetSessionLabel"
              name="targetSessionLabel"
              placeholder="2027-28"
              className="mt-2 h-10"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Build promotion preview</Button>
            <p className="mt-2 text-xs text-muted-foreground">
              No student records are changed until you explicitly Apply on the next screen.
            </p>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Recent runs"
        description="History of previous promotion attempts. Click any run to view its details."
      >
        {runs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center text-sm text-muted-foreground">
            No promotion runs yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((run) => (
              <li key={run.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link
                      href={`/protected/admin-tools/promotion/${run.id}`}
                      className="font-semibold text-foreground underline-offset-2 hover:underline"
                    >
                      {run.sourceSessionLabel} → {run.targetSessionLabel}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Triggered {formatDateTime(run.triggeredAt)}
                      {run.appliedAt ? ` · applied ${formatDateTime(run.appliedAt)}` : ""}
                      {run.rolledBackAt ? ` · rolled back ${formatDateTime(run.rolledBackAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-full border px-2 py-0.5 ${
                        run.status === "applied"
                          ? "border-success/30 bg-success-soft text-success-soft-foreground"
                          : run.status === "rolled_back"
                            ? "border-warning/30 bg-warning-soft text-warning-soft-foreground"
                            : "border-border bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      {run.status === "preview" ? "Preview" : run.status === "applied" ? "Applied" : "Rolled back"}
                    </span>
                    <span className="text-muted-foreground">
                      {run.previewCount} students · {run.graduatedCount} graduates
                    </span>
                    <span className="text-muted-foreground">
                      Credit forward {formatInr(run.creditCarryForwardTotal)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
