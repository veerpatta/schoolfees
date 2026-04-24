"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { MasterDataActionState } from "@/app/protected/master-data/actions";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isTestAcademicSessionLabel } from "@/lib/config/fee-rules";
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

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input/80 bg-white/88 px-3.5 py-2 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-[border-color,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50";

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
  actions: {
    createSessionAction: MasterDataActionFn;
    updateSessionAction: MasterDataActionFn;
    deleteSessionAction: MasterDataActionFn;
    copySessionAction: MasterDataActionFn;
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

type SessionFormState = {
  academicSessionLabel: string;
  installmentDates: string[];
  lateFeeFlatAmount: number;
  newStudentAcademicFeeAmount: number;
  oldStudentAcademicFeeAmount: number;
  customFeeHeads: FeeHeadRow[];
  classRows: Array<{
    label: string;
    annualTuition: number;
  }>;
  routeRows: Array<{
    routeName: string;
    annualFee: number;
  }>;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not saved yet";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(parsed);
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

function formatDateOnly(value: string) {
  if (!value) {
    return "Not set";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(parsed);
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
    customFeeHeads: snapshot.customFeeHeads.map((item, index) => buildFeeHeadRow(item, index)),
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
      ? "border-red-200 bg-red-50 text-red-700"
      : state.status === "preview"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClassName}`}>
      {state.message}
    </div>
  );
}

function createWorkbookFormData(
  form: SessionFormState,
  intent: "preview" | "apply",
  changeBatchId: string | null,
) {
  const formData = new FormData();
  formData.set("academicSessionLabel", form.academicSessionLabel);
  formData.set("lateFeeFlatAmount", String(form.lateFeeFlatAmount));
  formData.set("newStudentAcademicFeeAmount", String(form.newStudentAcademicFeeAmount));
  formData.set("oldStudentAcademicFeeAmount", String(form.oldStudentAcademicFeeAmount));
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

function getFeeHeadApplicationLabel(value: FeeHeadApplicationType) {
  switch (value) {
    case "installment_1_only":
      return "Installment 1 only";
    case "split_across_installments":
      return "Evenly split";
    case "optional_per_student":
      return "Optional / per-student";
    default:
      return "Annual fixed";
  }
}

function getFeeHeadChargeFrequencyLabel(value: FeeHeadChargeFrequency) {
  return value === "recurring" ? "Recurring" : "One-time";
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
        done
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      <span
        className={`size-2 rounded-full ${done ? "bg-emerald-500" : "bg-slate-300"}`}
      />
      {label}
    </div>
  );
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
    <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
        {title}
        {description ? (
          <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
            {description}
          </span>
        ) : null}
      </summary>
      <div className="border-t border-slate-200 p-4">{children}</div>
    </details>
  );
}

function ReviewMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export function FeeSetupClient({
  data,
  masterData,
  canEdit,
  saveWorkbookFeeSetupAction,
  initialState,
  initialMasterDataState,
  actions,
}: FeeSetupClientProps) {
  const router = useRouter();
  const [selectedSessionLabel, setSelectedSessionLabel] = useState(
    data.globalPolicy.academicSessionLabel,
  );
  const [form, setForm] = useState<SessionFormState>(() =>
    buildSessionFormState(data, data.globalPolicy.academicSessionLabel),
  );
  const [saveState, setSaveState] = useState(initialState);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [sessionState, setSessionState] = useState(initialMasterDataState);
  const [classState, setClassState] = useState(initialMasterDataState);
  const [routeState, setRouteState] = useState(initialMasterDataState);
  const [classSearch, setClassSearch] = useState("");
  const [routeSearch, setRouteSearch] = useState("");
  const [newSessionLabel, setNewSessionLabel] = useState("");
  const [copyTargetSessionLabel, setCopyTargetSessionLabel] = useState("");
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
    setForm(buildSessionFormState(data, nextSessionLabel));
    setSaveState(initialState);
    setPreviewDirty(false);
  }, [data, initialState, masterData.sessions, selectedSessionLabel]);

  function markDirty() {
    if (saveState.status === "preview") {
      setPreviewDirty(true);
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

  function submitFeeSetup(intent: "preview" | "apply") {
    startSaving(async () => {
      const result = await saveWorkbookFeeSetupAction(
        saveState,
        createWorkbookFormData(form, intent, saveState.changeBatchId),
      );

      setSaveState(result);

      if (result.status === "preview") {
        setPreviewDirty(false);
      }

      if (result.status === "success") {
        setPreviewDirty(false);
        router.refresh();
      }
    });
  }

  const sessionRows = masterData.sessions;
  const selectedSessionIsTest = isTestSessionLabel(selectedSessionLabel);
  const selectedPolicySnapshot = data.policySnapshots.find(
    (item) => item.academicSessionLabel === selectedSessionLabel,
  );
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
  const preview = saveState.preview;
  const installmentChanges = preview
    ? preview.installmentsToInsert +
      preview.installmentsToUpdate +
      preview.installmentsToCancel
    : 0;
  const canApply = canEdit && Boolean(preview) && !previewDirty;
  const feeRulesEntered =
    form.installmentDates.length > 0 &&
    form.installmentDates.every(Boolean) &&
    form.lateFeeFlatAmount >= 0 &&
    form.newStudentAcademicFeeAmount >= 0 &&
    form.oldStudentAcademicFeeAmount >= 0;
  const classFeesEntered = classRows.length > 0;
  const transportFeesEntered = routeRows.length > 0;

  function updateInstallmentDate(index: number, value: string) {
    setForm((current) => {
      const nextDates = [...current.installmentDates];
      nextDates[index] = value;

      return {
        ...current,
        installmentDates: nextDates,
      };
    });
    markDirty();
  }

  function addInstallmentDate() {
    setForm((current) => ({
      ...current,
      installmentDates: [...current.installmentDates, ""],
    }));
    markDirty();
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
    markDirty();
  }

  function updateClassAnnualTuition(label: string, annualTuition: number) {
    setForm((current) => ({
      ...current,
      classRows: current.classRows.map((item) =>
        item.label === label ? { ...item, annualTuition } : item,
      ),
    }));
    markDirty();
  }

  function updateRouteAnnualFee(routeName: string, annualFee: number) {
    setForm((current) => ({
      ...current,
      routeRows: current.routeRows.map((item) =>
        item.routeName === routeName ? { ...item, annualFee } : item,
      ),
    }));
    markDirty();
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
    markDirty();
  }

  function updateFeeHeadRow(rowId: string, patch: Partial<FeeHeadRow>) {
    setForm((current) => ({
      ...current,
      customFeeHeads: current.customFeeHeads.map((item) =>
        item.rowId === rowId ? { ...item, ...patch } : item,
      ),
    }));
    markDirty();
  }

  function removeFeeHeadRow(rowId: string) {
    setForm((current) => ({
      ...current,
      customFeeHeads: current.customFeeHeads.filter((item) => item.rowId !== rowId),
    }));
    markDirty();
  }

  function switchSession(sessionLabel: string) {
    setSelectedSessionLabel(sessionLabel);
    setForm(buildSessionFormState(data, sessionLabel));
    setSaveState(initialState);
    setPreviewDirty(false);
  }

  return (
    <div className="space-y-6">
      <ActionNotice state={saveState} />

      {!canEdit ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Only admins can change Fee Setup. Accountant and read-only staff can review the current
          and saved setup here.
        </div>
      ) : null}

      {previewDirty ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Changes were made after preview. Preview again before publishing.
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <ChecklistItem done={Boolean(selectedSessionLabel)} label="Academic year selected" />
          <ChecklistItem done={feeRulesEntered} label="Fee rules entered" />
          <ChecklistItem done={classFeesEntered} label="Class fees entered" />
          <ChecklistItem done={transportFeesEntered} label="Transport fees entered" />
          <ChecklistItem done={saveState.status === "preview" && !previewDirty} label="Preview checked" />
          <ChecklistItem done={saveState.status === "success"} label="Published" />
        </div>
      </div>

      <SectionCard
        title="1. Academic Year"
        description="Choose the year to set up. Copy or create a year here; maintenance stays below."
        actions={
          <div className="min-w-[240px]">
            <Label htmlFor="selected-session">Academic year</Label>
            <select
              id="selected-session"
              value={selectedSessionLabel}
              onChange={(event) => switchSession(event.target.value)}
              className={`${selectClassName} mt-2`}
            >
              {sessionRows.length === 0 ? (
                <option value="">Create Academic Year</option>
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
          <ActionNotice state={sessionState} />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={`Live session: ${currentSessionLabel}`} tone="good" />
            {selectedSessionLabel && selectedSessionLabel !== currentSessionLabel ? (
              <StatusBadge label={`Editing: ${selectedSessionLabel}`} tone="accent" />
            ) : null}
            {selectedSessionIsTest ? (
              <StatusBadge label="Test session" tone="warning" />
            ) : null}
          </div>

          {selectedSessionIsTest ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              This is a test academic year. Do not mix real students or real payments into test
              records.
            </div>
          ) : null}

          {canEdit ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <form
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  runSupportAction(actions.copySessionAction, sessionState, formData, setSessionState, {
                    onSuccess: () => setCopyTargetSessionLabel(""),
                  });
                }}
              >
                <p className="text-sm font-semibold text-slate-950">Copy Previous Year</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor="source-session-label">Copy from</Label>
                    <select
                      id="source-session-label"
                      name="sourceSessionLabel"
                      defaultValue={selectedSessionLabel}
                      className={`${selectClassName} mt-2`}
                    >
                      {sessionRows.map((item) => (
                        <option key={item.id} value={item.session_label}>
                          {item.session_label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="target-session-label">New academic year</Label>
                    <Input
                      id="target-session-label"
                      name="targetSessionLabel"
                      value={copyTargetSessionLabel}
                      onChange={(event) => setCopyTargetSessionLabel(event.target.value)}
                      placeholder="TEST-2026-27"
                      className="mt-2"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="mt-4" variant="outline" disabled={isSupportingPending}>
                  Copy Previous Year
                </Button>
              </form>

              <form
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  runSupportAction(actions.createSessionAction, sessionState, formData, setSessionState, {
                    onSuccess: () => setNewSessionLabel(""),
                  });
                }}
              >
                <p className="text-sm font-semibold text-slate-950">Create New Year</p>
                <div className="mt-3">
                  <Label htmlFor="new-session-label">Academic year</Label>
                  <Input
                    id="new-session-label"
                    name="sessionLabel"
                    value={newSessionLabel}
                    onChange={(event) => setNewSessionLabel(event.target.value)}
                    placeholder="TEST-2026-27"
                    className="mt-2"
                    required
                  />
                </div>
                <input type="hidden" name="sessionStatus" value="active" />
                <input type="hidden" name="isCurrentSession" value="no" />
                <input type="hidden" name="sessionNotes" value="" />
                <Button type="submit" className="mt-4" disabled={isSupportingPending}>
                  Create New Year
                </Button>
              </form>
            </div>
          ) : null}

          <AdvancedDetails
            title="Advanced academic-year options"
            description="Archive old sessions, delete unused sessions, and review saved setup metadata."
          >
            <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[940px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Session</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Policy</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                        Create Academic Year
                      </td>
                    </tr>
                  ) : (
                    sessionRows.map((item) => {
                      const formId = `session-row-${item.id}`;
                      const snapshot = data.policySnapshots.find(
                        (policy) => policy.academicSessionLabel === item.session_label,
                      );

                      return (
                        <tr key={item.id} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3">
                            <form
                              id={formId}
                              onSubmit={(event) => {
                                event.preventDefault();
                                runSupportAction(
                                  actions.updateSessionAction,
                                  sessionState,
                                  new FormData(event.currentTarget),
                                  setSessionState,
                                );
                              }}
                            >
                              <input type="hidden" name="sessionId" value={item.id} />
                              <input type="hidden" name="isCurrentSession" value={item.is_current ? "yes" : "no"} />
                              <input type="hidden" name="sessionNotes" value={item.notes ?? ""} />
                              <Input
                                name="sessionLabel"
                                defaultValue={item.session_label}
                                disabled={!canEdit}
                              />
                            </form>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {item.session_label === currentSessionLabel ? (
                                <StatusBadge label="Live" tone="good" />
                              ) : null}
                              {item.session_label === selectedSessionLabel ? (
                                <StatusBadge label="Selected" tone="accent" />
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              form={formId}
                              name="sessionStatus"
                              defaultValue={item.status}
                              className={selectClassName}
                              disabled={!canEdit}
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                              <option value="archived">Archived</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {snapshot ? (
                              <div className="space-y-1">
                                <p className="font-medium text-slate-950">
                                  {snapshot.installmentCount} installments
                                </p>
                                <p>{snapshot.customFeeHeads.filter((head) => head.isActive).length} fee heads</p>
                              </div>
                            ) : (
                              <span>No saved setup yet</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatDateTime(snapshot?.updatedAt ?? item.updated_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant={item.session_label === selectedSessionLabel ? "default" : "outline"}
                                onClick={() => switchSession(item.session_label)}
                              >
                                Work on this year
                              </Button>
                              {canEdit ? (
                                <>
                                  <Button type="submit" form={formId} variant="outline" disabled={isSupportingPending}>
                                    Save session row
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={isSupportingPending || item.status === "archived"}
                                    onClick={() => {
                                      const formData = new FormData();
                                      formData.set("sessionId", item.id);
                                      formData.set("sessionLabel", item.session_label);
                                      formData.set("sessionStatus", "archived");
                                      formData.set("isCurrentSession", item.is_current ? "yes" : "no");
                                      formData.set("sessionNotes", item.notes ?? "");
                                      runSupportAction(
                                        actions.updateSessionAction,
                                        sessionState,
                                        formData,
                                        setSessionState,
                                      );
                                    }}
                                  >
                                    Archive old session
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={isSupportingPending}
                                    onClick={() => {
                                      const formData = new FormData();
                                      formData.set("sessionId", item.id);
                                      runSupportAction(
                                        actions.deleteSessionAction,
                                        sessionState,
                                        formData,
                                        setSessionState,
                                      );
                                    }}
                                  >
                                    Delete unused session only
                                  </Button>
                                </>
                              ) : null}
                            </div>
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

      <SectionCard
        title="2. Basic Fee Rules"
        description="Set installment dates, late fee, and the annual academic fee for new and existing students."
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Installment Dates</p>
                <p className="text-sm text-slate-600">These dates define this academic year&apos;s fee schedule.</p>
              </div>
              {canEdit ? (
                <Button type="button" variant="outline" onClick={addInstallmentDate}>
                  Add installment
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {form.installmentDates.map((value, index) => (
                <div key={`installment-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`installment-date-${index}`}>Installment {index + 1}</Label>
                    {canEdit && form.installmentDates.length > 1 ? (
                      <Button type="button" variant="ghost" onClick={() => removeInstallmentDate(index)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    id={`installment-date-${index}`}
                    type="date"
                    value={value}
                    onChange={(event) => updateInstallmentDate(index, event.target.value)}
                    className="mt-2"
                    disabled={!canEdit}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="late-fee-amount">Late Fee</Label>
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
                  markDirty();
                }}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="new-academic-fee">New Student Annual/Academic Fee</Label>
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
                  markDirty();
                }}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="old-academic-fee">Existing Student Annual/Academic Fee</Label>
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
                  markDirty();
                }}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
          </div>

          <AdvancedDetails
            title="Advanced fee-head options"
            description="Most schools do not need this during normal yearly fee setup."
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                Most schools do not need this during normal yearly fee setup. AY 2026-27 workbook
                calculation still uses tuition, transport, academic fee, and signed other adjustment.
              </div>
              {canEdit ? (
                <Button type="button" variant="outline" onClick={addFeeHeadRow}>
                  Add fee head
                </Button>
              ) : null}
              {form.customFeeHeads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  No extra fee heads are configured for this session yet.
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full min-w-[1540px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Fee Head Name</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Application Type</th>
                        <th className="px-4 py-3">Frequency</th>
                        <th className="px-4 py-3">Mandatory</th>
                        <th className="px-4 py-3">Refundable</th>
                        <th className="px-4 py-3">Workbook Calc</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Notes</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.customFeeHeads.map((item) => (
                        <tr key={item.rowId} className="border-t border-slate-100 align-top">
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
                                {getFeeHeadApplicationLabel("annual_fixed")}
                              </option>
                              <option value="installment_1_only">
                                {getFeeHeadApplicationLabel("installment_1_only")}
                              </option>
                              <option value="split_across_installments">
                                {getFeeHeadApplicationLabel("split_across_installments")}
                              </option>
                              <option value="optional_per_student">
                                {getFeeHeadApplicationLabel("optional_per_student")}
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
                                {getFeeHeadChargeFrequencyLabel("one_time")}
                              </option>
                              <option value="recurring">
                                {getFeeHeadChargeFrequencyLabel("recurring")}
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
                              <option value="yes">Mandatory</option>
                              <option value="no">Optional</option>
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
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
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
                              <option value="no">Excluded</option>
                              <option value="yes">Included later</option>
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
                              <option value="yes">Active</option>
                              <option value="no">Inactive</option>
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
                                Remove
                              </Button>
                            ) : (
                              <StatusBadge
                                label={item.isActive ? "Active" : "Inactive"}
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
          </AdvancedDetails>
        </div>
      </SectionCard>

      <SectionCard
        title="3. Class Fees"
        description="Enter the annual tuition fee for each class."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px]">
              <Label htmlFor="class-search">Search</Label>
              <Input
                id="class-search"
                value={classSearch}
                onChange={(event) => setClassSearch(event.target.value)}
                placeholder="Class name"
                className="mt-2"
              />
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <ActionNotice state={classState} />
          <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Annual Tuition Fee</th>
                </tr>
              </thead>
              <tbody>
                {visibleClassRows.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-sm text-slate-500">
                      No classes found. Add classes from School Lists or First-time Setup.
                    </td>
                  </tr>
                ) : (
                  visibleClassRows.map((row) => (
                    <tr key={`${selectedSessionLabel}-${row.label}`} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-950">{row.label}</td>
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
            title="Advanced class-list options"
            description="Manage class list, status, and unused rows."
          >
            <div className="space-y-4">
              {canEdit ? (
                <form
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
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
                      <Label htmlFor="new-class-name">Manage class list</Label>
                      <Input
                        id="new-class-name"
                        value={newClassName}
                        onChange={(event) => setNewClassName(event.target.value)}
                        placeholder="Class 11 Humanities"
                        className="mt-2"
                        required
                      />
                    </div>
                    <div className="flex items-end">
                      <Button type="submit" disabled={isSupportingPending}>
                        Add class
                      </Button>
                    </div>
                  </div>
                </form>
              ) : null}

              <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[1040px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Class Name</th>
                      <th className="px-4 py-3">Annual Tuition Fee</th>
                      <th className="px-4 py-3">Class Record</th>
                      <th className="px-4 py-3">Saved Default</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleClassRows.map((row) => {
                      const formId = row.classRecord ? `class-row-${row.classRecord.id}` : null;

                      return (
                        <tr key={`${selectedSessionLabel}-${row.label}-advanced`} className="border-t border-slate-100 align-top">
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
                                <p className="font-medium text-slate-950">{row.label}</p>
                                <p className="mt-1 text-xs text-slate-500">Will be created on apply</p>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">{formatInr(row.annualTuition)}</td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              label={row.hasClassRecord ? "Exists" : "Will be created"}
                              tone={row.hasClassRecord ? "good" : "warning"}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              label={row.hasSavedDefault ? "Saved" : "Pending default"}
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
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                                <option value="archived">Archived</option>
                              </select>
                            ) : (
                              <StatusBadge label="Pending create" tone="warning" />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {row.classRecord && formId ? (
                                <>
                                  <Button type="submit" form={formId} variant="outline" disabled={!canEdit || isSupportingPending}>
                                    Save
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
                                    Remove
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-slate-500">
                                  Tuition will save when you publish.
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

      <SectionCard
        title="4. Transport Fees"
        description="Enter the annual transport fee for each route. Leave transport blank if the school is not using route fees."
        actions={
          <div className="min-w-[220px]">
            <Label htmlFor="route-search">Search</Label>
            <Input
              id="route-search"
              value={routeSearch}
              onChange={(event) => setRouteSearch(event.target.value)}
              placeholder="Route name"
              className="mt-2"
            />
          </div>
        }
      >
        <div className="space-y-4">
          <ActionNotice state={routeState} />
          <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Annual Transport Fee</th>
                  <th className="px-4 py-3">Per installment</th>
                </tr>
              </thead>
              <tbody>
                {visibleRouteRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-500">
                      No transport routes found. Add routes from School Lists, or leave transport
                      blank if not used.
                    </td>
                  </tr>
                ) : (
                  visibleRouteRows.map((row) => (
                    <tr key={row.routeName} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-950">{row.routeName}</td>
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
                      <td className="px-4 py-3 text-slate-700">
                        {formatInr(Math.floor(row.annualFee / Math.max(form.installmentDates.length, 1)))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <AdvancedDetails
            title="Advanced route-list options"
            description="Manage route names, route codes, status, and unused routes."
          >
            <div className="space-y-4">
              {canEdit ? (
                <form
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
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
                      <Label htmlFor="new-route-code">Route code</Label>
                      <Input
                        id="new-route-code"
                        value={newRouteCode}
                        onChange={(event) => setNewRouteCode(event.target.value)}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-route-name">Manage route list</Label>
                      <Input
                        id="new-route-name"
                        value={newRouteName}
                        onChange={(event) => setNewRouteName(event.target.value)}
                        placeholder="Amet Bus"
                        className="mt-2"
                        required
                      />
                    </div>
                    <div className="flex items-end">
                      <Button type="submit" disabled={isSupportingPending}>
                        Add route
                      </Button>
                    </div>
                  </div>
                </form>
              ) : null}

              <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Route Name</th>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Annual Fee</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRouteRows.map((row) => {
                      const routeRecord = row.routeRecord;
                      const formId = routeRecord ? `route-row-${routeRecord.id}` : null;

                      return (
                        <tr key={`${row.routeName}-advanced`} className="border-t border-slate-100 align-top">
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
                                <p className="font-medium text-slate-950">{row.routeName}</p>
                                <p className="mt-1 text-xs text-slate-500">Will be created on apply</p>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
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
                                <option value="yes">Active</option>
                                <option value="no">Inactive</option>
                              </select>
                            ) : (
                              <StatusBadge label="Pending create" tone="warning" />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {routeRecord && formId ? (
                                <>
                                  <Button type="submit" form={formId} variant="outline" disabled={!canEdit || isSupportingPending}>
                                    Save
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
                                    Remove
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-slate-500">
                                  Route fee will save when you publish.
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

      <SectionCard
        title="5. Review & Publish"
        description="Preview the impact first, then publish only when the review looks correct."
      >
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ReviewMetric label="Academic year" value={selectedSessionLabel || "Not selected"} />
            <ReviewMetric label="Installment dates" value={form.installmentDates.map(formatDateOnly).join(", ")} />
            <ReviewMetric label="Late fee" value={formatInr(form.lateFeeFlatAmount)} />
            <ReviewMetric label="New student fee" value={formatInr(form.newStudentAcademicFeeAmount)} />
            <ReviewMetric label="Existing student fee" value={formatInr(form.oldStudentAcademicFeeAmount)} />
            <ReviewMetric label="Class fee rows" value={classRows.length} />
            <ReviewMetric label="Transport routes" value={routeRows.length} />
            <ReviewMetric label="Preview status" value={preview ? "Preview ready" : "Preview changes before publishing."} />
          </div>

          {preview ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <ReviewMetric label="Students affected" value={preview.studentsAffected} />
                <ReviewMetric label="Installment rows changing" value={installmentChanges} />
                <ReviewMetric label="Blocked rows" value={preview.blockedInstallments} />
                <ReviewMetric label="Students in scope" value={preview.studentsInScope} />
              </div>
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-950">Changed fields summary</p>
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {preview.changedFields.length === 0 ? (
                    <div className="rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-600">
                      No changed fields in this preview.
                    </div>
                  ) : (
                    preview.changedFields.map((item) => (
                      <div
                        key={item.field}
                        className="rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm"
                      >
                        <p className="font-medium text-slate-950">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {item.beforeValue} {"->"} {item.afterValue}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              Preview changes before publishing.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              Publishing keeps payments, receipts, adjustments, and audit logs append-only. Only
              future or unpaid installment rows may change; paid, partial, or adjusted rows are
              blocked and logged for review.
            </p>
            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => submitFeeSetup("preview")}
                    disabled={!canEdit || isSaving}
                  >
                    {isSaving ? "Previewing..." : "Preview Changes"}
                  </Button>
                  {preview ? (
                    <Button
                      type="button"
                      onClick={() => submitFeeSetup("apply")}
                      disabled={!canApply || isSaving}
                    >
                      {isSaving ? "Publishing..." : "Publish Fee Setup"}
                    </Button>
                  ) : null}
                </>
              ) : (
                <p className="text-sm leading-6 text-slate-600">
                  View-only users can review the setup. Only admins can publish changes.
                </p>
              )}
            </div>
          </div>

          {selectedPolicySnapshot?.id ? (
            <p className="text-xs leading-5 text-slate-500">
              Last saved session snapshot: {formatDateTime(selectedPolicySnapshot.updatedAt ?? null)}
            </p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
