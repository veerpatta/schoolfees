"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Loader2, Search, UserCheck, X, AlertTriangle } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Sheet } from "@/ui/primitives/sheet";
import { toast } from "@/ui/primitives/toast";
import { useMediaQuery } from "@/ui/hooks/use-media-query";
import { linkSiblingsAction } from "@/app/protected/students/sibling-actions";
import { INITIAL_LINK_SIBLING_ACTION_STATE } from "@/app/protected/students/sibling-action-state";
import type { PaymentStudentIndexItem } from "@/modules/payments/domain/types";
import { cn } from "@/platform/utils";

/**
 * Sibling picker.
 *
 * Two rules this component exists to hold:
 *
 * 1. **Selecting never hides the list.** The old version swapped the whole
 *    search body for a single-student confirmation card, so picking a child
 *    made the list "disappear" and there was no way to add a second or third
 *    one. Rows now toggle in place and the family is submitted in one go —
 *    which is what linking three or more siblings actually needs.
 * 2. **The confirm button is pinned in the Sheet footer**, never left at the
 *    end of the scrolling body: on a phone the search field can raise the
 *    keyboard over anything inside the scroll area.
 *    Guarded by tests/ui/mobile-action-reachability.test.ts.
 */
const LINK_SIBLING_FORM_ID = "LINK_SIBLING_FORM_ID";

/** Rows rendered before the staff member has typed anything. */
const BROWSE_LIMIT = 25;
/** Rows rendered for a search term. */
const SEARCH_LIMIT = 50;

type LinkSiblingSheetProps = {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentLabel: string;
  studentAdmissionNo: string;
  studentClassLabel: string;
  studentFatherName: string | null;
  studentPhone: string | null;
  sessionLabel: string;
  excludeStudentIds?: string[];
};

export function LinkSiblingSheet({
  open,
  onClose,
  studentId,
  studentLabel,
  studentAdmissionNo,
  studentClassLabel,
  studentFatherName,
  studentPhone,
  sessionLabel,
  excludeStudentIds = [],
}: LinkSiblingSheetProps) {
  const t = useTranslations("MobileApp");
  const tToasts = useTranslations("Toasts");
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<PaymentStudentIndexItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    linkSiblingsAction,
    INITIAL_LINK_SIBLING_ACTION_STATE,
  );
  // Only a mouse/trackpad gets the search field pre-focused. On a phone that
  // would throw the keyboard up over the list before staff have seen it.
  const prefersInitialFocus = useMediaQuery("(pointer: fine)");

  useEffect(() => {
    if (!open || students.length > 0) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    fetch(
      `/protected/students/index?purpose=paymentDesk&session=${encodeURIComponent(sessionLabel)}`,
      { headers: { accept: "application/json" } },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load students (${response.status})`);
        return (await response.json()) as { students?: PaymentStudentIndexItem[] };
      })
      .then((json) => {
        if (cancelled) return;
        setStudents(json.students ?? []);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setLoadError(error.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, sessionLabel, students.length]);

  const reset = useCallback(() => {
    setSelectedIds([]);
    setQuery("");
  }, []);

  useEffect(() => {
    if (state.status === "success") {
      // Re-render the server data so the saved change is visible at once.
      router.refresh();
      toast({
        title: tToasts("siblingLinkedTitle"),
        description: state.message ?? "",
      });
      reset();
      onClose();
    }
  }, [state.status, state.message, onClose, reset, tToasts, router]);

  const exclude = useMemo(
    () => new Set<string>([studentId, ...excludeStudentIds]),
    [studentId, excludeStudentIds],
  );
  const selectable = useMemo(
    () => students.filter((student) => !exclude.has(student.id)),
    [students, exclude],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return selectable.slice(0, BROWSE_LIMIT);
    }
    return selectable
      .filter((student) => {
        const haystack = `${student.fullName} ${student.admissionNo} ${student.classLabel}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, SEARCH_LIMIT);
  }, [selectable, query]);

  const selectedStudents = useMemo(
    () =>
      selectedIds
        .map((id) => selectable.find((student) => student.id === id))
        .filter((student): student is PaymentStudentIndexItem => Boolean(student)),
    [selectedIds, selectable],
  );

  const toggle = useCallback((student: PaymentStudentIndexItem) => {
    setSelectedIds((current) =>
      current.includes(student.id)
        ? current.filter((id) => id !== student.id)
        : [...current, student.id],
    );
  }, []);

  const selectedCount = selectedStudents.length;
  const closeSheet = useCallback(() => {
    if (pending) return;
    reset();
    onClose();
  }, [pending, reset, onClose]);

  return (
    <Sheet
      open={open}
      onClose={closeSheet}
      title={t("linkSiblingSheetTitle")}
      description={t("linkSiblingSheetBody")}
      size="full"
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl"
            onClick={reset}
            disabled={pending || (selectedCount === 0 && query.length === 0)}
          >
            {t("linkSiblingClear")}
          </Button>
          <Button
            type="submit"
            form={LINK_SIBLING_FORM_ID}
            className="h-12 flex-1 rounded-xl"
            disabled={pending || selectedCount === 0}
          >
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t("linkSiblingPending")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <UserCheck className="size-4" aria-hidden="true" />
                {selectedCount > 1
                  ? t("linkSiblingConfirmMulti", { count: selectedCount })
                  : t("linkSiblingConfirm")}
              </span>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("linkSiblingCurrent")}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{studentLabel}</p>
          <p className="text-xs text-muted-foreground">
            SR {studentAdmissionNo} · {studentClassLabel}
            {studentFatherName ? ` · ${t("phoneLabelFather")} ${studentFatherName}` : ""}
            {studentPhone ? ` · ${studentPhone}` : ""}
          </p>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("linkSiblingSearchPlaceholder")}
            aria-label={t("linkSiblingSearchPlaceholder")}
            className="pl-9"
            {...(prefersInitialFocus ? { "data-sheet-initial-focus": "" } : {})}
          />
        </div>

        {/* The whole selection stays on screen while staff keep searching, so a
            third or fourth child can be added without losing the first two. */}
        <form id={LINK_SIBLING_FORM_ID} action={formAction} className="space-y-3">
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="sessionLabel" value={sessionLabel} />
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="siblingStudentIds" value={id} />
          ))}

          {selectedCount > 0 ? (
            <div className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("linkSiblingSelectedCount", { count: selectedCount })}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {selectedStudents.map((student) => (
                  <li key={student.id}>
                    <button
                      type="button"
                      onClick={() => toggle(student)}
                      disabled={pending}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-60"
                    >
                      <span className="truncate">{student.fullName}</span>
                      <X className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="sr-only">{t("linkSiblingRemoveSelection")}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-warning-soft-foreground">
                {t("linkSiblingConfirmBody", {
                  a: studentLabel,
                  count: selectedCount,
                  session: sessionLabel,
                })}
              </p>
            </div>
          ) : (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              {t("linkSiblingMultiHint")}
            </p>
          )}

          {state.status === "error" && state.message ? (
            <div className="flex items-start gap-2 rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{state.message}</span>
            </div>
          ) : null}
        </form>

        {loadError ? (
          <div className="rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground">
            {loadError}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("linkSiblingLoading")}
          </div>
        ) : null}

        {!isLoading && filtered.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-surface-2 px-3 py-4 text-center text-xs text-muted-foreground">
            {t("linkSiblingNoMatch")}
          </p>
        ) : null}

        {filtered.length > 0 ? (
          <div>
            <ul
              aria-label={t("linkSiblingResultsLabel")}
              className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card"
            >
              {filtered.map((student) => {
                const isSelected = selectedIds.includes(student.id);
                return (
                  <li key={student.id}>
                    <button
                      type="button"
                      onClick={() => toggle(student)}
                      disabled={pending}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm transition hover:bg-surface-2 disabled:opacity-60",
                        isSelected && "bg-accent-soft",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{student.fullName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {student.classLabel} · SR {student.admissionNo}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-md border",
                          isSelected
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border-strong text-transparent",
                        )}
                        aria-hidden="true"
                      >
                        <Check className="size-3.5" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
