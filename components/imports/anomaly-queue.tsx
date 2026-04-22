"use client";

import { useState } from "react";
import Link from "next/link";

import { SectionCard } from "@/components/admin/section-card";
import { RowDetailCard } from "@/components/imports/row-detail-card";
import type {
  ImportAnomalyCategory,
  ImportBatchDetail,
  ImportRowDetail,
} from "@/lib/import/types";
import {
  bulkUpdateImportRowReviewAction,
} from "@/app/protected/imports/actions";
import { Button } from "@/components/ui/button";

const CATEGORY_LABELS: Record<ImportAnomalyCategory, string> = {
  "missing-admission-no": "Missing SR / admission no",
  "invalid-dob": "Invalid DOB",
  "duplicate-admission-no": "Duplicate by SR no",
  "duplicate-name-class-dob": "Duplicate by name + class + DOB",
  "unmapped-class": "Unmapped class",
  "unmapped-route": "Unmapped route",
  "missing-parent-fields": "Missing parent fields",
  "placeholder-values": "Placeholder values",
};

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
    description: "All rows with unresolved anomalies that need office review.",
    guidance: null,
    masterDataLink: null,
  },
  {
    key: "duplicates",
    label: "Duplicates",
    categories: ["duplicate-admission-no", "duplicate-name-class-dob"],
    description: "Review SR and identity duplicates, then hold/skip or approve valid non-risk rows.",
    guidance: "Click 'Review matched existing student' to compare the import row against the existing student record. If they are the same student, skip. If this is a new entry with a conflicting SR no, correct the source data.",
    masterDataLink: null,
  },
  {
    key: "mapping",
    label: "Unmapped class / route",
    categories: ["unmapped-class", "unmapped-route"],
    description: "Map spreadsheet labels to existing classes/routes in master data, then rerun dry-run.",
    guidance: "If a class or route from your spreadsheet doesn't exist yet, add it in Master Data first. Then come back here and re-run the dry-run QA to clear these rows.",
    masterDataLink: "/protected/master-data",
  },
  {
    key: "dob-parent",
    label: "DOB / parent fields",
    categories: ["invalid-dob", "missing-parent-fields"],
    description: "Fix DOB and parent details through source correction, then rerun dry-run. Warnings can be approved with office notes if acceptable.",
    guidance: "Invalid DOB errors usually mean the date format couldn't be parsed. Missing parent fields are warnings — you can approve these rows if the office accepts incomplete data, but add an office note explaining why.",
    masterDataLink: null,
  },
  {
    key: "placeholders",
    label: "Placeholder values",
    categories: ["placeholder-values"],
    description: "Rows with values like XYZ, None, or other placeholders must be reviewed before approval.",
    guidance: "Common placeholders like 'XYZ', 'None', 'NA', 'TBD' are detected automatically. Skip these rows and fix the source data, or approve with an office note if the value is intentional.",
    masterDataLink: null,
  },
  {
    key: "missing-sr",
    label: "Missing SR no",
    categories: ["missing-admission-no"],
    description: "Rows without SR no / admission number cannot be imported. Fix the source data.",
    guidance: "Every student requires a unique SR number. Fix these in the spreadsheet and re-upload, or skip the rows.",
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
};

export function AnomalyQueue({ batch, unresolvedRows, canManage }: AnomalyQueueProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [submittingBulk, setSubmittingBulk] = useState(false);

  const activeConfig = QUEUE_TABS.find((tab) => tab.key === activeTab) ?? QUEUE_TABS[0];
  const filteredRows = unresolvedRows.filter((row) =>
    hasCategory(row, activeConfig.categories),
  );

  const tabCounts = QUEUE_TABS.map((tab) => ({
    ...tab,
    count: tab.key === "all"
      ? unresolvedRows.length
      : unresolvedRows.filter((row) => hasCategory(row, tab.categories)).length,
  }));

  async function handleBulkSkip() {
    if (!canManage || !activeConfig.categories.length) return;

    setSubmittingBulk(true);

    try {
      const formData = new FormData();
      formData.set("batchId", batch.id);
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
      title="3. Anomaly resolution queues"
      description="Office staff should clear, hold, or skip each anomaly row before go-live. Use the tabs below to work through each category."
    >
      {/* Tab bar */}
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
            <span className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold ${
              activeTab === tab.key
                ? "bg-white/20 text-white"
                : tab.count > 0
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-200 text-slate-500"
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Active queue description and guidance */}
      <div className="mt-4 space-y-3">
        <p className="text-sm text-slate-600">{activeConfig.description}</p>

        {activeConfig.guidance ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <span className="font-semibold">💡 Staff guidance:</span> {activeConfig.guidance}
          </div>
        ) : null}

        {activeConfig.masterDataLink ? (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-600">Need to add a class or route?</span>
            <Link href={activeConfig.masterDataLink} className="font-medium text-blue-700 underline">
              Open Master Data →
            </Link>
          </div>
        ) : null}

        {/* Bulk actions */}
        {canManage && activeConfig.categories.length > 0 && filteredRows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-sm text-slate-600">
              Bulk action for {filteredRows.length} row{filteredRows.length === 1 ? "" : "s"}:
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={submittingBulk}
              onClick={handleBulkSkip}
            >
              {submittingBulk ? "Skipping…" : `Skip all ${activeConfig.label}`}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Row list */}
      <div className="mt-4">
        {filteredRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            ✓ No rows in this queue. {activeTab === "all" ? "All anomalies have been resolved." : `All ${activeConfig.label.toLowerCase()} issues are resolved.`}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRows.map((row) => (
              <RowDetailCard key={row.id} row={row} batch={batch} canManage={canManage} />
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
