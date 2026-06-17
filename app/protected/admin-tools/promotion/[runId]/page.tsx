import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInr } from "@/lib/helpers/currency";
import { formatDateTimeIst } from "@/lib/helpers/date";
import { getPromotionRun } from "@/lib/promotion/data";
import { requireStaffPermission } from "@/lib/supabase/session";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { appendSessionParam } from "@/lib/navigation/session-href";

import {
  applyPromotionRunAction,
  rollbackPromotionRunAction,
  updatePromotionEntryDecisionAction,
} from "../actions";

type Props = {
  params: Promise<{ runId: string }>;
  searchParams?: Promise<{
    error?: string;
    notice?: string;
    session?: string | string[];
  }>;
};

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[value.length - 1] ?? "";
  return value ?? "";
}

const DECISION_I18N: Record<string, string> = {
  pending: "promotionDecisionPending",
  promote: "promotionDecisionPromote",
  graduate: "promotionDecisionGraduate",
  skip: "promotionDecisionSkip",
  manual: "promotionDecisionManual",
};

const DECISION_TONE: Record<string, string> = {
  promote: "border-success/30 bg-success-soft text-success-soft-foreground",
  graduate: "border-info/30 bg-info-soft text-info-soft-foreground",
  pending: "border-border bg-surface-2 text-muted-foreground",
  skip: "border-warning/30 bg-warning-soft text-warning-soft-foreground",
  manual: "border-warning/30 bg-warning-soft text-warning-soft-foreground",
};

const formatDateTime = (value: string) => formatDateTimeIst(value, value);

export default async function PromotionDetailPage({ params, searchParams }: Props) {
  const t = await getTranslations("AdminTools");
  await requireStaffPermission("students:write", { onDenied: "redirect" });
  const { runId } = await params;
  const resolved = searchParams ? await searchParams : undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: asString(resolved?.session),
    cookieSession: await getViewSessionCookie(),
  });
  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);
  const detail = await getPromotionRun(runId);

  if (!detail) {
    notFound();
  }

  const { run, entries } = detail;
  const isPreview = run.status === "preview";
  const isApplied = run.status === "applied";

  const promoteCount = entries.filter((entry) => entry.decision === "promote").length;
  const graduateCount = entries.filter((entry) => entry.decision === "graduate").length;
  const pendingCount = entries.filter((entry) => entry.decision === "pending" || entry.decision === "manual").length;
  const creditTotal = entries.reduce((sum, entry) => sum + entry.openingCreditAmount, 0);

  const decisionLabel = (decision: string) => {
    const key = DECISION_I18N[decision];
    return key
      ? t(key as Parameters<typeof t>[0])
      : decision;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("promotionDetailEyebrow")}
        title={t("promotionDetailTitle", {
          source: run.sourceSessionLabel,
          target: run.targetSessionLabel,
        })}
        description={t("promotionDetailDescription", {
          when: formatDateTime(run.triggeredAt),
          status: run.status,
        })}
        actions={
          <Button asChild variant="outline">
            <Link href={withSession("/protected/admin-tools/promotion")}>{t("promotionBackToRuns")}</Link>
          </Button>
        }
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
        title={t("promotionSummaryTitle")}
        description={t("promotionSummaryDescription")}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-surface-2 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("promotionSummaryTotal")}</p>
            <p className="mt-1 text-2xl font-semibold">{run.previewCount}</p>
          </div>
          <div className="rounded-xl border bg-success-soft px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-success-soft-foreground">{t("promotionSummaryToPromote")}</p>
            <p className="mt-1 text-2xl font-semibold text-success-soft-foreground">{promoteCount}</p>
          </div>
          <div className="rounded-xl border bg-info-soft px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-info-soft-foreground">{t("promotionSummaryToGraduate")}</p>
            <p className="mt-1 text-2xl font-semibold text-info-soft-foreground">{graduateCount}</p>
          </div>
          <div className="rounded-xl border bg-warning-soft px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-warning-soft-foreground">{t("promotionSummaryNeedAttention")}</p>
            <p className="mt-1 text-2xl font-semibold text-warning-soft-foreground">{pendingCount}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("promotionSummaryCreditCarry")}<strong>{formatInr(creditTotal)}</strong>
        </p>
      </SectionCard>

      <SectionCard
        title={t("promotionEditCopiedTitle")}
        description={t("promotionEditCopiedDescription", { target: run.targetSessionLabel })}
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/protected/fee-setup?session=${encodeURIComponent(run.targetSessionLabel)}`}>
              {t("promotionEditFeePolicy")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/protected/fee-setup?session=${encodeURIComponent(run.targetSessionLabel)}`}>
              {t("promotionEditDiscounts")}
            </Link>
          </Button>
        </div>
      </SectionCard>

      {isPreview ? (
        <SectionCard
          title={t("promotionApplyTitle")}
          description={t("promotionApplyDescription")}
        >
          <form action={applyPromotionRunAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="runId" value={run.id} />
            <div>
              <Label htmlFor="confirmation">{t("promotionConfirmationLabel")}</Label>
              <Input
                id="confirmation"
                name="confirmation"
                placeholder="APPLY"
                className="mt-2 h-10 w-40"
                required
              />
            </div>
            <Button type="submit">
              {t("promotionApplyButton", { count: promoteCount + graduateCount })}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">{t("promotionApplyHint")}</p>
        </SectionCard>
      ) : null}

      {isApplied ? (
        <SectionCard
          title={t("promotionRollbackTitle")}
          description={t("promotionRollbackDescription")}
        >
          <form action={rollbackPromotionRunAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="runId" value={run.id} />
            <div>
              <Label htmlFor="rollbackConfirmation">{t("promotionConfirmationLabel")}</Label>
              <Input
                id="rollbackConfirmation"
                name="confirmation"
                placeholder="ROLLBACK"
                className="mt-2 h-10 w-40"
                required
              />
            </div>
            <Button type="submit" variant="destructive">{t("promotionRollbackButton")}</Button>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title={t("promotionPlanTitle")} description={t("promotionPlanDescription")}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t("promotionPlanColStudent")}</th>
                <th className="px-3 py-2">{t("promotionPlanColFrom")}</th>
                <th className="px-3 py-2">{t("promotionPlanColTo")}</th>
                <th className="px-3 py-2 text-right">{t("promotionPlanColCredit")}</th>
                <th className="px-3 py-2">{t("promotionPlanColDecision")}</th>
                {isPreview ? <th className="px-3 py-2">{t("promotionPlanColChange")}</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-surface-2/40">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{entry.studentName}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("promotionPlanSrPrefix", { value: entry.studentAdmissionNo || "—" })}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {entry.previousClassLabel}
                  </td>
                  <td className="px-3 py-2 text-xs text-foreground">
                    {entry.decision === "graduate" ? t("promotionPlanGraduated") : entry.newClassLabel}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {entry.openingCreditAmount > 0 ? formatInr(entry.openingCreditAmount) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${DECISION_TONE[entry.decision] ?? DECISION_TONE.pending}`}>
                      {decisionLabel(entry.decision)}
                    </span>
                    {entry.reason ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">{entry.reason}</p>
                    ) : null}
                  </td>
                  {isPreview ? (
                    <td className="px-3 py-2">
                      <form action={updatePromotionEntryDecisionAction} className="flex items-center gap-2">
                        <input type="hidden" name="runId" value={run.id} />
                        <input type="hidden" name="entryId" value={entry.id} />
                        <select
                          name="decision"
                          defaultValue={entry.decision}
                          className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                        >
                          <option value="pending">{t("promotionDecisionPending")}</option>
                          <option value="promote" disabled={!entry.newClassId}>{t("promotionDecisionPromote")}</option>
                          <option value="graduate">{t("promotionDecisionGraduate")}</option>
                          <option value="skip">{t("promotionDecisionSkip")}</option>
                          <option value="manual">{t("promotionDecisionMarkManual")}</option>
                        </select>
                        <Button type="submit" size="sm" variant="outline" className="h-8 px-2 text-xs">
                          {t("promotionPlanSave")}
                        </Button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
