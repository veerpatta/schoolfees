"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from "lucide-react";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  applyBulkUpdateAction,
  previewBulkUpdateAction,
} from "@/app/protected/students/bulk-update/actions";
import {
  INITIAL_BULK_UPDATE_APPLY_STATE,
  INITIAL_BULK_UPDATE_PREVIEW_STATE,
} from "@/app/protected/students/bulk-update/action-state";
import type { BulkUpdateClassOption } from "@/lib/students/bulk-update/data";
import {
  BULK_UPDATE_FIELDS,
  BULK_UPDATE_FIELD_GROUPS,
  CLEAR_KEYWORD,
} from "@/lib/students/bulk-update/fields";

type BulkUpdateWorkspaceProps = {
  sessionLabel: string;
  classOptions: readonly BulkUpdateClassOption[];
};

const MAX_PREVIEW_STUDENTS = 100;
const MAX_PREVIEW_ERRORS = 25;

export function BulkUpdateWorkspace({ sessionLabel, classOptions }: BulkUpdateWorkspaceProps) {
  const router = useRouter();
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>([]);
  const [fileChosen, setFileChosen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewState, previewAction, previewPending] = useActionState(
    previewBulkUpdateAction,
    INITIAL_BULK_UPDATE_PREVIEW_STATE,
  );
  const [applyState, applyAction, applyPending] = useActionState(
    applyBulkUpdateAction,
    INITIAL_BULK_UPDATE_APPLY_STATE,
  );

  const selectedStudentCount = useMemo(
    () =>
      classOptions
        .filter((option) => selectedClassIds.includes(option.classId))
        .reduce((total, option) => total + option.studentCount, 0),
    [classOptions, selectedClassIds],
  );

  const feeAffecting = useMemo(
    () =>
      BULK_UPDATE_FIELDS.filter(
        (field) => selectedFieldKeys.includes(field.key) && field.affectsFees,
      ),
    [selectedFieldKeys],
  );

  const canDownload = selectedClassIds.length > 0 && selectedFieldKeys.length > 0;
  const templateHref = canDownload
    ? `/protected/students/bulk-update/template?${[
        ...selectedClassIds.map((id) => `classId=${encodeURIComponent(id)}`),
        ...selectedFieldKeys.map((key) => `field=${encodeURIComponent(key)}`),
      ].join("&")}`
    : null;

  useEffect(() => {
    if (applyState.status === "idle" || !applyState.message) {
      return;
    }

    toast({
      title: applyState.status === "success" ? "Bulk update saved" : "Bulk update problem",
      description: applyState.message,
    });

    // Without this the page keeps the class counts it was rendered with, so a
    // student who has just moved to another class still appears in the old one
    // and the save looks like it did nothing.
    if (applyState.status === "success") {
      router.refresh();
    }
  }, [applyState, router]);

  // Once an apply succeeds the on-screen preview describes values that no
  // longer exist. Drop it rather than leave a stale Apply button armed.
  const preview = applyState.status === "success" ? null : previewState.preview;

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  const hiddenSelections = (
    <>
      {selectedClassIds.map((id) => (
        <input key={id} type="hidden" name="classIds" value={id} />
      ))}
      {selectedFieldKeys.map((key) => (
        <input key={key} type="hidden" name="fieldKeys" value={key} />
      ))}
    </>
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="1. Choose classes"
        description={`Classes in ${sessionLabel}. Only active students in the classes you tick are included — withdrawn students are left out.`}
      >
        {classOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No classes found in {sessionLabel}.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {classOptions.map((option) => {
                const active = selectedClassIds.includes(option.classId);

                return (
                  <button
                    key={option.classId}
                    type="button"
                    onClick={() => setSelectedClassIds((prev) => toggle(prev, option.classId))}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border-strong bg-card hover:bg-surface-2"
                    }`}
                  >
                    {option.label}
                    <span className={active ? "ml-2 opacity-80" : "ml-2 text-muted-foreground"}>
                      {option.studentCount}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedClassIds(classOptions.map((option) => option.classId))}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedClassIds([])}
              >
                Clear
              </Button>
              <p className="text-sm text-muted-foreground">
                {selectedClassIds.length} class{selectedClassIds.length === 1 ? "" : "es"} ·{" "}
                {selectedStudentCount} student{selectedStudentCount === 1 ? "" : "s"}
              </p>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard
        title="2. Choose what to update"
        description="Only these columns appear in the sheet, so nothing else can be changed by mistake."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {BULK_UPDATE_FIELD_GROUPS.map((group) => (
            <div key={group.group} className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">{group.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{group.description}</p>
              <div className="mt-3 space-y-2">
                {BULK_UPDATE_FIELDS.filter((field) => field.group === group.group).map((field) => (
                  <label key={field.key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 rounded border-border-strong"
                      checked={selectedFieldKeys.includes(field.key)}
                      onChange={() => setSelectedFieldKeys((prev) => toggle(prev, field.key))}
                    />
                    <span>
                      {field.header}
                      {field.affectsFees ? (
                        <span className="ml-1 text-xs text-warning-soft-foreground">
                          · affects fees
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {feeAffecting.length > 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-warning-soft-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {feeAffecting.map((field) => field.header).join(", ")} change what a student owes.
              Dues are recalculated only for the students that actually change.
            </span>
          </p>
        ) : null}
      </SectionCard>

      <SectionCard
        title="3. Download the sheet"
        description="Every row is pre-filled with what is saved now. Leave a cell blank to keep it as-is."
      >
        <div className="flex flex-wrap items-center gap-3">
          {templateHref ? (
            <Button asChild>
              <a href={templateHref}>
                <Download className="mr-2 size-4" aria-hidden="true" />
                Download Excel template
              </a>
            </Button>
          ) : (
            <Button disabled>
              <Download className="mr-2 size-4" aria-hidden="true" />
              Download Excel template
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            Type <code className="rounded bg-surface-2 px-1">{CLEAR_KEYWORD}</code> in a cell to
            deliberately empty a value.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="4. Upload and review"
        description="Nothing is saved until you review the changes and press Apply."
      >
        {/* One form, two submit buttons: Apply re-posts the very same file so
            the server recomputes the change set against current stored values
            rather than trusting a list sent by the browser. */}
        <form className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {hiddenSelections}
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".xlsx,.xls,.csv"
              required
              onChange={() => setFileChosen(Boolean(fileInputRef.current?.files?.length))}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-card file:px-3 file:py-1.5 file:text-sm"
            />
            <Button
              type="submit"
              formAction={previewAction}
              variant="outline"
              disabled={previewPending || applyPending || !canDownload || !fileChosen}
            >
              {previewPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="mr-2 size-4" aria-hidden="true" />
              )}
              Check changes
            </Button>
          </div>

          {previewState.status === "error" && previewState.message ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {previewState.message}
            </p>
          ) : null}

          {preview ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
                <span>
                  <strong>{preview.changeCount}</strong> change
                  {preview.changeCount === 1 ? "" : "s"}
                </span>
                <span>
                  <strong>{preview.changedStudentCount}</strong> student
                  {preview.changedStudentCount === 1 ? "" : "s"}
                </span>
                <span className="text-muted-foreground">
                  {preview.unchangedRowCount} row{preview.unchangedRowCount === 1 ? "" : "s"}{" "}
                  unchanged
                </span>
                {preview.errorRowCount > 0 ? (
                  <span className="font-medium text-destructive">
                    {preview.errorRowCount} row{preview.errorRowCount === 1 ? "" : "s"} skipped
                  </span>
                ) : null}
              </div>

              {preview.errorRowCount > 0 ? (
                <div className="rounded-lg border border-destructive/40 p-3">
                  <p className="text-sm font-semibold text-destructive">
                    These rows will be skipped
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {preview.rows
                      .filter((row) => row.errors.length > 0)
                      .slice(0, MAX_PREVIEW_ERRORS)
                      .map((row) => (
                        <li key={`err-${row.sheetRow}`}>
                          <span className="font-medium">Row {row.sheetRow}</span>
                          {row.admissionNo ? ` (SR ${row.admissionNo})` : ""}:{" "}
                          {row.errors.join(" ")}
                        </li>
                      ))}
                  </ul>
                  {preview.errorRowCount > MAX_PREVIEW_ERRORS ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Showing the first {MAX_PREVIEW_ERRORS} of {preview.errorRowCount}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {preview.applicableRows.length > 0 ? (
                <>
                  {/* Phones get a card per student — scrubbing a five-column
                      table sideways loses your place mid-row. */}
                  <ul className="space-y-2 md:hidden">
                    {preview.applicableRows.slice(0, MAX_PREVIEW_STUDENTS).map((row) => (
                      <li
                        key={`card-${row.sheetRow}`}
                        className="rounded-lg border border-border p-3"
                      >
                        <p className="text-sm font-semibold">
                          {row.fullName}{" "}
                          <span className="font-normal text-muted-foreground">
                            SR {row.admissionNo}
                          </span>
                        </p>
                        <dl className="mt-2 space-y-1 text-sm">
                          {row.changes.map((change) => (
                            <div
                              key={`card-${row.sheetRow}-${change.fieldKey}`}
                              className="flex flex-wrap items-baseline gap-x-2"
                            >
                              <dt className="text-muted-foreground">{change.header}:</dt>
                              <dd className="flex flex-wrap items-baseline gap-x-2">
                                <span className="text-muted-foreground line-through">
                                  {change.fromLabel}
                                </span>
                                <span className="font-medium">{change.toLabel}</span>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-surface-2 text-left">
                        <tr>
                          <th className="px-3 py-2 font-semibold">SR no</th>
                          <th className="px-3 py-2 font-semibold">Student</th>
                          <th className="px-3 py-2 font-semibold">Field</th>
                          <th className="px-3 py-2 font-semibold">Now</th>
                          <th className="px-3 py-2 font-semibold">After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.applicableRows
                          .slice(0, MAX_PREVIEW_STUDENTS)
                          .flatMap((row) =>
                            row.changes.map((change, index) => (
                              <tr
                                key={`${row.sheetRow}-${change.fieldKey}`}
                                className="border-t border-border"
                              >
                                <td className="px-3 py-2">
                                  {index === 0 ? row.admissionNo : ""}
                                </td>
                                <td className="px-3 py-2">{index === 0 ? row.fullName : ""}</td>
                                <td className="px-3 py-2">{change.header}</td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {change.fromLabel}
                                </td>
                                <td className="px-3 py-2 font-medium">{change.toLabel}</td>
                              </tr>
                            )),
                          )}
                      </tbody>
                    </table>
                    {preview.applicableRows.length > MAX_PREVIEW_STUDENTS ? (
                      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                        Showing the first {MAX_PREVIEW_STUDENTS} students of{" "}
                        {preview.applicableRows.length}. Applying saves all of them.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" formAction={applyAction} disabled={applyPending}>
                      {applyPending ? (
                        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
                      )}
                      Apply {preview.changeCount} change
                      {preview.changeCount === 1 ? "" : "s"}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      {preview.feeImpactStudentIds.length > 0
                        ? `Dues will be recalculated for ${preview.feeImpactStudentIds.length} student(s).`
                        : "No fee impact."}
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </form>

        {applyState.status === "success" && applyState.message ? (
          <p className="mt-4 flex items-center gap-2 text-sm font-medium text-success-soft-foreground">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {applyState.message}
          </p>
        ) : null}

        {applyState.status === "error" && applyState.message ? (
          <p role="alert" className="mt-4 text-sm font-medium text-destructive">
            {applyState.message}
          </p>
        ) : null}

        {applyState.failures.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-destructive">
            {applyState.failures.slice(0, 20).map((failure) => (
              <li key={failure.admissionNo}>
                SR {failure.admissionNo}: {failure.message}
              </li>
            ))}
          </ul>
        ) : null}
      </SectionCard>
    </div>
  );
}
