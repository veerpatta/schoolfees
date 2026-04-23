"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildWorkbookClassSetupRows,
  buildWorkbookRouteSetupRows,
  type WorkbookFeeSetupFormPayload,
} from "@/lib/fees/workbook-setup";
import type { FeeSetupActionState, FeeSetupPageData } from "@/lib/fees/types";

type FeeSetupClientProps = {
  data: FeeSetupPageData;
  canEdit: boolean;
  saveWorkbookFeeSetupAction: (
    previous: FeeSetupActionState,
    formData: FormData,
  ) => Promise<FeeSetupActionState>;
  initialState: FeeSetupActionState;
};

function buildInitialFormState(data: FeeSetupPageData): WorkbookFeeSetupFormPayload {
  return {
    academicSessionLabel: data.globalPolicy.academicSessionLabel,
    installmentDates: data.globalPolicy.installmentSchedule.map((item) => item.dueDate),
    lateFeeFlatAmount: data.globalPolicy.lateFeeFlatAmount,
    newStudentAcademicFeeAmount: data.globalPolicy.newStudentAcademicFeeAmount,
    oldStudentAcademicFeeAmount: data.globalPolicy.oldStudentAcademicFeeAmount,
    classRows: buildWorkbookClassSetupRows(
      data,
      data.globalPolicy.academicSessionLabel,
    ).map((item) => ({
      label: item.label,
      annualTuition: item.annualTuition,
    })),
    routeRows: buildWorkbookRouteSetupRows(data).map((item) => ({
      routeName: item.routeName,
      annualFee: item.annualFee,
    })),
  };
}

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
  }).format(parsed);
}

function ActionNotice({ state }: { state: FeeSetupActionState }) {
  if (!state.message) {
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

function PreviewSummaryCard({
  state,
}: {
  state: FeeSetupActionState;
}) {
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
            Review Fee Setup Changes
          </p>
          <h2 className="mt-2 font-heading text-xl font-semibold text-slate-950">
            Workbook Fee Setup
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Only future or unpaid installment rows will update when you apply this review.
          </p>
        </div>
        <StatusBadge label="Review ready" tone="accent" />
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

      {preview.pendingClassCreates && preview.pendingClassCreates.length > 0 ? (
        <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-700">
          Missing class rows that will be created on save:{" "}
          <strong>{preview.pendingClassCreates.join(", ")}</strong>
        </div>
      ) : null}

      {preview.pendingRouteCreates && preview.pendingRouteCreates.length > 0 ? (
        <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-700">
          Missing route rows that will be created on save:{" "}
          <strong>{preview.pendingRouteCreates.join(", ")}</strong>
        </div>
      ) : null}

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

export function FeeSetupClient({
  data,
  canEdit,
  saveWorkbookFeeSetupAction,
  initialState,
}: FeeSetupClientProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    saveWorkbookFeeSetupAction,
    initialState,
  );
  const [form, setForm] = useState<WorkbookFeeSetupFormPayload>(() =>
    buildInitialFormState(data),
  );
  const [previewDirty, setPreviewDirty] = useState(false);
  const [classSearch, setClassSearch] = useState("");
  const [routeSearch, setRouteSearch] = useState("");

  useEffect(() => {
    setForm(buildInitialFormState(data));
    setPreviewDirty(false);
  }, [data]);

  useEffect(() => {
    if (state.status === "preview") {
      setPreviewDirty(false);
    }

    if (state.status === "success") {
      setPreviewDirty(false);
      router.refresh();
    }
  }, [router, state.status]);

  const classRows = buildWorkbookClassSetupRows(data, form.academicSessionLabel).map((row) => ({
    ...row,
    annualTuition:
      form.classRows.find((item) => item.label === row.label)?.annualTuition ??
      row.annualTuition,
  }));
  const routeRows = buildWorkbookRouteSetupRows(data).map((row) => ({
    ...row,
    annualFee:
      form.routeRows.find((item) => item.routeName === row.routeName)?.annualFee ??
      row.annualFee,
  }));
  const normalizedClassSearch = classSearch.trim().toLowerCase();
  const normalizedRouteSearch = routeSearch.trim().toLowerCase();
  const visibleClassRows = normalizedClassSearch
    ? classRows.filter((row) => row.label.toLowerCase().includes(normalizedClassSearch))
    : classRows;
  const visibleRouteRows = normalizedRouteSearch
    ? routeRows.filter((row) => row.routeName.toLowerCase().includes(normalizedRouteSearch))
    : routeRows;
  const canApply = canEdit && state.preview && !previewDirty;

  function markDirty() {
    if (state.status === "preview") {
      setPreviewDirty(true);
    }
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

  return (
    <form action={formAction} className="space-y-6">
      <ActionNotice state={state} />
      <PreviewSummaryCard state={state} />

      {!canEdit ? (
        <div className="rounded-[26px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-900">
          Only admins can change Fee Setup. Accountant and read-only staff can review the live
          values here.
        </div>
      ) : null}

      {previewDirty ? (
        <div className="rounded-[26px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-900">
          Values changed after review. Review the Fee Setup again before applying it.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <SectionCard
            title="Quick Workflow"
            description="Use this rail to jump to the part staff need next."
          >
            <div className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="#fee-setup-session">1. Session</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="#fee-setup-installments">2. Installments</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="#fee-setup-policy">3. Policy values</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="#fee-setup-classes">4. Classes</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="#fee-setup-routes">5. Routes</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="#fee-setup-save">6. Save</Link>
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            title="Setup Snapshot"
            description="A compact view of what is live right now."
          >
            <div className="space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Session
                </p>
                <p className="mt-1 font-medium text-slate-950">{data.globalPolicy.academicSessionLabel}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Installments
                </p>
                <p className="mt-1 font-medium text-slate-950">{form.installmentDates.length} rows</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Fee policy
                </p>
                <p className="mt-1 font-medium text-slate-950">New academic session creates a new saved fee-policy snapshot.</p>
              </div>
            </div>
          </SectionCard>
        </aside>

        <div className="space-y-6">
          <SectionCard
            id="fee-setup-session"
            title="1. Academic Session"
            description="Change this first. If you enter a new academic year, the save flow creates a fresh fee-policy snapshot for that session."
          >
            <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
              <div>
                <Label htmlFor="academic-session-label">Academic session label</Label>
                <Input
                  id="academic-session-label"
                  name="academicSessionLabel"
                  value={form.academicSessionLabel}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      academicSessionLabel: event.target.value,
                    }));
                    markDirty();
                  }}
                  className="mt-2"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div className="rounded-[24px] border border-sky-100 bg-sky-50/75 px-4 py-3 text-sm leading-6 text-slate-700">
                Current live session:{" "}
                <strong className="text-slate-950">{data.globalPolicy.academicSessionLabel}</strong>
                <br />
                Switching to a new session keeps the old year as history and starts a new fee
                setup snapshot for the new year.
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="fee-setup-installments"
            title="2. Installment Schedule"
            description="Set the installment count by adding or removing due-date rows. The fee engine uses the number of rows you keep here."
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-slate-700">
                Installments in this setup:{" "}
                <strong className="text-slate-950">{form.installmentDates.length}</strong>
              </div>
              {canEdit ? (
                <Button type="button" variant="outline" onClick={addInstallmentDate}>
                  Add installment row
                </Button>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {form.installmentDates.map((value, index) => (
                <div key={`due-date-${index}`} className="rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`installment-date-${index}`}>Installment {index + 1} due date</Label>
                    {canEdit && form.installmentDates.length > 1 ? (
                      <Button type="button" variant="ghost" onClick={() => removeInstallmentDate(index)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    id={`installment-date-${index}`}
                    name="installmentDueDate"
                    type="date"
                    value={value}
                    onChange={(event) => updateInstallmentDate(index, event.target.value)}
                    className="mt-2"
                    disabled={!canEdit}
                    required
                  />
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            id="fee-setup-policy"
            title="3. Fee Policy Values"
            description="These are the workbook-style policy values that stay live for the current academic session."
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="late-fee-flat-amount">Flat late fee per overdue installment</Label>
                <Input
                  id="late-fee-flat-amount"
                  name="lateFeeFlatAmount"
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
                  required
                />
              </div>
              <div>
                <Label htmlFor="new-student-academic-fee">New student academic fee</Label>
                <Input
                  id="new-student-academic-fee"
                  name="newStudentAcademicFeeAmount"
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
                  required
                />
              </div>
              <div>
                <Label htmlFor="old-student-academic-fee">Old student academic fee</Label>
                <Input
                  id="old-student-academic-fee"
                  name="oldStudentAcademicFeeAmount"
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
                  required
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="fee-setup-classes"
            title="4. Class-wise Tuition Table"
            description="Edit the annual tuition for each class for the selected academic session."
          >
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:min-w-[260px]">
                  <Label htmlFor="class-search">Search classes</Label>
                  <Input
                    id="class-search"
                    value={classSearch}
                    onChange={(event) => setClassSearch(event.target.value)}
                    placeholder="Type class name"
                    className="mt-2"
                  />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Showing <strong className="text-slate-950">{visibleClassRows.length}</strong> of{" "}
                  <strong className="text-slate-950">{classRows.length}</strong> class rows
                </div>
              </div>
              {canEdit ? (
                <p className="text-sm text-slate-600">
                  Search first, then edit tuition in place. Keep the collapsed supporting list
                  section closed unless you need to add or remove a class record.
                </p>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-[26px] border border-slate-200 bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Annual tuition</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last saved</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleClassRows.map((row) => (
                    <tr key={`${form.academicSessionLabel}-${row.label}`} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-950">
                        <input type="hidden" name="classLabel" value={row.label} />
                        {row.label}
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          name="classAnnualTuition"
                          type="number"
                          min={0}
                          value={row.annualTuition}
                          onChange={(event) =>
                            updateClassAnnualTuition(row.label, Number(event.target.value || 0))
                          }
                          disabled={!canEdit}
                          required
                        />
                      </td>
                      <td className="px-4 py-3">
                        {row.hasSavedDefault ? (
                          <StatusBadge label="Saved row" tone="good" />
                        ) : row.hasClassRecord ? (
                          <StatusBadge label="Will save default" tone="accent" />
                        ) : (
                          <StatusBadge label="Will create row" tone="warning" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(row.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            id="fee-setup-routes"
            title="5. Route-wise Transport Fee Table"
            description="Edit the annual transport fee for each route. The yearly fee stays the live workbook value."
          >
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:min-w-[260px]">
                  <Label htmlFor="route-search">Search routes</Label>
                  <Input
                    id="route-search"
                    value={routeSearch}
                    onChange={(event) => setRouteSearch(event.target.value)}
                    placeholder="Type route name"
                    className="mt-2"
                  />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Showing <strong className="text-slate-950">{visibleRouteRows.length}</strong> of{" "}
                  <strong className="text-slate-950">{routeRows.length}</strong> route rows
                </div>
              </div>
              {canEdit ? (
                <p className="text-sm text-slate-600">
                  Use the search box to narrow the route list before adjusting fees.
                </p>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-[26px] border border-slate-200 bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Transport route</th>
                    <th className="px-4 py-3">Annual transport fee</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last saved</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRouteRows.map((row) => (
                    <tr key={row.routeName} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-950">
                        <input type="hidden" name="routeName" value={row.routeName} />
                        {row.routeName}
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          name="routeAnnualFee"
                          type="number"
                          min={0}
                          value={row.annualFee}
                          onChange={(event) =>
                            updateRouteAnnualFee(row.routeName, Number(event.target.value || 0))
                          }
                          disabled={!canEdit}
                          required
                        />
                      </td>
                      <td className="px-4 py-3">
                        {row.hasRouteRecord ? (
                          <StatusBadge label="Saved row" tone="good" />
                        ) : (
                          <StatusBadge label="Will create row" tone="warning" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(row.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div
            id="fee-setup-save"
            className="glass-panel flex flex-col gap-3 rounded-[30px] p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-heading text-lg font-semibold text-slate-950">Save Fee Setup</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Review the workbook-style changes first, then apply the reviewed setup. Paid
                receipts, payments, adjustments, and audit logs remain append-only.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {state.changeBatchId ? (
                <input type="hidden" name="changeBatchId" value={state.changeBatchId} />
              ) : null}
              <Button
                type="submit"
                name="_intent"
                value="preview"
                variant="outline"
                disabled={!canEdit || isPending}
              >
                {isPending ? "Working..." : "Review Fee Setup Changes"}
              </Button>
              <Button
                type="submit"
                name="_intent"
                value="apply"
                disabled={!canApply || isPending}
              >
                {isPending ? "Saving..." : "Apply Fee Setup"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
