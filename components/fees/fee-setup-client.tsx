"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, X, Calendar, BadgeIndianRupee, School, Bus, ClipboardList, Tag, ChevronDown } from "lucide-react";

import type { MasterDataActionState } from "@/app/protected/master-data/actions";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isTestAcademicSessionLabel } from "@/lib/config/fee-rules";
import { normalizeConventionalDiscountCode } from "@/lib/fees/conventional-discount-rules";
import type { ClassStatus } from "@/lib/db/types";
import type {
  FeeHeadApplicationType,
  FeeHeadChargeFrequency,
  FeeHeadDefinition,
  FeeSetupActionState,
  FeeSetupPageData,
} from "@/lib/fees/types";
import {
  buildWorkbookClassSetupRows,
  buildWorkbookRouteSetupRows,
} from "@/lib/fees/workbook-setup";
import { formatInr } from "@/lib/helpers/currency";
import { formatDateTimeIst, formatMediumDate, formatTimeIst } from "@/lib/helpers/date";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { cn } from "@/lib/utils";

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input/80 bg-card/88 px-3.5 py-2 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-[border-color,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

type SessionItem = {
  id: string;
  session_label: string;
  status: ClassStatus;
  is_current: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ClassItem = {
  id: string;
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
  sort_order: number;
  status: ClassStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type RouteItem = {
  id: string;
  route_code: string | null;
  route_name: string;
  default_installment_amount: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type FeeSetupMasterData = {
  sessions: SessionItem[];
  classes: ClassItem[];
  routes: RouteItem[];
};

type MasterDataActionFn = (
  previous: MasterDataActionState,
  formData: FormData,
) => Promise<MasterDataActionState>;

type FeeSetupClientProps = {
  data: FeeSetupPageData;
  masterData: FeeSetupMasterData;
  canEdit: boolean;
  saveWorkbookFeeSetupAction: (
    previous: FeeSetupActionState,
    formData: FormData,
  ) => Promise<FeeSetupActionState>;
  initialState: FeeSetupActionState;
  initialMasterDataState: MasterDataActionState;
  initialSelectedSessionLabel?: string;
  /** Deep-link target section (from ?section=…). Defaults to "basic". */
  initialSection?: FeeSetupSectionId;
  actions: {
    createClassAction: MasterDataActionFn;
    updateClassAction: MasterDataActionFn;
    deleteClassAction: MasterDataActionFn;
    createRouteAction: MasterDataActionFn;
    updateRouteAction: MasterDataActionFn;
    deleteRouteAction: MasterDataActionFn;
  };
};

type FeeHeadRow = FeeHeadDefinition & {
  rowId: string;
};

type ConventionalDiscountRow = {
  /** Stable client key — code is editable for custom policies, so it can't be the key. */
  rowId: string;
  id: string | null;
  code: string;
  displayName: string;
  calculationType: "tuition_zero" | "tuition_percentage" | "tuition_fixed_amount";
  fixedTuitionAmount: number | null;
  percentage: number | null;
  isActive: boolean;
  isBuiltin: boolean;
  sortOrder: number;
};

type SessionFormState = {
  academicSessionLabel: string;
  installmentDates: string[];
  lateFeeFlatAmount: number;
  newStudentAcademicFeeAmount: number;
  oldStudentAcademicFeeAmount: number;
  academicFeeDistribution: "first_only" | "equal";
  customFeeHeads: FeeHeadRow[];
  conventionalDiscountPolicies: ConventionalDiscountRow[];
  classRows: Array<{
    label: string;
    annualTuition: number;
  }>;
  routeRows: Array<{
    routeName: string;
    annualFee: number;
  }>;
};

type SyncStatus = "synced" | "dirty" | "saving" | "error";

const FEE_SETUP_SECTIONS = [
  { id: "session", i18nKey: "sectionSession", icon: "📅" },
  { id: "basic", i18nKey: "sectionBasic", icon: "₹" }, // @allow-raw-money-format — section icon glyph, not a money value
  { id: "classes", i18nKey: "sectionClasses", icon: "🏫" },
  { id: "transport", i18nKey: "sectionTransport", icon: "🚌" },
  { id: "fee-heads", i18nKey: "sectionFeeHeads", icon: "📋" },
  { id: "discounts", i18nKey: "sectionDiscounts", icon: "🏷" },
] as const;

type FeeSetupSectionId = (typeof FEE_SETUP_SECTIONS)[number]["id"];

function formatDateTime(value: string | null, notSavedLabel: string) {
  return formatDateTimeIst(value, notSavedLabel);
}

function isTestSessionLabel(label: string) {
  const normalized = label.trim();

  if (!normalized) {
    return false;
  }

  try {
    return isTestAcademicSessionLabel(normalized);
  } catch {
    return false;
  }
}

function buildFeeHeadRow(item: FeeHeadDefinition, index: number): FeeHeadRow {
  return {
    ...item,
    rowId: `${item.id}-${index}`,
  };
}

function getPolicySnapshot(data: FeeSetupPageData, sessionLabel: string) {
  return (
    data.policySnapshots.find((item) => item.academicSessionLabel === sessionLabel) ??
    data.globalPolicy
  );
}

function buildSessionFormState(data: FeeSetupPageData, sessionLabel: string): SessionFormState {
  const snapshot = getPolicySnapshot(data, sessionLabel);

  return {
    academicSessionLabel: sessionLabel,
    installmentDates: snapshot.installmentSchedule.map((item) => item.dueDate),
    lateFeeFlatAmount: snapshot.lateFeeFlatAmount,
    newStudentAcademicFeeAmount: snapshot.newStudentAcademicFeeAmount,
    oldStudentAcademicFeeAmount: snapshot.oldStudentAcademicFeeAmount,
    academicFeeDistribution: snapshot.academicFeeDistribution,
    customFeeHeads: snapshot.customFeeHeads.map((item, index) => buildFeeHeadRow(item, index)),
    conventionalDiscountPolicies: data.conventionalDiscountPolicies.map((policy) => ({
      rowId: policy.id ?? `builtin-${policy.code}`,
      id: policy.id,
      code: policy.code,
      displayName: policy.displayName,
      calculationType: policy.calculationType,
      fixedTuitionAmount: policy.fixedTuitionAmount,
      percentage: policy.percentage,
      isActive: policy.isActive,
      isBuiltin: policy.isBuiltin,
      sortOrder: policy.sortOrder,
    })),
    classRows: buildWorkbookClassSetupRows(data, sessionLabel).map((item) => ({
      label: item.label,
      annualTuition: item.annualTuition,
    })),
    routeRows: buildWorkbookRouteSetupRows(data).map((item) => ({
      routeName: item.routeName,
      annualFee: item.annualFee,
    })),
  };
}

function ActionNotice({
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

function createWorkbookFormData(
  form: SessionFormState,
  intent: "preview" | "apply" | "save",
  changeBatchId: string | null,
) {
  const formData = new FormData();
  formData.set("academicSessionLabel", form.academicSessionLabel);
  formData.set("lateFeeFlatAmount", String(form.lateFeeFlatAmount));
  formData.set("newStudentAcademicFeeAmount", String(form.newStudentAcademicFeeAmount));
  formData.set("oldStudentAcademicFeeAmount", String(form.oldStudentAcademicFeeAmount));
  formData.set("academicFeeDistribution", form.academicFeeDistribution);
  formData.set("_intent", intent);

  if (changeBatchId) {
    formData.set("changeBatchId", changeBatchId);
  }

  form.installmentDates.forEach((value) => formData.append("installmentDueDate", value));
  form.customFeeHeads.forEach((item) => {
    formData.append("feeHeadId", item.id);
    formData.append("feeHeadLabel", item.label);
    formData.append("feeHeadAmount", String(item.amount));
    formData.append("feeHeadApplicationType", item.applicationType);
    formData.append("feeHeadIsRefundable", item.isRefundable ? "yes" : "no");
    formData.append("feeHeadChargeFrequency", item.chargeFrequency);
    formData.append("feeHeadIsMandatory", item.isMandatory ? "yes" : "no");
    formData.append(
      "feeHeadIncludeInWorkbookCalculation",
      item.includeInWorkbookCalculation ? "yes" : "no",
    );
    formData.append("feeHeadIsActive", item.isActive ? "yes" : "no");
    formData.append("feeHeadNotes", item.notes ?? "");
  });
  form.conventionalDiscountPolicies.forEach((item) => {
    formData.append("conventionalPolicyId", item.id ?? "");
    formData.append("conventionalPolicyCode", item.code);
    formData.append("conventionalPolicyName", item.displayName);
    formData.append("conventionalPolicyCalculationType", item.calculationType);
    formData.append("conventionalPolicyFixedAmount", String(item.fixedTuitionAmount ?? ""));
    formData.append("conventionalPolicyPercentage", String(item.percentage ?? ""));
    formData.append("conventionalPolicyIsActive", item.isActive ? "yes" : "no");
  });
  form.classRows.forEach((item) => {
    formData.append("classLabel", item.label);
    formData.append("classAnnualTuition", String(item.annualTuition));
  });
  form.routeRows.forEach((item) => {
    formData.append("routeName", item.routeName);
    formData.append("routeAnnualFee", String(item.annualFee));
  });

  return formData;
}

function getFeeHeadApplicationLabel(value: FeeHeadApplicationType, t: (key: string) => string) {
  switch (value) {
    case "installment_1_only":
      return t("applicationInstallmentOne");
    case "split_across_installments":
      return t("applicationSplit");
    case "optional_per_student":
      return t("applicationOptional");
    default:
      return t("applicationAnnualFixed");
  }
}

function getFeeHeadChargeFrequencyLabel(value: FeeHeadChargeFrequency, t: (key: string) => string) {
  return value === "recurring" ? t("frequencyRecurring") : t("frequencyOneTime");
}

function AdvancedDetails({
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

function ReviewMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SyncPill({ status, lastSavedAt }: { status: SyncStatus; lastSavedAt: string | null }) {
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

function SectionNavRail({
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

export function FeeSetupClient({
  data,
  masterData,
  canEdit,
  saveWorkbookFeeSetupAction,
  initialState,
  initialMasterDataState,
  initialSelectedSessionLabel,
  initialSection,
  actions,
}: FeeSetupClientProps) {
  const t = useTranslations("FeeSetup");
  const router = useRouter();
  const startingSessionLabel = initialSelectedSessionLabel || data.globalPolicy.academicSessionLabel;
  const [selectedSessionLabel, setSelectedSessionLabel] = useState(
    startingSessionLabel,
  );
  const [form, setForm] = useState<SessionFormState>(() =>
    buildSessionFormState(data, startingSessionLabel),
  );
  const initialFormRef = useRef<SessionFormState>(
    buildSessionFormState(data, startingSessionLabel),
  );
  const [isDirty, setIsDirty] = useState(false);
  const [activeSection, setActiveSection] = useState<FeeSetupSectionId>(initialSection ?? "basic");
  const [dirtySections, setDirtySections] = useState<Set<FeeSetupSectionId>>(new Set());
  const [saveState, setSaveState] = useState(initialState);
  const [classState, setClassState] = useState(initialMasterDataState);
  const [routeState, setRouteState] = useState(initialMasterDataState);
  const [classSearch, setClassSearch] = useState("");
  const [routeSearch, setRouteSearch] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [newRouteName, setNewRouteName] = useState("");
  const [newRouteCode, setNewRouteCode] = useState("");
  const [isSaving, startSaving] = useTransition();
  const [isSupportingPending, startSupporting] = useTransition();

  useEffect(() => {
    const sessionExists = masterData.sessions.some(
      (item) => item.session_label === selectedSessionLabel,
    );
    const nextSessionLabel = sessionExists
      ? selectedSessionLabel
      : data.globalPolicy.academicSessionLabel;

    setSelectedSessionLabel(nextSessionLabel);
    const nextForm = buildSessionFormState(data, nextSessionLabel);
    setForm(nextForm);
    initialFormRef.current = nextForm;
    setSaveState(initialState);
    setIsDirty(false);
    setDirtySections(new Set());
  }, [data, initialState, masterData.sessions, selectedSessionLabel]);

  function markDirty(sectionId?: FeeSetupSectionId) {
    setIsDirty(true);
    if (sectionId) {
      setDirtySections((prev) => new Set([...prev, sectionId]));
    }
  }

  async function runSupportAction(
    action: MasterDataActionFn,
    previous: MasterDataActionState,
    formData: FormData,
    setState: (value: MasterDataActionState) => void,
    options?: { onSuccess?: () => void },
  ) {
    startSupporting(async () => {
      const result = await action(previous, formData);
      setState(result);

      if (result.status === "success") {
        options?.onSuccess?.();
        router.refresh();
      }
    });
  }

  function submitFeeSetup(intent: "preview" | "apply" | "save") {
    startSaving(async () => {
      const result = await saveWorkbookFeeSetupAction(
        saveState,
        createWorkbookFormData(form, intent, saveState.changeBatchId),
      );

      setSaveState(result);

      if (result.status === "success") {
        setIsDirty(false);
        setDirtySections(new Set());
        initialFormRef.current = { ...form };
        router.refresh();
      }
    });
  }

  const sessionRows = masterData.sessions;
  const selectedSessionIsTest = isTestSessionLabel(selectedSessionLabel);
  const currentSessionLabel = data.globalPolicy.academicSessionLabel;
  const classRows = buildWorkbookClassSetupRows(data, selectedSessionLabel).map((row) => ({
    ...row,
    annualTuition:
      form.classRows.find((item) => item.label === row.label)?.annualTuition ?? row.annualTuition,
    classRecord: row.classId
      ? masterData.classes.find((item) => item.id === row.classId) ?? null
      : null,
  }));
  const routeRows = buildWorkbookRouteSetupRows(data).map((row) => ({
    ...row,
    annualFee:
      form.routeRows.find((item) => item.routeName === row.routeName)?.annualFee ?? row.annualFee,
    routeRecord: row.routeId
      ? masterData.routes.find((item) => item.id === row.routeId) ?? null
      : masterData.routes.find((item) => item.route_name === row.routeName) ?? null,
  }));
  const normalizedClassSearch = classSearch.trim().toLowerCase();
  const normalizedRouteSearch = routeSearch.trim().toLowerCase();
  const visibleClassRows = normalizedClassSearch
    ? classRows.filter((row) => row.label.toLowerCase().includes(normalizedClassSearch))
    : classRows;
  const visibleRouteRows = normalizedRouteSearch
    ? routeRows.filter((row) => row.routeName.toLowerCase().includes(normalizedRouteSearch))
    : routeRows;
  const policySnapshot = data.policySnapshots.find(
    (item) => item.academicSessionLabel === selectedSessionLabel,
  );
  const lastSavedAt = policySnapshot?.updatedAt ?? null;
  const hasSavedSnapshot = Boolean(policySnapshot?.id);
  const syncStatus: SyncStatus = isSaving
    ? "saving"
    : saveState.status === "error"
      ? "error"
      : isDirty
        ? "dirty"
        : hasSavedSnapshot
          ? "synced"
          : "dirty";

  function formatLastSaved(value: string | null): string {
    return formatDateTimeIst(value, t("neverSaved"));
  }

  function updateInstallmentDate(index: number, value: string) {
    setForm((current) => {
      const nextDates = [...current.installmentDates];
      nextDates[index] = value;

      return {
        ...current,
        installmentDates: nextDates,
      };
    });
    markDirty("basic");
  }

  function addInstallmentDate() {
    setForm((current) => ({
      ...current,
      installmentDates: [...current.installmentDates, ""],
    }));
    markDirty("basic");
  }

  function removeInstallmentDate(index: number) {
    setForm((current) => {
      if (current.installmentDates.length <= 1) {
        return current;
      }

      return {
        ...current,
        installmentDates: current.installmentDates.filter(
          (_, currentIndex) => currentIndex !== index,
        ),
      };
    });
    markDirty("basic");
  }

  function updateClassAnnualTuition(label: string, annualTuition: number) {
    setForm((current) => ({
      ...current,
      classRows: current.classRows.map((item) =>
        item.label === label ? { ...item, annualTuition } : item,
      ),
    }));
    markDirty("classes");
  }

  function updateRouteAnnualFee(routeName: string, annualFee: number) {
    setForm((current) => ({
      ...current,
      routeRows: current.routeRows.map((item) =>
        item.routeName === routeName ? { ...item, annualFee } : item,
      ),
    }));
    markDirty("transport");
  }

  function addFeeHeadRow() {
    setForm((current) => ({
      ...current,
      customFeeHeads: [
        ...current.customFeeHeads,
        {
          rowId: `new-${Date.now()}`,
          id: `new_head_${Date.now()}`,
          label: "",
          amount: 0,
          applicationType: "annual_fixed",
          isRefundable: false,
          chargeFrequency: "one_time",
          isMandatory: true,
          includeInWorkbookCalculation: false,
          isActive: true,
          notes: null,
        },
      ],
    }));
    markDirty("fee-heads");
  }

  function updateFeeHeadRow(rowId: string, patch: Partial<FeeHeadRow>) {
    setForm((current) => ({
      ...current,
      customFeeHeads: current.customFeeHeads.map((item) =>
        item.rowId === rowId ? { ...item, ...patch } : item,
      ),
    }));
    markDirty("fee-heads");
  }

  function removeFeeHeadRow(rowId: string) {
    setForm((current) => ({
      ...current,
      customFeeHeads: current.customFeeHeads.filter((item) => item.rowId !== rowId),
    }));
    markDirty("fee-heads");
  }

  function updateConventionalDiscountRow(
    rowId: string,
    patch: Partial<ConventionalDiscountRow>,
  ) {
    setForm((current) => ({
      ...current,
      conventionalDiscountPolicies: current.conventionalDiscountPolicies.map((item) =>
        item.rowId === rowId ? { ...item, ...patch } : item,
      ),
    }));
    markDirty("discounts");
  }

  function addCustomDiscountRow() {
    setForm((current) => ({
      ...current,
      conventionalDiscountPolicies: [
        ...current.conventionalDiscountPolicies,
        {
          rowId:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `custom-${Date.now()}`,
          id: null,
          code: "",
          displayName: "",
          calculationType: "tuition_zero",
          fixedTuitionAmount: null,
          percentage: null,
          isActive: true,
          isBuiltin: false,
          sortOrder: current.conventionalDiscountPolicies.length + 1,
        },
      ],
    }));
    markDirty("discounts");
  }

  // Built-ins are never removed (only deactivated via the Active toggle); custom
  // rows can be dropped before saving. Server-side protection is the backstop.
  function removeDiscountRow(rowId: string) {
    setForm((current) => ({
      ...current,
      conventionalDiscountPolicies: current.conventionalDiscountPolicies.filter(
        (item) => item.rowId !== rowId || item.isBuiltin,
      ),
    }));
    markDirty("discounts");
  }

  function switchSession(sessionLabel: string) {
    setSelectedSessionLabel(sessionLabel);
    const nextForm = buildSessionFormState(data, sessionLabel);
    setForm(nextForm);
    initialFormRef.current = nextForm;
    setSaveState(initialState);
    setIsDirty(false);
    setDirtySections(new Set());
  }

  return (
    <div className="space-y-0">
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur md:px-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("topbarSessionLabel")}</span>
          <select
            value={selectedSessionLabel}
            onChange={(event) => switchSession(event.target.value)}
            disabled={isSaving}
            aria-label={t("topbarSelectSession")}
            className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
          >
            {masterData.sessions.map((session) => (
              <option key={session.session_label} value={session.session_label}>
                {session.session_label}
              </option>
            ))}
          </select>
        </div>

        <SyncPill status={syncStatus} lastSavedAt={lastSavedAt} />

        {/* Stage indicator: unsaved edits = Draft, saving = Review (impact
            preview + protected-row checks run in the save path), otherwise
            the setup on screen is what the office is Live on. */}
        <div
          className="hidden items-center gap-1 text-[10px] font-semibold uppercase tracking-wide md:flex"
          aria-hidden="true"
        >
          {[
            { key: "stageDraft", active: isDirty && !isSaving },
            { key: "stageReview", active: isSaving },
            { key: "stageLive", active: !isDirty && !isSaving },
          ].map((stage, index) => (
            <span key={stage.key} className="flex items-center gap-1">
              {index > 0 ? <span className="text-muted-foreground/40">→</span> : null}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5",
                  stage.active
                    ? stage.key === "stageLive"
                      ? "bg-success-soft text-success-soft-foreground"
                      : "bg-accent-soft text-accent-soft-foreground"
                    : "text-muted-foreground/60",
                )}
              >
                {t(stage.key)}
              </span>
            </span>
          ))}
        </div>

        {lastSavedAt && syncStatus === "synced" ? (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {formatLastSaved(lastSavedAt)}
          </span>
        ) : null}

        <div className="flex-1" />

        {canEdit ? (
          <Button
            type="button"
            size="sm"
            onClick={() => submitFeeSetup("save")}
            disabled={!isDirty || isSaving}
            aria-label={t("topbarSaveAria")}
          >
            {isSaving ? t("topbarSaving") : t("topbarSave")}
          </Button>
        ) : null}
      </div>

      <div className="space-y-6 p-4 md:p-6">
        <ActionNotice state={saveState} />

        {!canEdit ? (
          <div className="rounded-2xl border bg-warning-soft px-4 py-3 text-sm leading-6 text-warning-soft-foreground">
            {t("permissionNotice")}
          </div>
        ) : null}

        {isDirty ? (
          <div className="rounded-2xl border bg-warning-soft px-4 py-3 text-sm leading-6 text-warning-soft-foreground">
            {t("unsavedNoticePrefix")} <strong>{t("unsavedNoticeAction")}</strong> {t("unsavedNoticeSuffix")}
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm leading-6 text-muted-foreground">
          {t("savingInfoNotice")}
        </div>

        {/* Mobile section dropdown is hidden because we use the accordion layout below on mobile */}

        <div className="flex min-h-[520px] overflow-hidden rounded-2xl border border-border bg-card">
          <SectionNavRail
            activeSection={activeSection}
            dirtySections={dirtySections}
            syncStatus={syncStatus}
            lastSavedAt={lastSavedAt}
            onSelect={setActiveSection}
          />

          <div className="flex-1 overflow-y-auto p-5">
      <details
        className={`group md:contents ${
          activeSection !== "session" ? "md:hidden" : ""
        }`}
        open={activeSection === "session"}
      >
        <summary className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card px-4 py-3.5 font-medium text-foreground md:hidden" onClick={() => setActiveSection("session")}>
          <span className="flex items-center gap-2">
            <Calendar className="size-4 text-accent" />
            {t("mobileSection1")}
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="md:contents">
          <SectionCard
            title={t("academicYearTitle")}
            description={t("academicYearDescription")}
            actions={
              <div className="min-w-[240px]">
                <Label htmlFor="selected-session">{t("academicYearLabel")}</Label>
                <select
                  id="selected-session"
                  value={selectedSessionLabel}
                  onChange={(event) => switchSession(event.target.value)}
                  className={`${selectClassName} mt-2`}
                >
                  {sessionRows.length === 0 ? (
                    <option value="">{t("createAcademicYearOption")}</option>
                  ) : (
                    sessionRows.map((item) => (
                      <option key={item.id} value={item.session_label}>
                        {item.session_label}
                      </option>
                    ))
                  )}
                </select>
              </div>
            }
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={t("liveSessionBadge", { label: currentSessionLabel })} tone="good" />
                {selectedSessionLabel && selectedSessionLabel !== currentSessionLabel ? (
                  <StatusBadge label={t("editingBadge", { label: selectedSessionLabel })} tone="accent" />
                ) : null}
                {selectedSessionIsTest ? (
                  <StatusBadge label={t("testSessionBadge")} tone="warning" />
                ) : null}
              </div>

              {selectedSessionIsTest ? (
                <div className="rounded-xl border bg-warning-soft px-4 py-3 text-sm leading-6 text-warning-soft-foreground">
                  {t("testSessionNotice")}
                </div>
              ) : null}

              <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm leading-6 text-muted-foreground">
                {t("manageYearsMovedNotice")}{" "}
                <Link
                  href={appendSessionParam("/protected/admin-tools/promotion", selectedSessionLabel)}
                  className="font-semibold text-accent underline-offset-2 hover:underline"
                >
                  {t("manageYearsMovedLink")}
                </Link>
              </div>

              <AdvancedDetails
                title={t("advancedYearTitle")}
                description={t("advancedYearDescription")}
              >
                <div className="overflow-auto rounded-xl border border-border bg-card">
                  <table className="w-full min-w-full text-left text-sm">
                    <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">{t("tableSession")}</th>
                        <th className="px-4 py-3">{t("tableStatus")}</th>
                        <th className="px-4 py-3">{t("tableSavedSetup")}</th>
                        <th className="px-4 py-3">{t("tableUpdated")}</th>
                        <th className="px-4 py-3">{t("tableActions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                            {t("createAcademicYearOption")}
                          </td>
                        </tr>
                      ) : (
                        sessionRows.map((item) => {
                          const snapshot = data.policySnapshots.find(
                            (policy) => policy.academicSessionLabel === item.session_label,
                          );

                          return (
                            <tr key={item.id} className="border-t border-border align-top">
                              <td className="px-4 py-3">
                                <span className="font-medium text-foreground">{item.session_label}</span>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {item.session_label === currentSessionLabel ? (
                                    <StatusBadge label={t("badgeLive")} tone="good" />
                                  ) : null}
                                  {item.session_label === selectedSessionLabel ? (
                                    <StatusBadge label={t("badgeSelected")} tone="accent" />
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {item.status === "active"
                                  ? t("statusActive")
                                  : item.status === "inactive"
                                    ? t("statusInactive")
                                    : t("statusArchived")}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {snapshot ? (
                                  <div className="space-y-1">
                                    <p className="font-medium text-foreground">
                                      {t("savedSetupInstallments", { count: snapshot.installmentCount })}
                                    </p>
                                    <p>
                                      {t("savedSetupFeeHeads", {
                                        count: snapshot.customFeeHeads.filter((head) => head.isActive).length,
                                      })}
                                    </p>
                                  </div>
                                ) : (
                                  <span>{t("noSavedSetupYet")}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {formatDateTime(snapshot?.updatedAt ?? item.updated_at, t("notSavedYet"))}
                              </td>
                              <td className="px-4 py-3">
                                <Button
                                  type="button"
                                  variant={item.session_label === selectedSessionLabel ? "default" : "outline"}
                                  onClick={() => switchSession(item.session_label)}
                                >
                                  {t("workOnThisYear")}
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </AdvancedDetails>
            </div>
          </SectionCard>
        </div>
      </details>

      <details
        className={`group md:contents ${
          activeSection !== "basic" ? "md:hidden" : ""
        }`}
        open={activeSection === "basic"}
      >
        <summary className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card px-4 py-3.5 font-medium text-foreground md:hidden" onClick={() => setActiveSection("basic")}>
          <span className="flex items-center gap-2">
            <BadgeIndianRupee className="size-4 text-accent" />
            {t("mobileSection2")}
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="md:contents">
          <SectionCard
            title={t("basicTitle")}
            description={t("basicDescription")}
            actions={
              activeSection === "basic" && canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addInstallmentDate}
                  leadingIcon={<Plus className="size-3.5" />}
                >
                  {t("addInstallment")}
                </Button>
              ) : null
            }
          >
            <div className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
                <div className="rounded-xl border border-border bg-surface-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{t("installmentDatesTitle")}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {t("installmentDatesDescription")}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      {t("datesCount", { count: form.installmentDates.length })}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {form.installmentDates.map((value, index) => (
                      <div
                        key={`installment-${index}`}
                        className="rounded-lg border border-border bg-card p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
                      >
                        <div className="flex min-h-8 items-center gap-2">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-soft-foreground">
                            {index + 1}
                          </span>
                          <Label
                            htmlFor={`installment-date-${index}`}
                            className="min-w-0 flex-1 text-sm font-medium text-foreground"
                          >
                            {t("dueDateLabel")}
                          </Label>
                          {canEdit && form.installmentDates.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeInstallmentDate(index)}
                              aria-label={t("removeInstallmentAria", { index: index + 1 })}
                              title={t("removeInstallmentAria", { index: index + 1 })}
                              className="shrink-0 rounded-full border border-border bg-surface text-muted-foreground hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive-soft-foreground"
                            >
                              <X className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                        <Input
                          id={`installment-date-${index}`}
                          type="date"
                          value={value}
                          onChange={(event) => updateInstallmentDate(index, event.target.value)}
                          className="mt-3 h-10 rounded-lg"
                          disabled={!canEdit}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-surface-2 p-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("annualRulesTitle")}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {t("annualRulesDescription")}
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-border bg-card p-3">
                      <Label htmlFor="late-fee-amount">{t("lateFeeLabel")}</Label>
                      <Input
                        id="late-fee-amount"
                        type="number"
                        min={0}
                        value={form.lateFeeFlatAmount}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            lateFeeFlatAmount: Number(event.target.value || 0),
                          }));
                          markDirty("basic");
                        }}
                        className="mt-2 h-10 rounded-lg"
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3">
                      <Label htmlFor="new-academic-fee">{t("newAcademicFeeLabel")}</Label>
                      <Input
                        id="new-academic-fee"
                        type="number"
                        min={0}
                        value={form.newStudentAcademicFeeAmount}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            newStudentAcademicFeeAmount: Number(event.target.value || 0),
                          }));
                          markDirty("basic");
                        }}
                        className="mt-2 h-10 rounded-lg"
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3">
                      <Label htmlFor="old-academic-fee">{t("oldAcademicFeeLabel")}</Label>
                      <Input
                        id="old-academic-fee"
                        type="number"
                        min={0}
                        value={form.oldStudentAcademicFeeAmount}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            oldStudentAcademicFeeAmount: Number(event.target.value || 0),
                          }));
                          markDirty("basic");
                        }}
                        className="mt-2 h-10 rounded-lg"
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-border bg-card p-3">
                    <Label className="text-sm font-semibold text-foreground">
                      {t("academicFeeDistributionLabel")}
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("academicFeeDistributionDescription")}
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                          form.academicFeeDistribution === "first_only"
                            ? "border-accent bg-accent-soft"
                            : "border-border bg-surface hover:bg-surface-2"
                        } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        <input
                          type="radio"
                          name="academicFeeDistribution"
                          value="first_only"
                          checked={form.academicFeeDistribution === "first_only"}
                          onChange={() => {
                            setForm((current) => ({
                              ...current,
                              academicFeeDistribution: "first_only",
                            }));
                            markDirty("basic");
                          }}
                          className="mt-0.5"
                          disabled={!canEdit}
                        />
                        <span className="text-sm">
                          <span className="block font-medium text-foreground">
                            {t("firstOnlyOptionTitle")}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {t("firstOnlyOptionDescription")}
                          </span>
                        </span>
                      </label>
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                          form.academicFeeDistribution === "equal"
                            ? "border-accent bg-accent-soft"
                            : "border-border bg-surface hover:bg-surface-2"
                        } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        <input
                          type="radio"
                          name="academicFeeDistribution"
                          value="equal"
                          checked={form.academicFeeDistribution === "equal"}
                          onChange={() => {
                            setForm((current) => ({
                              ...current,
                              academicFeeDistribution: "equal",
                            }));
                            markDirty("basic");
                          }}
                          className="mt-0.5"
                          disabled={!canEdit}
                        />
                        <span className="text-sm">
                          <span className="block font-medium text-foreground">
                            {t("equalOptionTitle")}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {t("equalOptionDescription")}
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </details>

      <details
        className={`group md:contents ${
          activeSection !== "discounts" ? "md:hidden" : ""
        }`}
        open={activeSection === "discounts"}
      >
        <summary className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card px-4 py-3.5 font-medium text-foreground md:hidden" onClick={() => setActiveSection("discounts")}>
          <span className="flex items-center gap-2">
            <Tag className="size-4 text-accent" />
            {t("mobileSectionDiscounts")}
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="md:contents">
          <SectionCard
            title={t("discountsTitle")}
            description={t("discountsDescription")}
          >
            <div className="space-y-4 rounded-xl border border-border bg-surface-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{t("discountsInnerHeading")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("discountsInnerDescription")}
                  </p>
                </div>
                <StatusBadge label={t("maxTwoPerStudent")} tone="accent" />
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                {form.conventionalDiscountPolicies.map((policy) => (
                  <div key={policy.rowId} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Label htmlFor={`policy-name-${policy.rowId}`}>{t("policyNameLabel")}</Label>
                        <Input
                          id={`policy-name-${policy.rowId}`}
                          value={policy.displayName}
                          onChange={(event) =>
                            updateConventionalDiscountRow(policy.rowId, {
                              displayName: event.target.value,
                            })
                          }
                          className="mt-2"
                          disabled={!canEdit}
                        />
                      </div>
                      <label className="mt-7 flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={policy.isActive}
                          onChange={(event) =>
                            updateConventionalDiscountRow(policy.rowId, {
                              isActive: event.target.checked,
                            })
                          }
                          disabled={!canEdit}
                        />
                        {t("policyActiveLabel")}
                      </label>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <div>
                        <Label htmlFor={`policy-code-${policy.rowId}`}>{t("policyCodeLabel")}</Label>
                        {policy.isBuiltin ? (
                          <p className="mt-2 flex items-center gap-2 text-sm">
                            <code className="rounded bg-surface-3 px-2 py-1 text-xs">{policy.code}</code>
                            <StatusBadge label={t("policyBuiltinBadge")} tone="info" />
                          </p>
                        ) : (
                          <Input
                            id={`policy-code-${policy.rowId}`}
                            value={policy.code}
                            placeholder="sports_quota"
                            onChange={(event) =>
                              updateConventionalDiscountRow(policy.rowId, {
                                code: normalizeConventionalDiscountCode(event.target.value),
                              })
                            }
                            className="mt-2 font-mono"
                            disabled={!canEdit}
                          />
                        )}
                      </div>
                      <div>
                        <Label htmlFor={`policy-type-${policy.rowId}`}>{t("policyCalculationLabel")}</Label>
                        <select
                          id={`policy-type-${policy.rowId}`}
                          value={policy.calculationType}
                          onChange={(event) =>
                            updateConventionalDiscountRow(policy.rowId, {
                              calculationType: event.target.value as ConventionalDiscountRow["calculationType"],
                            })
                          }
                          className={`${selectClassName} mt-2`}
                          disabled={!canEdit}
                        >
                          <option value="tuition_zero">{t("policyCalcTuitionZero")}</option>
                          <option value="tuition_percentage">{t("policyCalcTuitionPercentage")}</option>
                          <option value="tuition_fixed_amount">{t("policyCalcTuitionFixed")}</option>
                        </select>
                      </div>
                      {policy.calculationType === "tuition_percentage" ? (
                        <div>
                          <Label htmlFor={`policy-percent-${policy.rowId}`}>{t("policyPercentageLabel")}</Label>
                          <Input
                            id={`policy-percent-${policy.rowId}`}
                            type="number"
                            min={0}
                            max={100}
                            value={policy.percentage ?? 0}
                            onChange={(event) =>
                              updateConventionalDiscountRow(policy.rowId, {
                                percentage: Number(event.target.value || 0),
                              })
                            }
                            className="mt-2"
                            disabled={!canEdit}
                          />
                        </div>
                      ) : null}
                      {policy.calculationType === "tuition_fixed_amount" ? (
                        <div>
                          <Label htmlFor={`policy-fixed-${policy.rowId}`}>{t("policyFixedLabel")}</Label>
                          <Input
                            id={`policy-fixed-${policy.rowId}`}
                            type="number"
                            min={0}
                            value={policy.fixedTuitionAmount ?? 0}
                            onChange={(event) =>
                              updateConventionalDiscountRow(policy.rowId, {
                                fixedTuitionAmount: Number(event.target.value || 0),
                              })
                            }
                            className="mt-2"
                            disabled={!canEdit}
                          />
                        </div>
                      ) : null}
                      {!policy.isBuiltin && canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="justify-self-start text-destructive"
                          onClick={() => removeDiscountRow(policy.rowId)}
                        >
                          <X className="mr-1 size-4" />
                          {t("removeDiscount")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCustomDiscountRow}
                  className="justify-self-start"
                >
                  <Plus className="mr-1 size-4" />
                  {t("addCustomDiscount")}
                </Button>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </details>

      <details
        className={`group md:contents ${
          activeSection !== "fee-heads" ? "md:hidden" : ""
        }`}
        open={activeSection === "fee-heads"}
      >
        <summary className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card px-4 py-3.5 font-medium text-foreground md:hidden" onClick={() => setActiveSection("fee-heads")}>
          <span className="flex items-center gap-2">
            <ClipboardList className="size-4 text-accent" />
            {t("mobileSectionFeeHeads")}
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="md:contents">
          <SectionCard
            title={t("feeHeadsTitle")}
            description={t("feeHeadsDescription")}
          >
            <div className="space-y-4">
              <div className="rounded-xl border bg-warning-soft px-4 py-3 text-sm leading-6 text-warning-soft-foreground">
                {t("feeHeadsAdvisory")}
              </div>
              {canEdit ? (
                <Button type="button" variant="outline" onClick={addFeeHeadRow}>
                  {t("addFeeHead")}
                </Button>
              ) : null}
              {form.customFeeHeads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-sm text-muted-foreground">
                  {t("noFeeHeads")}
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border border-border bg-card">
                  <table className="w-full min-w-full text-left text-sm">
                    <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">{t("feeHeadName")}</th>
                        <th className="px-4 py-3">{t("feeHeadAmount")}</th>
                        <th className="px-4 py-3">{t("feeHeadApplicationType")}</th>
                        <th className="px-4 py-3">{t("feeHeadFrequency")}</th>
                        <th className="px-4 py-3">{t("feeHeadMandatory")}</th>
                        <th className="px-4 py-3">{t("feeHeadRefundable")}</th>
                        <th className="px-4 py-3">{t("feeHeadCalculation")}</th>
                        <th className="px-4 py-3">{t("feeHeadStatusCol")}</th>
                        <th className="px-4 py-3">{t("feeHeadNotes")}</th>
                        <th className="px-4 py-3">{t("feeHeadActions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.customFeeHeads.map((item) => (
                        <tr key={item.rowId} className="border-t border-border align-top">
                          <td className="px-4 py-3">
                            <Input
                              value={item.label}
                              onChange={(event) =>
                                updateFeeHeadRow(item.rowId, {
                                  label: event.target.value,
                                  id:
                                    event.target.value
                                      .toLowerCase()
                                      .replace(/[^a-z0-9]+/g, "_")
                                      .replace(/^_+|_+$/g, "") || item.id,
                                })
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              type="number"
                              min={0}
                              value={item.amount}
                              onChange={(event) =>
                                updateFeeHeadRow(item.rowId, {
                                  amount: Number(event.target.value || 0),
                                })
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.applicationType}
                              onChange={(event) =>
                                updateFeeHeadRow(item.rowId, {
                                  applicationType: event.target.value as FeeHeadApplicationType,
                                })
                              }
                              className={selectClassName}
                              disabled={!canEdit}
                            >
                              <option value="annual_fixed">
                                {getFeeHeadApplicationLabel("annual_fixed", t)}
                              </option>
                              <option value="installment_1_only">
                                {getFeeHeadApplicationLabel("installment_1_only", t)}
                              </option>
                              <option value="split_across_installments">
                                {getFeeHeadApplicationLabel("split_across_installments", t)}
                              </option>
                              <option value="optional_per_student">
                                {getFeeHeadApplicationLabel("optional_per_student", t)}
                              </option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.chargeFrequency}
                              onChange={(event) =>
                                updateFeeHeadRow(item.rowId, {
                                  chargeFrequency: event.target.value as FeeHeadChargeFrequency,
                                })
                              }
                              className={selectClassName}
                              disabled={!canEdit}
                            >
                              <option value="one_time">
                                {getFeeHeadChargeFrequencyLabel("one_time", t)}
                              </option>
                              <option value="recurring">
                                {getFeeHeadChargeFrequencyLabel("recurring", t)}
                              </option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.isMandatory ? "yes" : "no"}
                              onChange={(event) =>
                                updateFeeHeadRow(item.rowId, {
                                  isMandatory: event.target.value === "yes",
                                })
                              }
                              className={selectClassName}
                              disabled={!canEdit}
                            >
                              <option value="yes">{t("yesMandatory")}</option>
                              <option value="no">{t("noOptional")}</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.isRefundable ? "yes" : "no"}
                              onChange={(event) =>
                                updateFeeHeadRow(item.rowId, {
                                  isRefundable: event.target.value === "yes",
                                })
                              }
                              className={selectClassName}
                              disabled={!canEdit}
                            >
                              <option value="no">{t("no")}</option>
                              <option value="yes">{t("yes")}</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.includeInWorkbookCalculation ? "yes" : "no"}
                              onChange={(event) =>
                                updateFeeHeadRow(item.rowId, {
                                  includeInWorkbookCalculation: event.target.value === "yes",
                                })
                              }
                              className={selectClassName}
                              disabled={!canEdit}
                            >
                              <option value="no">{t("calcExcluded")}</option>
                              <option value="yes">{t("calcIncludedLater")}</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.isActive ? "yes" : "no"}
                              onChange={(event) =>
                                updateFeeHeadRow(item.rowId, {
                                  isActive: event.target.value === "yes",
                                })
                              }
                              className={selectClassName}
                              disabled={!canEdit}
                            >
                              <option value="yes">{t("statusActive")}</option>
                              <option value="no">{t("statusInactive")}</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              value={item.notes ?? ""}
                              onChange={(event) =>
                                updateFeeHeadRow(item.rowId, {
                                  notes: event.target.value || null,
                                })
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="px-4 py-3">
                            {canEdit ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => removeFeeHeadRow(item.rowId)}
                              >
                                {t("remove")}
                              </Button>
                            ) : (
                              <StatusBadge
                                label={item.isActive ? t("statusActive") : t("statusInactive")}
                                tone={item.isActive ? "good" : "warning"}
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </details>

      <details
        className={`group md:contents ${
          activeSection !== "classes" ? "md:hidden" : ""
        }`}
        open={activeSection === "classes"}
      >
        <summary className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card px-4 py-3.5 font-medium text-foreground md:hidden" onClick={() => setActiveSection("classes")}>
          <span className="flex items-center gap-2">
            <School className="size-4 text-accent" />
            {t("mobileSection3")}
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="md:contents">
          <SectionCard
            title={t("classesTitle")}
            description={t("classesDescription")}
            actions={
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px]">
                  <Label htmlFor="class-search">{t("search")}</Label>
                  <Input
                    id="class-search"
                    value={classSearch}
                    onChange={(event) => setClassSearch(event.target.value)}
                    placeholder={t("classSearchPlaceholder")}
                    className="mt-2"
                  />
                </div>
              </div>
            }
          >
            <div className="space-y-4">
              <ActionNotice state={classState} />
              <div className="space-y-3 md:hidden">
                {visibleClassRows.map((row) => (
                  <div key={`mobile-${selectedSessionLabel}-${row.label}`} className="rounded-xl border border-border bg-card p-3">
                    <p className="font-semibold text-foreground">{row.label}</p>
                    <Label className="mt-2 block" htmlFor={`class-fee-${row.label}`}>{t("annualTuitionMobileLabel")}</Label>
                    <Input
                      id={`class-fee-${row.label}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={row.annualTuition}
                      onChange={(event) =>
                        updateClassAnnualTuition(row.label, Number(event.target.value || 0))
                      }
                      disabled={!canEdit}
                      className="mt-2"
                    />
                  </div>
                ))}
              </div>
              <div className="hidden overflow-auto rounded-xl border border-border bg-card md:block">
                <table className="w-full min-w-full text-left text-sm">
                  <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">{t("tableClass")}</th>
                      <th className="px-4 py-3">{t("tableAnnualTuition")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleClassRows.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-sm text-muted-foreground">
                          {t("noClassesFound")}
                        </td>
                      </tr>
                    ) : (
                      visibleClassRows.map((row) => (
                        <tr key={`${selectedSessionLabel}-${row.label}`} className="border-t border-border">
                          <td className="px-4 py-3 font-medium text-foreground">{row.label}</td>
                          <td className="px-4 py-3">
                            <Input
                              type="number"
                              min={0}
                              value={row.annualTuition}
                              onChange={(event) =>
                                updateClassAnnualTuition(row.label, Number(event.target.value || 0))
                              }
                              disabled={!canEdit}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <AdvancedDetails
                title={t("advancedClassTitle")}
                description={t("advancedClassDescription")}
              >
                <div className="space-y-4">
                  {canEdit ? (
                    <form
                      className="rounded-xl border border-border bg-surface-2 p-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const formData = new FormData();
                        formData.set("sessionLabel", selectedSessionLabel);
                        formData.set("className", newClassName);
                        formData.set("section", "");
                        formData.set("streamName", "");
                        formData.set("sortOrder", String(classRows.length + 1));
                        formData.set("classStatus", "active");
                        formData.set("classNotes", "");
                        runSupportAction(actions.createClassAction, classState, formData, setClassState, {
                          onSuccess: () => setNewClassName(""),
                        });
                      }}
                    >
                      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                        <div>
                          <Label htmlFor="new-class-name">{t("manageClassList")}</Label>
                          <Input
                            id="new-class-name"
                            value={newClassName}
                            onChange={(event) => setNewClassName(event.target.value)}
                            placeholder={t("newClassPlaceholder")}
                            className="mt-2"
                            required
                          />
                        </div>
                        <div className="flex items-end">
                          <Button type="submit" disabled={isSupportingPending}>
                            {t("addClass")}
                          </Button>
                        </div>
                      </div>
                    </form>
                  ) : null}

                  <div className="overflow-auto rounded-xl border border-border bg-card">
                    <table className="w-full min-w-full text-left text-sm">
                      <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">{t("tableClassName")}</th>
                          <th className="px-4 py-3">{t("tableAnnualTuition")}</th>
                          <th className="px-4 py-3">{t("tableClassRecord")}</th>
                          <th className="px-4 py-3">{t("tableSavedDefault")}</th>
                          <th className="px-4 py-3">{t("tableStatus")}</th>
                          <th className="px-4 py-3">{t("tableActions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleClassRows.map((row) => {
                          const formId = row.classRecord ? `class-row-${row.classRecord.id}` : null;

                          return (
                            <tr key={`${selectedSessionLabel}-${row.label}-advanced`} className="border-t border-border align-top">
                              <td className="px-4 py-3">
                                {row.classRecord && formId ? (
                                  <form
                                    id={formId}
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      runSupportAction(
                                        actions.updateClassAction,
                                        classState,
                                        new FormData(event.currentTarget),
                                        setClassState,
                                      );
                                    }}
                                  >
                                    <input type="hidden" name="classId" value={row.classRecord.id} />
                                    <input type="hidden" name="sessionLabel" value={selectedSessionLabel} />
                                    <input type="hidden" name="section" value={row.classRecord.section ?? ""} />
                                    <input type="hidden" name="streamName" value={row.classRecord.stream_name ?? ""} />
                                    <input type="hidden" name="sortOrder" value={String(row.classRecord.sort_order)} />
                                    <input type="hidden" name="classNotes" value={row.classRecord.notes ?? ""} />
                                    <Input
                                      name="className"
                                      defaultValue={row.classRecord.class_name}
                                      disabled={!canEdit}
                                    />
                                  </form>
                                ) : (
                                  <div>
                                    <p className="font-medium text-foreground">{row.label}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{t("willBeCreatedOnApply")}</p>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">{formatInr(row.annualTuition)}</td>
                              <td className="px-4 py-3">
                                <StatusBadge
                                  label={row.hasClassRecord ? t("classExists") : t("classWillBeCreated")}
                                  tone={row.hasClassRecord ? "good" : "warning"}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge
                                  label={row.hasSavedDefault ? t("savedDefaultYes") : t("savedDefaultPending")}
                                  tone={row.hasSavedDefault ? "good" : "warning"}
                                />
                              </td>
                              <td className="px-4 py-3">
                                {row.classRecord && formId ? (
                                  <select
                                    form={formId}
                                    name="classStatus"
                                    defaultValue={row.classRecord.status}
                                    className={selectClassName}
                                    disabled={!canEdit}
                                  >
                                    <option value="active">{t("statusActive")}</option>
                                    <option value="inactive">{t("statusInactive")}</option>
                                    <option value="archived">{t("statusArchived")}</option>
                                  </select>
                                ) : (
                                  <StatusBadge label={t("pendingCreate")} tone="warning" />
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  {row.classRecord && formId ? (
                                    <>
                                      <Button type="submit" form={formId} variant="outline" disabled={!canEdit || isSupportingPending}>
                                        {t("save")}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        disabled={!canEdit || isSupportingPending}
                                        onClick={() => {
                                          const formData = new FormData();
                                          formData.set("classId", row.classRecord!.id);
                                          runSupportAction(
                                            actions.deleteClassAction,
                                            classState,
                                            formData,
                                            setClassState,
                                          );
                                        }}
                                      >
                                        {t("remove")}
                                      </Button>
                                    </>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      {t("tuitionWillSync")}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </AdvancedDetails>
            </div>
          </SectionCard>
        </div>
      </details>

      <details
        className={`group md:contents ${
          activeSection !== "transport" ? "md:hidden" : ""
        }`}
        open={activeSection === "transport"}
      >
        <summary className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card px-4 py-3.5 font-medium text-foreground md:hidden" onClick={() => setActiveSection("transport")}>
          <span className="flex items-center gap-2">
            <Bus className="size-4 text-accent" />
            {t("mobileSection4")}
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="md:contents">
          <SectionCard
            title={t("transportTitle")}
            description={t("transportDescription")}
            actions={
              <div className="min-w-[220px]">
                <Label htmlFor="route-search">{t("search")}</Label>
                <Input
                  id="route-search"
                  value={routeSearch}
                  onChange={(event) => setRouteSearch(event.target.value)}
                  placeholder={t("routeSearchPlaceholder")}
                  className="mt-2"
                />
              </div>
            }
          >
            <div className="space-y-4">
              <ActionNotice state={routeState} />
              <div className="space-y-3 md:hidden">
                {visibleRouteRows.map((row) => (
                  <div key={`mobile-route-${row.routeName}`} className="rounded-xl border border-border bg-card p-3">
                    <p className="font-semibold text-foreground">{row.routeName}</p>
                    <Label className="mt-2 block" htmlFor={`route-fee-${row.routeName}`}>{t("annualTransportMobileLabel")}</Label>
                    <Input
                      id={`route-fee-${row.routeName}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={row.annualFee}
                      onChange={(event) =>
                        updateRouteAnnualFee(row.routeName, Number(event.target.value || 0))
                      }
                      disabled={!canEdit}
                      className="mt-2"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("perInstallmentMobile", {
                        amount: formatInr(Math.floor(row.annualFee / Math.max(form.installmentDates.length, 1))),
                      })}
                    </p>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-auto rounded-xl border border-border bg-card md:block">
                <table className="w-full min-w-full text-left text-sm">
                  <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">{t("tableRoute")}</th>
                      <th className="px-4 py-3">{t("tableAnnualTransport")}</th>
                      <th className="px-4 py-3">{t("tablePerInstallment")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRouteRows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted-foreground">
                          {t("noRoutesFound")}
                        </td>
                      </tr>
                    ) : (
                      visibleRouteRows.map((row) => (
                        <tr key={row.routeName} className="border-t border-border">
                          <td className="px-4 py-3 font-medium text-foreground">{row.routeName}</td>
                          <td className="px-4 py-3">
                            <Input
                              type="number"
                              min={0}
                              value={row.annualFee}
                              onChange={(event) =>
                                updateRouteAnnualFee(row.routeName, Number(event.target.value || 0))
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            {formatInr(Math.floor(row.annualFee / Math.max(form.installmentDates.length, 1)))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <AdvancedDetails
                title={t("advancedRouteTitle")}
                description={t("advancedRouteDescription")}
              >
                <div className="space-y-4">
                  {canEdit ? (
                    <form
                      className="rounded-xl border border-border bg-surface-2 p-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const formData = new FormData();
                        formData.set("routeCode", newRouteCode);
                        formData.set("routeName", newRouteName);
                        formData.set(
                          "defaultInstallmentAmount",
                          String(Math.floor(0 / Math.max(form.installmentDates.length, 1))),
                        );
                        formData.set("routeIsActive", "yes");
                        formData.set("routeNotes", "");
                        runSupportAction(actions.createRouteAction, routeState, formData, setRouteState, {
                          onSuccess: () => {
                            setNewRouteName("");
                            setNewRouteCode("");
                          },
                        });
                      }}
                    >
                      <div className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
                        <div>
                          <Label htmlFor="new-route-code">{t("routeCodeLabel")}</Label>
                          <Input
                            id="new-route-code"
                            value={newRouteCode}
                            onChange={(event) => setNewRouteCode(event.target.value)}
                            className="mt-2"
                          />
                        </div>
                        <div>
                          <Label htmlFor="new-route-name">{t("manageRouteList")}</Label>
                          <Input
                            id="new-route-name"
                            value={newRouteName}
                            onChange={(event) => setNewRouteName(event.target.value)}
                            placeholder={t("newRoutePlaceholder")}
                            className="mt-2"
                            required
                          />
                        </div>
                        <div className="flex items-end">
                          <Button type="submit" disabled={isSupportingPending}>
                            {t("addRoute")}
                          </Button>
                        </div>
                      </div>
                    </form>
                  ) : null}

                  <div className="overflow-auto rounded-xl border border-border bg-card">
                    <table className="w-full min-w-full text-left text-sm">
                      <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">{t("tableRouteName")}</th>
                          <th className="px-4 py-3">{t("tableRouteCode")}</th>
                          <th className="px-4 py-3">{t("tableAnnualFee")}</th>
                          <th className="px-4 py-3">{t("tableStatus")}</th>
                          <th className="px-4 py-3">{t("tableActions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRouteRows.map((row) => {
                          const routeRecord = row.routeRecord;
                          const formId = routeRecord ? `route-row-${routeRecord.id}` : null;

                          return (
                            <tr key={`${row.routeName}-advanced`} className="border-t border-border align-top">
                              <td className="px-4 py-3">
                                {routeRecord && formId ? (
                                  <form
                                    id={formId}
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      runSupportAction(
                                        actions.updateRouteAction,
                                        routeState,
                                        new FormData(event.currentTarget),
                                        setRouteState,
                                      );
                                    }}
                                  >
                                    <input type="hidden" name="routeId" value={routeRecord.id} />
                                    <input type="hidden" name="routeCode" value={routeRecord.route_code ?? ""} />
                                    <input
                                      type="hidden"
                                      name="defaultInstallmentAmount"
                                      value={String(routeRecord.default_installment_amount)}
                                    />
                                    <input type="hidden" name="routeNotes" value={routeRecord.notes ?? ""} />
                                    <Input
                                      name="routeName"
                                      defaultValue={routeRecord.route_name}
                                      disabled={!canEdit}
                                    />
                                  </form>
                                ) : (
                                  <div>
                                    <p className="font-medium text-foreground">{row.routeName}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{t("willBeCreatedOnApply")}</p>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {routeRecord?.route_code ?? "-"}
                              </td>
                              <td className="px-4 py-3">{formatInr(row.annualFee)}</td>
                              <td className="px-4 py-3">
                                {routeRecord && formId ? (
                                  <select
                                    form={formId}
                                    name="routeIsActive"
                                    defaultValue={routeRecord.is_active ? "yes" : "no"}
                                    className={selectClassName}
                                    disabled={!canEdit}
                                  >
                                    <option value="yes">{t("statusActive")}</option>
                                    <option value="no">{t("statusInactive")}</option>
                                  </select>
                                ) : (
                                  <StatusBadge label={t("pendingCreate")} tone="warning" />
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  {routeRecord && formId ? (
                                    <>
                                      <Button type="submit" form={formId} variant="outline" disabled={!canEdit || isSupportingPending}>
                                        {t("save")}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        disabled={!canEdit || isSupportingPending}
                                        onClick={() => {
                                          const formData = new FormData();
                                          formData.set("routeId", routeRecord.id);
                                          runSupportAction(
                                            actions.deleteRouteAction,
                                            routeState,
                                            formData,
                                            setRouteState,
                                          );
                                        }}
                                      >
                                        {t("remove")}
                                      </Button>
                                    </>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      {t("routeFeeWillSync")}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </AdvancedDetails>
            </div>
          </SectionCard>
        </div>
      </details>

            {(isSaving || saveState.status === "preview") && saveState.preview ? (
              <div className="mt-5 rounded-xl border bg-info-soft p-4 text-sm text-info-soft-foreground">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest">
                  {t("impactPreviewHeading")}
                </p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <ReviewMetric
                    label={t("previewStudentsAffected")}
                    value={saveState.preview.studentsAffected}
                  />
                  <ReviewMetric
                    label={t("previewDuesChanging")}
                    value={
                      saveState.preview.installmentsToInsert +
                      saveState.preview.installmentsToUpdate +
                      saveState.preview.installmentsToCancel
                    }
                  />
                  <ReviewMetric
                    label={t("previewRowsKept")}
                    value={saveState.preview.blockedInstallments}
                  />
                  <ReviewMetric
                    label={t("previewStudentsInScope")}
                    value={saveState.preview.studentsInScope}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {canEdit ? (
        /* Lifted above the fixed mobile nav (z-40) — this is the ONLY save
           affordance on Fee Setup for phones and it was sitting under it. */
        <div className="sticky bottom-[var(--mobile-bottom-nav-offset,0px)] z-40 flex items-center gap-3 border-t border-border bg-card/95 p-3 backdrop-blur md:hidden print:hidden">
          <div className="flex-1">
            <SyncPill status={syncStatus} lastSavedAt={lastSavedAt} />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => submitFeeSetup("save")}
            disabled={!isDirty || isSaving}
            aria-label={t("topbarSaveAria")}
          >
            {isSaving ? t("topbarSaving") : t("mobileSave")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
