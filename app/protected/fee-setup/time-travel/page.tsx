import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInr } from "@/lib/helpers/currency";
import { formatDateTimeIst } from "@/lib/helpers/date";
import {
  getClassLabelMap,
  getFeeSetupSnapshotAt,
} from "@/lib/fees/time-travel";
import { requireStaffPermission } from "@/lib/supabase/session";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { appendSessionParam } from "@/lib/navigation/session-href";

type Props = {
  searchParams?: Promise<{
    asOf?: string;
    session?: string | string[];
  }>;
};

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[value.length - 1] ?? "";
  return value ?? "";
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const formatDateTime = (value: string) => formatDateTimeIst(value, value);

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
  const t = await getTranslations("FeeSetup");
  await requireStaffPermission("fees:view", { onDenied: "redirect" });
  const resolved = searchParams ? await searchParams : undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: asString(resolved?.session),
    cookieSession: await getViewSessionCookie(),
  });
  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);

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
        eyebrow={t("timeTravelEyebrow")}
        title={t("timeTravelTitle")}
        description={t("timeTravelDescription")}
        actions={
          <Button asChild variant="outline">
            <Link href={withSession("/protected/fee-setup")}>{t("timeTravelBackAction")}</Link>
          </Button>
        }
      />

      <SectionCard
        title={t("timeTravelChooseTitle")}
        description={t("timeTravelChooseDescription")}
      >
        <form className="flex flex-wrap items-end gap-3">
          {viewSession.sessionLabel ? (
            <input type="hidden" name="session" value={viewSession.sessionLabel} />
          ) : null}
          <div>
            <Label htmlFor="asOf">{t("timeTravelDateLabel")}</Label>
            <Input
              id="asOf"
              name="asOf"
              type="date"
              defaultValue={asOf}
              max={todayIso()}
              className="mt-2 h-10"
            />
          </div>
          <Button type="submit">{t("timeTravelLoad")}</Button>
        </form>
      </SectionCard>

      <SectionCard
        title={t("timeTravelPolicyTitle", { date: asOf })}
        description={t("timeTravelPolicyDescription")}
      >
        {policy && policyData ? (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {t("timeTravelCapturedRecord", {
                when: formatDateTime(policy.capturedAt),
                id: policy.recordId,
              })}
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("timeTravelAcademicSession")}
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {safeString(policyData.academic_session_label)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("timeTravelReceiptPrefix")}
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {safeString(policyData.receipt_prefix)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("timeTravelFlatLateFee")}
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {formatNumberCell(policyData.late_fee_flat_amount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("timeTravelAcceptedModes")}
                </dt>
                <dd className="mt-1 text-foreground">
                  {Array.isArray(policyData.accepted_payment_modes)
                    ? (policyData.accepted_payment_modes as unknown[]).join(", ")
                    : "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("timeTravelInstallmentSchedule")}
                </dt>
                <dd className="mt-1">
                  {Array.isArray(policyData.installment_schedule) ? (
                    <ul className="space-y-1 text-sm">
                      {(policyData.installment_schedule as Array<Record<string, unknown>>).map(
                        (entry, index) => (
                          <li key={index} className="rounded-md border border-border bg-surface-2 px-3 py-2">
                            <span className="font-medium">
                              {safeString(
                                entry.label,
                                t("timeTravelInstallmentFallback", { index: index + 1 }),
                              )}
                            </span>
                            <span className="ml-2 text-muted-foreground">
                              {t("timeTravelDueOn", { date: safeString(entry.due_date) })}
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
                    {t("timeTravelNotes")}
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
            {t("timeTravelPolicyEmpty")}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title={t("timeTravelClassFeesTitle", { date: asOf })}
        description={t("timeTravelClassFeesDescription")}
      >
        {snapshot.feeSettings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("timeTravelClassFeesEmpty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("timeTravelTableClass")}</th>
                  <th className="px-3 py-2 text-right">{t("timeTravelTableTuition")}</th>
                  <th className="px-3 py-2 text-right">{t("timeTravelTableTransport")}</th>
                  <th className="px-3 py-2 text-right">{t("timeTravelTableBooks")}</th>
                  <th className="px-3 py-2 text-right">{t("timeTravelTableAdmAct")}</th>
                  <th className="px-3 py-2">{t("timeTravelTableCaptured")}</th>
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
                      {row.classId ? classLabels.get(row.classId) ?? row.classId : t("timeTravelUnknownClass")}
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
        title={t("timeTravelStudentOverridesTitle", { date: asOf })}
        description={t("timeTravelStudentOverridesDescription", {
          count: snapshot.studentOverrides.length,
        })}
      >
        {snapshot.studentOverrides.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("timeTravelStudentOverridesEmpty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("timeTravelTableStudentId")}</th>
                  <th className="px-3 py-2 text-right">{t("timeTravelTableTuitionOverride")}</th>
                  <th className="px-3 py-2 text-right">{t("timeTravelTableDiscount")}</th>
                  <th className="px-3 py-2 text-right">{t("timeTravelTableLateWaiver")}</th>
                  <th className="px-3 py-2">{t("timeTravelTableReason")}</th>
                  <th className="px-3 py-2">{t("timeTravelTableCaptured")}</th>
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
        {t("timeTravelFootnote", {
          policyCount: snapshot.policyHistoryCount,
          feeSettingCount: snapshot.feeSettingHistoryCount,
          overrideCount: snapshot.overrideHistoryCount,
          date: asOf,
        })}
      </p>
    </div>
  );
}
