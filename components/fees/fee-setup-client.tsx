"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { MasterDataActionState } from "@/app/protected/master-data/actions";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function PreviewSummaryCard({ state }: { state: FeeSetupActionState }) {
  if (!state.preview) {
    return null;
  }

  const preview = state.preview;
  const installmentChanges =
    preview.installmentsToInsert +
    preview.installmentsToUpdate +
    preview.installmentsToCancel;

  return (
    <div className="space-y-4 rounded-[28px] border border-blue-200 bg-blue-50/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-700">
            Review, Lock & Publish
          </p>
          <h2 className="mt-2 font-heading text-xl font-semibold text-slate-950">
            Fee Setup Draft
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            This draft is ready for publishing. Only future or unpaid installment rows will change;
            paid, partial, or adjusted rows stay blocked for review.
          </p>
        </div>
        <StatusBadge label="Draft ready" tone="accent" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm">
          Students affected: <strong>{preview.studentsAffected}</strong>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm">
          Installment rows changing: <strong>{installmentChanges}</strong>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm">
          Class rows to create: <strong>{preview.classRowsCreated ?? 0}</strong>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm">
          Route rows to create: <strong>{preview.routeRowsCreated ?? 0}</strong>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm">
          Class rows to update: <strong>{preview.classRowsUpdated ?? 0}</strong>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm">
          Route rows to update: <strong>{preview.routeRowsUpdated ?? 0}</strong>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm">
          Students in scope: <strong>{preview.studentsInScope}</strong>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm">
          Blocked rows: <strong>{preview.blockedInstallments}</strong>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
          Changed items
        </p>
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
          {preview.changedFields.map((item) => (
            <div
              key={item.field}
              className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm"
            >
              <p className="font-medium text-slate-950">{item.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {item.beforeValue} {"->"} {item.afterValue}
              </p>
            </div>
          ))}
        </div>
      </div>
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
  const totalActiveFeeHeads = form.customFeeHeads.filter((item) => item.isActive).length;
  const canApply = canEdit && saveState.preview && !previewDirty;

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
        installmentDates: current.installmentDates.filter((_, currentIndex) => currentIndex !== index),
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
      <PreviewSummaryCard state={saveState} />

      {!canEdit ? (
        <div className="rounded-[26px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-900">
          Only admins can change Fee Setup. Accountant and read-only staff can review the current
          and saved session setup here.
        </div>
      ) : null}

      {previewDirty ? (
        <div className="rounded-[26px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-900">
          The draft is now out of date. Save Draft Review again before you publish the live setup.
        </div>
      ) : null}

      <div className="rounded-[26px] border border-sky-200 bg-sky-50/90 px-4 py-3 text-sm leading-6 text-sky-900">
        For trial runs, create or copy a test session named TEST-2026-27 before entering real
        records. Do not change the actual AY 2026-27 defaults just to test the workflow.
      </div>

      <SectionCard
        title="1. Academic Session"
        description="Choose the session to work on, add a new session, or copy last year. Selecting a session here edits the draft target only; the live setup changes only after Publish Live Setup."
        actions={
          <div className="min-w-[240px]">
            <Label htmlFor="selected-session">Selected session</Label>
            <select
              id="selected-session"
              value={selectedSessionLabel}
              onChange={(event) => switchSession(event.target.value)}
              className={`${selectClassName} mt-2`}
            >
              {sessionRows.map((item) => (
                <option key={item.id} value={item.session_label}>
                  {item.session_label}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="space-y-4">
          <ActionNotice state={sessionState} />

          {canEdit ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <form
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  runSupportAction(actions.createSessionAction, sessionState, formData, setSessionState, {
                    onSuccess: () => setNewSessionLabel(""),
                  });
                }}
              >
                <p className="text-sm font-semibold text-slate-950">Add session</p>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_140px]">
                  <div>
                    <Label htmlFor="new-session-label">Session label</Label>
                    <Input
                      id="new-session-label"
                      name="sessionLabel"
                      value={newSessionLabel}
                      onChange={(event) => setNewSessionLabel(event.target.value)}
                      placeholder="2027-28"
                      className="mt-2"
                      required
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <select name="sessionStatus" defaultValue="active" className={`${selectClassName} mt-2`}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
                <input type="hidden" name="isCurrentSession" value="no" />
                <input type="hidden" name="sessionNotes" value="" />
                <Button type="submit" className="mt-4" disabled={isSupportingPending}>
                  Add
                </Button>
              </form>

              <form
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  runSupportAction(actions.copySessionAction, sessionState, formData, setSessionState, {
                    onSuccess: () => setCopyTargetSessionLabel(""),
                  });
                }}
              >
                <p className="text-sm font-semibold text-slate-950">Copy setup</p>
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
                    <Label htmlFor="target-session-label">New session</Label>
                    <Input
                      id="target-session-label"
                      name="targetSessionLabel"
                      value={copyTargetSessionLabel}
                      onChange={(event) => setCopyTargetSessionLabel(event.target.value)}
                      placeholder="2027-28"
                      className="mt-2"
                      required
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  This copies the latest fee-policy snapshot and class fee rows into a new session.
                  The copied session still goes live only after Publish Live Setup.
                </p>
                <Button type="submit" className="mt-4" variant="outline" disabled={isSupportingPending}>
                  Copy Setup
                </Button>
              </form>
            </div>
          ) : null}

          <div className="overflow-auto rounded-[26px] border border-slate-200 bg-white">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Policy</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessionRows.map((item) => {
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
                            <StatusBadge label="Current" tone="good" />
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
                            Work on this session
                          </Button>
                          {canEdit ? (
                            <>
                              <Button type="submit" form={formId} variant="outline" disabled={isSupportingPending}>
                                Save
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
                                Archive
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
                                Delete unused session
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="2. Master Fee Heads"
        description="Maintain the selected session's fee-head building blocks. Phase 1 stores these details in the existing policy JSON; workbook AY 2026-27 calculations are unchanged."
        actions={
          canEdit ? (
            <Button type="button" variant="outline" onClick={addFeeHeadRow}>
              Add fee head
            </Button>
          ) : null
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            Books and optional fee-head metadata stay outside the AY 2026-27 workbook calculation
            unless the school explicitly changes that rule later.
          </div>

          {form.customFeeHeads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              No extra fee heads are configured for this session yet.
            </div>
          ) : (
            <div className="overflow-auto rounded-[26px] border border-slate-200 bg-white">
              <table className="w-full min-w-[1540px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
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
      </SectionCard>

      <SectionCard
        title="3. Session Policy, Installments & Standard Concessions"
        description="Set the canonical policy values for the selected academic session. Concession profiles are shown as planned Phase 2 structure only."
        actions={<StatusBadge label={selectedSessionLabel} tone="accent" />}
      >
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                Installments configured: <strong>{form.installmentDates.length}</strong>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                Fee heads configured: <strong>{form.customFeeHeads.length}</strong>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                Selected session: <strong>{selectedSessionLabel}</strong>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Installment due dates</p>
                  <p className="text-sm text-slate-600">
                    Add or remove rows to change the installment count for this session.
                  </p>
                </div>
                {canEdit ? (
                  <Button type="button" variant="outline" onClick={addInstallmentDate}>
                    Add installment
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {form.installmentDates.map((value, index) => (
                  <div key={`installment-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
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
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Late fee</p>
                <p className="text-sm text-slate-600">Keep it on or turn it off for this session.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!canEdit}
                onClick={() => {
                  setForm((current) => ({
                    ...current,
                    lateFeeFlatAmount: current.lateFeeFlatAmount > 0 ? 0 : 1000,
                  }));
                  markDirty();
                }}
              >
                {form.lateFeeFlatAmount > 0 ? "Disable" : "Enable"}
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="late-fee-amount">Late fee amount</Label>
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
                  disabled={!canEdit || form.lateFeeFlatAmount === 0}
                />
              </div>
              <div>
                <Label htmlFor="new-academic-fee">New student academic fee</Label>
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
                <Label htmlFor="old-academic-fee">Old student academic fee</Label>
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
          </div>
        </div>

        <div className="mt-4 rounded-[26px] border border-dashed border-slate-300 bg-slate-50/80 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Standard Concessions</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Planned concession profiles are shown for office clarity only in Phase 1. Student
                discounts and overrides continue to use the existing approved override workflow.
              </p>
            </div>
            <StatusBadge label="Planned" tone="neutral" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {["Staff Ward", "RTE", "Sibling Discount", "Custom school-approved profile"].map(
              (label) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                  {label}
                </div>
              ),
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="4. Class-wise Fee Mapping"
        description="Manage classes for the selected session and set annual tuition defaults in one reviewable grid."
        actions={
          <div className="w-full min-w-[240px] max-w-sm">
            <Label htmlFor="class-search">Search classes</Label>
            <Input
              id="class-search"
              value={classSearch}
              onChange={(event) => setClassSearch(event.target.value)}
              placeholder="Type class name"
              className="mt-2"
            />
          </div>
        }
      >
        <div className="space-y-4">
          <ActionNotice state={classState} />

          {canEdit ? (
            <form
              className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
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
                  <Label htmlFor="new-class-name">Add class</Label>
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
                    Add row
                  </Button>
                </div>
              </div>
            </form>
          ) : null}

          <div className="overflow-auto rounded-[26px] border border-slate-200 bg-white">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
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
                    <tr key={`${selectedSessionLabel}-${row.label}`} className="border-t border-slate-100 align-top">
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
                              Tuition will save when you apply the live setup.
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
      </SectionCard>

      <SectionCard
        title="5. Route / Transport Fees"
        description="Keep transport routes separate from class tuition and set annual route fees in one list."
        actions={
          <div className="w-full min-w-[240px] max-w-sm">
            <Label htmlFor="route-search">Search routes</Label>
            <Input
              id="route-search"
              value={routeSearch}
              onChange={(event) => setRouteSearch(event.target.value)}
              placeholder="Type route name"
              className="mt-2"
            />
          </div>
        }
      >
        <div className="space-y-4">
          <ActionNotice state={routeState} />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            Transport pricing is independent of class tuition. The installment amount below is
            derived from the selected session&apos;s current installment count.
          </div>

          {canEdit ? (
            <form
              className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
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
                  <Label htmlFor="new-route-name">Add route</Label>
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
                    Add row
                  </Button>
                </div>
              </div>
            </form>
          ) : null}

          <div className="overflow-auto rounded-[26px] border border-slate-200 bg-white">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Route Name</th>
                  <th className="px-4 py-3">Annual Transport Fee</th>
                  <th className="px-4 py-3">Derived Installment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRouteRows.map((row) => {
                  const routeRecord = row.routeRecord;
                  const formId = routeRecord ? `route-row-${routeRecord.id}` : null;

                  return (
                    <tr key={row.routeName} className="border-t border-slate-100 align-top">
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
                        Rs {Math.floor(row.annualFee / Math.max(form.installmentDates.length, 1))}
                      </td>
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
                              Route fee will save when you apply the live setup.
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
      </SectionCard>

      <SectionCard
        title="6. Review, Lock & Publish"
        description="Use Save Draft Review to create an audited change batch, then publish live only after checking the impact summary."
      >
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              Draft session target: <strong>{selectedSessionLabel}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              Installment count: <strong>{form.installmentDates.length}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              Late fee:{" "}
              <strong>{form.lateFeeFlatAmount > 0 ? `Rs ${form.lateFeeFlatAmount}` : "Disabled"}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              New student academic fee: <strong>Rs {form.newStudentAcademicFeeAmount}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              Old student academic fee: <strong>Rs {form.oldStudentAcademicFeeAmount}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              Fee heads configured: <strong>{form.customFeeHeads.length}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              Total classes configured: <strong>{classRows.length}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              Total routes configured: <strong>{routeRows.length}</strong>
            </div>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-950">Due dates</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {form.installmentDates.map((item, index) => (
                <StatusBadge
                  key={`${item}-${index}`}
                  label={`Installment ${index + 1}: ${item || "Not set"}`}
                  tone="neutral"
                />
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {canEdit ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => submitFeeSetup("preview")}
                    disabled={!canEdit || isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Draft Review"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => submitFeeSetup("apply")}
                    disabled={!canApply || isSaving}
                  >
                    {isSaving ? "Publishing..." : "Publish Live Setup"}
                  </Button>
                </>
              ) : (
                <p className="text-sm leading-6 text-slate-600">
                  View-only users can review the saved session setup, but only admins can save or
                  apply changes.
                </p>
              )}
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              Publishing keeps payments, receipts, adjustments, and audit logs append-only. Only
              future or unpaid installment rows may change; paid, partial, or adjusted rows are
              blocked and logged for review.
            </p>
            {selectedPolicySnapshot?.id ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Last saved session snapshot: {formatDateTime(selectedPolicySnapshot.updatedAt ?? null)}
              </p>
            ) : null}
            {totalActiveFeeHeads > 0 ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Active fee heads in this session:{" "}
                {form.customFeeHeads
                  .filter((item) => item.isActive)
                  .map((item) => `${item.label} (${getFeeHeadApplicationLabel(item.applicationType)})`)
                  .join(", ")}
              </p>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
