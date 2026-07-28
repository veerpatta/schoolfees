"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search, UserCheck, UserPlus, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { linkSiblingsAction } from "@/app/protected/students/sibling-actions";
import { INITIAL_LINK_SIBLING_ACTION_STATE } from "@/app/protected/students/sibling-action-state";
import type { PaymentStudentIndexItem } from "@/lib/payments/types";
import { cn } from "@/lib/utils";

/**
 * The confirm button is pinned in the Sheet footer rather than left at the end
 * of the scrolling body: the search field above autofocuses, so on a phone the
 * keyboard is already up and a submit inside the scroll area can sit under it.
 * Guarded by tests/ui/mobile-action-reachability.test.ts.
 */
const LINK_SIBLING_FORM_ID = "LINK_SIBLING_FORM_ID";

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
  const [selected, setSelected] = useState<PaymentStudentIndexItem | null>(null);
  const [state, formAction, pending] = useActionState(
    linkSiblingsAction,
    INITIAL_LINK_SIBLING_ACTION_STATE,
  );

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

  useEffect(() => {
    if (state.status === "success") {
      toast({
        title: tToasts("siblingLinkedTitle"),
        description: state.message ?? "",
      });
      setSelected(null);
      setQuery("");
      onClose();
    }
  }, [state.status, state.message, onClose, tToasts]);

  const exclude = useMemo(
    () => new Set<string>([studentId, ...excludeStudentIds]),
    [studentId, excludeStudentIds],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = students.filter((s) => !exclude.has(s.id));
    if (!q) {
      return base.slice(0, 20);
    }
    return base
      .filter((s) => {
        const haystack = `${s.fullName} ${s.admissionNo} ${s.classLabel}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 30);
  }, [students, query, exclude]);

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (pending) return;
        setSelected(null);
        setQuery("");
        onClose();
      }}
      title={t("linkSiblingSheetTitle")}
      description={t("linkSiblingSheetBody")}
      size="full"
      footer={
        selected ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-xl"
              onClick={() => setSelected(null)}
              disabled={pending}
            >
              {t("linkSiblingPickDifferent")}
            </Button>
            <Button
              type="submit"
              form={LINK_SIBLING_FORM_ID}
              className="h-12 flex-1 rounded-xl"
              disabled={pending}
            >
              {pending ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {t("linkSiblingPending")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <UserCheck className="size-4" aria-hidden="true" />
                  {t("linkSiblingConfirm")}
                </span>
              )}
            </Button>
          </div>
        ) : null
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

        {selected ? (
          <form id={LINK_SIBLING_FORM_ID} action={formAction} className="space-y-3">
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="siblingStudentId" value={selected.id} />
            <input type="hidden" name="sessionLabel" value={sessionLabel} />

            <div className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("linkSiblingTarget")}</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{selected.fullName}</p>
              <p className="text-xs text-muted-foreground">
                SR {selected.admissionNo} · {selected.classLabel}
              </p>
            </div>

            <div className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
              {t("linkSiblingConfirmBody", {
                a: studentLabel,
                b: selected.fullName,
                session: sessionLabel,
              })}
            </div>

            {state.status === "error" && state.message ? (
              <div className="flex items-start gap-2 rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{state.message}</span>
              </div>
            ) : null}

          </form>
        ) : (
          <>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, SR no, or class"
                className="pl-9"
                autoFocus
              />
            </div>

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
              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
                {filtered.map((student) => (
                  <li key={student.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(student)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm hover:bg-surface-2",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{student.fullName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {student.classLabel} · SR {student.admissionNo}
                        </p>
                      </div>
                      <UserPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
