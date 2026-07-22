"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { bulkUpdateStudentsAction } from "@/app/protected/students/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import type {
  StudentClassOption,
  StudentRouteOption,
} from "@/lib/students/types";

type BulkStudentEditBarProps = {
  selectedIds: ReadonlyArray<string>;
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
  onClearSelection: () => void;
};

const selectClassName =
  "appearance-none flex w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus:ring-ring focus:border-ring cursor-pointer hover:border-border-strong";

export function BulkStudentEditBar({
  selectedIds,
  classOptions,
  routeOptions,
  onClearSelection,
}: BulkStudentEditBarProps) {
  const router = useRouter();
  const tToasts = useTranslations("Toasts");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [classId, setClassId] = useState("");
  const [transportRouteId, setTransportRouteId] = useState("");
  const [transportRouteClear, setTransportRouteClear] = useState(false);
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  if (selectedIds.length === 0) {
    return null;
  }

  function handleApply() {
    const formData = new FormData();
    for (const id of selectedIds) {
      formData.append("studentIds", id);
    }
    if (classId) formData.set("classId", classId);
    if (transportRouteClear) {
      formData.set("transportRouteClear", "yes");
    } else if (transportRouteId) {
      formData.set("transportRouteId", transportRouteId);
    }
    if (status) formData.set("status", status);

    startTransition(async () => {
      const result = await bulkUpdateStudentsAction(formData);

      if (result.status === "success") {
        toast({
          title: tToasts("bulkUpdateCompleteTitle"),
          description: result.message,
        });
        setSheetOpen(false);
        setClassId("");
        setTransportRouteId("");
        setTransportRouteClear(false);
        setStatus("");
        onClearSelection();
        router.refresh();
      } else {
        toast({
          title: tToasts("bulkUpdateFailedTitle"),
          description: result.message,
        });
      }
    });
  }

  const hasAnyField = Boolean(classId) || Boolean(status) || transportRouteClear || Boolean(transportRouteId);

  return (
    <>
      {/* Clears the fixed mobile bottom nav (z-40) — at bottom-0/z-30 this bar
          and its Bulk edit button were completely covered on phones. */}
      <div className="fixed inset-x-0 bottom-[calc(var(--mobile-bottom-nav-offset,0px)+0.5rem)] z-40 flex justify-center px-3 pb-2 sm:px-6 md:bottom-4 md:pb-0 print:hidden">
        <div className="flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-card px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
              {selectedIds.length}
            </span>
            <span className="text-sm font-medium text-foreground">
              {selectedIds.length === 1 ? "student selected" : "students selected"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearSelection}
              disabled={isPending}
            >
              Clear
            </Button>
            <Button size="sm" onClick={() => setSheetOpen(true)} disabled={isPending}>
              Bulk edit…
            </Button>
          </div>
        </div>
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => (isPending ? undefined : setSheetOpen(false))}
        title={`Bulk edit ${selectedIds.length} student${selectedIds.length === 1 ? "" : "s"}`}
        size="lg"
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-muted-foreground">
            Pick the fields you want to change. Empty fields are left unchanged. Dues are
            re-prepared after the update completes.
          </p>

          <div>
            <Label htmlFor="bulk-class">Move to class</Label>
            <select
              id="bulk-class"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className={`${selectClassName} mt-2 h-11`}
              disabled={isPending}
            >
              <option value="">Don&apos;t change class</option>
              {classOptions.map((classOption) => (
                <option key={classOption.id} value={classOption.id}>
                  {classOption.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="bulk-route">Transport route</Label>
            <select
              id="bulk-route"
              value={transportRouteClear ? "__clear__" : transportRouteId}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "__clear__") {
                  setTransportRouteClear(true);
                  setTransportRouteId("");
                } else {
                  setTransportRouteClear(false);
                  setTransportRouteId(value);
                }
              }}
              className={`${selectClassName} mt-2 h-11`}
              disabled={isPending}
            >
              <option value="">Don&apos;t change route</option>
              <option value="__clear__">Clear transport route</option>
              {routeOptions.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.routeCode ? `${route.label} (${route.routeCode})` : route.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="bulk-status">Status</Label>
            <select
              id="bulk-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={`${selectClassName} mt-2 h-11`}
              disabled={isPending}
            >
              <option value="">Don&apos;t change status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="left">Withdrawn (left)</option>
              <option value="graduated">Graduated</option>
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              className="flex-1 h-11 rounded-xl"
              onClick={handleApply}
              disabled={isPending || !hasAnyField}
            >
              {isPending
                ? "Applying…"
                : `Apply to ${selectedIds.length} student${selectedIds.length === 1 ? "" : "s"}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 px-4 rounded-xl"
              onClick={() => setSheetOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
