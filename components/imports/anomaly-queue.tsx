"use client";

import Link from "next/link";
import { useState } from "react";

import { bulkUpdateImportRowReviewAction } from "@/app/protected/imports/actions";
import { SectionCard } from "@/components/admin/section-card";
import { RowDetailCard } from "@/components/imports/row-detail-card";
import { Button } from "@/components/ui/button";
import type {
  ImportAnomalyCategory,
  ImportBatchDetail,
  ImportMode,
  ImportRowDetail,
} from "@/lib/import/types";

type AnomalyCategoryTabConfig = {
  key: string;
  label: string;
  categories: readonly ImportAnomalyCategory[];
  description: string;
  guidance: string | null;
  masterDataLink: string | null;
};

const QUEUE_TABS: AnomalyCategoryTabConfig[] = [
  {
    key: "all",
    label: "All unresolved",
    categories: [],
    description: "All rows with unresolved issues that still need office review.",
    guidance: null,
    masterDataLink: null,
  },
  {
    key: "duplicates",
    label: "Duplicates",
    categories: ["duplicate-admission-no", "duplicate-name-class-dob"],
    description: "Review duplicate SR numbers or student matches, then skip or approve only the safe rows.",
    guidance:
      "Use 'Review matched existing student' to compare the import row with the existing student record. Skip the row if it is the same student. If this is a new student with a conflicting SR no, fix the source data first.",
    masterDataLink: null,
  },
  {
    key: "mapping",
    label: "Unmapped class / route",
    categories: ["unmapped-class", "unmapped-route"],
    description: "Match spreadsheet labels to existing classes and routes in School Setup Lists, then run the check again.",
    guidance:
      "If a class or route from the spreadsheet does not exist yet, add it in School Setup Lists first. Then come back here and run the dry-run check again to clear these rows.",
    masterDataLink: "/protected/master-data",
  },
  {
    key: "date-issues",
    label: "Date issues",
    categories: ["invalid-dob"],
    description: "Fix invalid DOB values in the source file, then rerun row checks.",
    guidance:
      "Invalid DOB errors usually mean the date format could not be read. Correct the date in the source file and upload again.",
    masterDataLink: null,
  },
  {
    key: "placeholders",
    label: "Placeholder values",
    categories: ["placeholder-values"],
    description: "Rows with values like XYZ, None, or other placeholders should be checked before approval.",
    guidance:
      "Common placeholders like 'XYZ', 'None', 'NA', and 'TBD' are detected automatically. Skip these rows and fix the source data, or approve with an office note if the value is intentional.",
    masterDataLink: null,
  },
  {
    key: "missing-sr",
    label: "Missing SR No",
    categories: ["missing-admission-no"],
    description: "Rows with blank SR numbers where a temporary one will be assigned.",
    guidance:
      "Missing SR numbers are permitted but generate a warning. If approved, a temporary SR number will be assigned automatically.",
    masterDataLink: null,
  },
];

function hasCategory(row: ImportRowDetail, categories: readonly ImportAnomalyCategory[]) {
  if (categories.length === 0) {
    return true;
  }

  return categories.some((category) => row.anomalyCategories.includes(category));
}

type AnomalyQueueProps = {
  batch: ImportBatchDetail;
  unresolvedRows: ImportRowDetail[];
  canManage: boolean;
  mode?: ImportMode;
};

export function AnomalyQueue({ batch, unresolvedRows, canManage, mode = "add" }: AnomalyQueueProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [submittingBulk, setSubmittingBulk] = useState(false);

  const activeConfig = QUEUE_TABS.find((tab) => tab.key === activeTab) ?? QUEUE_TABS[0];
  const filteredRows = unresolvedRows.filter((row) => hasCategory(row, activeConfig.categories));

  const tabCounts = QUEUE_TABS.map((tab) => ({
    ...tab,
    count:
      tab.key === "all"
        ? unresolvedRows.length
        : unresolvedRows.filter((row) => hasCategory(row, tab.categories)).length,
  }));

  async function handleBulkSkip() {
    if (!canManage || !activeConfig.categories.length) return;

    setSubmittingBulk(true);

    try {
      const formData = new FormData();
      formData.set("batchId", batch.id);
      formData.set("importMode", mode);
      formData.set("reviewStatus", "skipped");
      formData.set("reviewNote", `Bulk skipped: ${activeConfig.label}`);

      for (const category of activeConfig.categories) {
        formData.append("categories", category);
      }

      await bulkUpdateImportRowReviewAction(formData);
    } finally {
      setSubmittingBulk(false);
    }
  }

  return (
    <SectionCard
      title="3. Rows needing correction"
      description="Problem rows stay here. Clean rows do not need one-by-one approval."
    >
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabCounts.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {tab.label}
            <span
              className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                activeTab === tab.key
                  ? "bg-white/20 text-white"
                  : tab.count > 0
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <p className="text-sm text-slate-600">{activeConfig.description}</p>

        {activeConfig.guidance ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <span className="font-semibold">Office guidance:</span> {activeConfig.guidance}
          </div>
        ) : null}

        {activeConfig.masterDataLink ? (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-600">Need to add a class or route?</span>
            <Link href={activeConfig.masterDataLink} className="font-medium text-blue-700 underline">
              Open School Setup Lists
            </Link>
          </div>
        ) : null}

        {canManage && activeConfig.categories.length > 0 && filteredRows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-sm text-slate-600">
              Bulk action for {filteredRows.length} row{filteredRows.length === 1 ? "" : "s"}:
            </span>
            <Button size="sm" variant="outline" disabled={submittingBulk} onClick={handleBulkSkip}>
              {submittingBulk ? "Skipping..." : `Skip all ${activeConfig.label}`}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        {filteredRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            No rows are left in this queue.{" "}
            {activeTab === "all"
              ? "All import issues have been resolved."
              : `All ${activeConfig.label.toLowerCase()} issues are resolved.`}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRows.map((row) => (
              <RowDetailCard key={row.id} row={row} batch={batch} canManage={canManage} mode={mode} />
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
