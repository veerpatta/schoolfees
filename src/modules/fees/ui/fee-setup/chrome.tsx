"use client";

/**
 * The chrome around Fee Setup: the save/error notice, the sync pill, the
 * collapsible advanced block, and the section rail down the side.
 *
 * Presentational and stateless — every one of these takes what it renders as a
 * prop. Split out of fee-setup-client.tsx, which was 2,246 lines.
 */
"use client";

import { useTranslations } from "next-intl";
import { formatMediumDate, formatTimeIst } from "@/platform/helpers/date";
import {
  FEE_SETUP_SECTIONS,
  type FeeSetupSectionId,
  type SyncStatus,
} from "@/modules/fees/ui/fee-setup/sections";

export function ActionNotice({
  state,
  idleIsHidden = true,
}: {
  state: { status: string; message: string | null | undefined };
  idleIsHidden?: boolean;
}) {
  if ((idleIsHidden && state.status === "idle") || !state.message) {
    return null;
  }

  const toneClassName =
    state.status === "error"
      ? "bg-destructive-soft text-destructive-soft-foreground"
      : state.status === "preview"
        ? "bg-info-soft text-info-soft-foreground"
        : "bg-success-soft text-success-soft-foreground";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClassName}`}>
      {state.message}
    </div>
  );
}

export function AdvancedDetails({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="overflow-hidden rounded-2xl border border-border bg-card">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
        {title}
        {description ? (
          <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

export function SyncPill({ status, lastSavedAt }: { status: SyncStatus; lastSavedAt: string | null }) {
  const t = useTranslations("FeeSetup");
  const label =
    status === "saving"
      ? t("syncStatusSaving")
      : status === "error"
        ? t("syncStatusError")
        : status === "dirty"
          ? t("syncStatusDirty")
          : lastSavedAt
            ? t("syncStatusSynced", {
                when: formatMediumDate(lastSavedAt),
              })
            : t("syncStatusNotSaved");

  const toneClass =
    status === "saving"
      ? "border-info/40 bg-info-soft text-info-soft-foreground"
      : status === "error"
        ? "border-destructive/40 bg-destructive-soft text-destructive-soft-foreground"
        : status === "dirty"
          ? "border-warning/40 bg-warning-soft text-warning-soft-foreground"
          : "border-success/40 bg-success-soft text-success-soft-foreground";

  const icon =
    status === "saving"
      ? "↻"
      : status === "error"
        ? "✕"
        : status === "dirty"
          ? "●"
          : "✓";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${toneClass}`}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

export function SectionNavRail({
  activeSection,
  dirtySections,
  syncStatus,
  lastSavedAt,
  onSelect,
}: {
  activeSection: FeeSetupSectionId;
  dirtySections: Set<FeeSetupSectionId>;
  syncStatus: SyncStatus;
  lastSavedAt: string | null;
  onSelect: (id: FeeSetupSectionId) => void;
}) {
  const t = useTranslations("FeeSetup");
  return (
    <nav
      aria-label={t("navAriaLabel")}
      className="hidden w-48 shrink-0 flex-col gap-0.5 border-r border-border bg-surface-2 py-3 md:flex"
    >
      {FEE_SETUP_SECTIONS.map((section) => {
        const isActive = activeSection === section.id;
        const isDirtySection = dirtySections.has(section.id);

        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-3 border-l-2 px-4 py-2 text-left text-sm transition-colors ${
              isActive
                ? "border-l-accent bg-card font-medium text-foreground"
                : "border-l-transparent text-muted-foreground hover:bg-card hover:text-foreground"
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                isDirtySection
                  ? "bg-warning"
                  : syncStatus === "synced"
                    ? "bg-success"
                    : "bg-border-strong"
              }`}
            />
            <span className="truncate">{t(section.i18nKey)}</span>
          </button>
        );
      })}

      <div className="mt-auto border-t border-border px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("lastSavedLabel")}
        </p>
        <p className="mt-1 text-xs text-foreground">
          {lastSavedAt ? formatMediumDate(lastSavedAt) : t("lastSavedNever")}
        </p>
        {lastSavedAt ? (
          <p className="text-[10px] text-muted-foreground">
            {formatTimeIst(lastSavedAt)}
          </p>
        ) : null}
      </div>
    </nav>
  );
}

