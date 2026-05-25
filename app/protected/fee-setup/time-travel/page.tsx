import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInr } from "@/lib/helpers/currency";
import {
  getClassLabelMap,
  getFeeSetupSnapshotAt,
} from "@/lib/fees/time-travel";
import { requireStaffPermission } from "@/lib/supabase/session";

type Props = {
  searchParams?: Promise<{
    asOf?: string;
  }>;
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatNumberCell(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatInr(value);
  }
  return "—";
}

function safeString(value: unknown, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export default async function FeeSetupTimeTravelPage({ searchParams }: Props) {
  await requireStaffPermission("fees:view", { onDenied: "redirect" });
  const resolved = searchParams ? await searchParams : undefined;
  const requestedDate = resolved?.asOf?.trim() || todayIso();
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate);
  const asOf = isValidDate ? requestedDate : todayIso();

  const [snapshot, classLabels] = await Promise.all([
    getFeeSetupSnapshotAt(asOf),
    getClassLabelMap(),
  ]);

  const policy = snapshot.policy;
  const policyData = policy?.data ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fee Setup"
        title="Fee Setup — Time Travel"
        description="Reconstructed view of the active fee policy and per-class fees as of a chosen date. Read-only; sourced from audit_logs."
        actions={
          <Button asChild variant="outline">
            <Link href="/protected/fee-setup">Back to Fee Setup</Link>
          </Button>
        }
      />

      <SectionCard
        title="Choose a date"
        description="Pick the day you want to inspect. The page rebuilds the policy snapshot from audit_logs."
      >
        <form className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="asOf">What was the setup on…</Label>
            <Input
              id="asOf"
              name="asOf"
              type="date"
              defaultValue={asOf}
              max={todayIso()}
              className="mt-2 h-10"
            />
          </div>
          <Button type="submit">Load snapshot</Button>
        </form>
      </SectionCard>

      <SectionCard
        title={`Fee policy snapshot as of ${asOf}`}
        description="The newest active fee_policy_configs row at or before the chosen date."
      >
        {policy && policyData ? (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Captured {formatDateTime(policy.capturedAt)} — record {policy.recordId}
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Academic session
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {safeString(policyData.academic_session_label)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Receipt prefix
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {safeString(policyData.receipt_prefix)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Flat late fee
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {formatNumberCell(policyData.late_fee_flat_amount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Accepted payment modes
                </dt>
                <dd className="mt-1 text-foreground">
                  {Array.isArray(policyData.accepted_payment_modes)
                    ? (policyData.accepted_payment_modes as unknown[]).join(", ")
                    : "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Installment schedule
                </dt>
                <dd className="mt-1">
                  {Array.isArray(policyData.installment_schedule) ? (
                    <ul className="space-y-1 text-sm">
                      {(policyData.installment_schedule as Array<Record<string, unknown>>).map(
                        (entry, index) => (
                          <li key={index} className="rounded-md border border-border bg-surface-2 px-3 py-2">
                            <span className="font-medium">{safeString(entry.label, `Installment ${index + 1}`)}</span>
                            <span className="ml-2 text-muted-foreground">
                              due {safeString(entry.due_date)}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </dd>
              </div>
              {typeof policyData.notes === "string" && policyData.notes.trim().length > 0 ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Notes
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-foreground">
                    {policyData.notes}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center text-sm text-muted-foreground">
            No fee_policy_configs record was active on or before this date.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title={`Per-class fees as of ${asOf}`}
        description="Latest active fee_settings row per class at or before the chosen date."
      >
        {snapshot.feeSettings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center text-sm text-muted-foreground">
            No class fee rows were active on or before this date.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2 text-right">Tuition</th>
                  <th className="px-3 py-2 text-right">Transport</th>
                  <th className="px-3 py-2 text-right">Books</th>
                  <th className="px-3 py-2 text-right">Adm/Activity/Misc</th>
                  <th className="px-3 py-2">Captured at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {snapshot.feeSettings
                  .slice()
                  .sort((a, b) => {
                    const labelA = a.classId ? classLabels.get(a.classId) ?? a.classId : a.recordId;
                    const labelB = b.classId ? classLabels.get(b.classId) ?? b.classId : b.recordId;
                    return labelA.localeCompare(labelB);
                  })
                  .map((row) => (
                  <tr key={row.recordId} className="hover:bg-surface-2/40">
                    <td className="px-3 py-2 font-medium text-foreground">
                      {row.classId ? classLabels.get(row.classId) ?? row.classId : "Unknown class"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatNumberCell(row.data.tuition_fee_amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatNumberCell(row.data.transport_fee_amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatNumberCell(row.data.books_fee_amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatNumberCell(row.data.admission_activity_misc_fee_amount)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTime(row.capturedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={`Student fee overrides as of ${asOf}`}
        description={`Latest active student_fee_overrides per student. Showing first 20 of ${snapshot.studentOverrides.length}.`}
      >
        {snapshot.studentOverrides.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center text-sm text-muted-foreground">
            No active student overrides at this date.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Student id</th>
                  <th className="px-3 py-2 text-right">Tuition override</th>
                  <th className="px-3 py-2 text-right">Discount</th>
                  <th className="px-3 py-2 text-right">Late waiver</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Captured at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {snapshot.studentOverrides.slice(0, 20).map((row) => (
                  <tr key={row.recordId} className="hover:bg-surface-2/40">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {row.studentId ?? row.recordId}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatNumberCell(row.data.custom_tuition_fee_amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatNumberCell(row.data.discount_amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatNumberCell(row.data.late_fee_waiver_amount)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {safeString(row.data.reason, "—")}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTime(row.capturedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <p className="text-xs text-muted-foreground">
        Inspected {snapshot.policyHistoryCount} policy audit rows ·{" "}
        {snapshot.feeSettingHistoryCount} fee_settings rows ·{" "}
        {snapshot.overrideHistoryCount} override rows on or before {asOf}.
      </p>
    </div>
  );
}
