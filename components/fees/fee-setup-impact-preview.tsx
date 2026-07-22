"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Lock, ShieldCheck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ConfigChangeImpactPreview } from "@/lib/fees/types";

/**
 * The gate between editing Fee Setup and publishing it.
 *
 * Fee Setup rewrites student dues, so the office should see what a change
 * does BEFORE it lands — especially that rows with money already posted
 * against them are frozen, never rewritten. The preview itself is computed
 * server-side (`createWorkbookFeeSetupPreview`); publishing applies that exact
 * reviewed batch by id, so what is shown here is what gets applied.
 */

type FeeSetupImpactPreviewProps = {
  preview: ConfigChangeImpactPreview;
  onPublish: () => void;
  onKeepEditing: () => void;
  isPublishing: boolean;
};

export function FeeSetupImpactPreview({
  preview,
  onPublish,
  onKeepEditing,
  isPublishing,
}: FeeSetupImpactPreviewProps) {
  const t = useTranslations("FeeSetup");

  const rowsRebuilt =
    preview.installmentsToInsert + preview.installmentsToUpdate + preview.installmentsToCancel;

  return (
    <section
      data-fee-setup-impact-gate
      aria-labelledby="fee-setup-impact-heading"
      className="rounded-2xl border border-accent/40 bg-accent-soft/40 p-4 md:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="fee-setup-impact-heading"
            className="text-sm font-semibold text-foreground"
          >
            {t("impactPreviewGateHeading")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("impactPreviewGateBody")}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-accent-soft-foreground">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {preview.scopeLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GateTile
          icon={<Users className="size-4 text-accent" aria-hidden="true" />}
          label={t("previewUnpaidRebuilt")}
          value={rowsRebuilt}
          hint={t("previewUnpaidRebuiltHint", { count: preview.studentsAffected })}
        />
        <GateTile
          icon={<Lock className="size-4 text-success" aria-hidden="true" />}
          label={t("previewFrozenRows")}
          value={preview.blockedInstallments}
          hint={t("previewFrozenRowsHint")}
          tone="success"
        />
        <GateTile
          label={t("previewStudentsAffected")}
          value={preview.studentsAffected}
          hint={t("previewStudentsInScope")}
        />
        <GateTile
          label={t("previewStudentsInScope")}
          value={preview.studentsInScope}
        />
      </div>

      {preview.blockedInstallments > 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-card px-3 py-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            {preview.blockedFullyPaidInstallments} paid ·{" "}
            {preview.blockedPartiallyPaidInstallments} partly paid ·{" "}
            {preview.blockedAdjustedInstallments} adjusted
          </span>
        </p>
      ) : null}

      {preview.changedFields.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {preview.changedFields.slice(0, 6).map((field) => (
            <li key={field.field} className="flex flex-wrap items-baseline gap-1.5">
              <span className="font-medium text-foreground">{field.label}</span>
              <span className="tabular-nums line-through opacity-70">{field.beforeValue}</span>
              <span aria-hidden="true">→</span>
              <span className="font-semibold tabular-nums text-foreground">
                {field.afterValue}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={onPublish} disabled={isPublishing}>
          {isPublishing ? t("publishing") : `${t("reviewAndPublish")} →`}
        </Button>
        <Button type="button" variant="ghost" onClick={onKeepEditing} disabled={isPublishing}>
          {t("keepEditing")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("previewNeverEditsMoney")}</p>
      </div>
    </section>
  );
}

function GateTile({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone?: "neutral" | "success";
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {icon}
        {label}
      </p>
      <p
        className={
          tone === "success"
            ? "mt-1 text-xl font-semibold tabular-nums text-success"
            : "mt-1 text-xl font-semibold tabular-nums text-foreground"
        }
      >
        {value}
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
