import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { UploadCloud, AlertCircle, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";

export default function ImportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Imports"
        title="Student spreadsheet import"
        description="Run a dry-run validation on your workbooks before importing them into the master records."
        actions={<StatusBadge label="Architecture preview" tone="warning" />}
      />

      {/* Upload Zone Placeholder */}
      <SectionCard 
        title="Upload new batch"
        description="Select a CSV or XLSX file containing student data. The system will validate all rows before saving."
      >
        <div className="mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 transition-colors hover:bg-slate-100">
          <UploadCloud className="size-10 text-slate-400" />
          <h3 className="mt-4 text-sm font-semibold text-slate-900">Click to upload or drag and drop</h3>
          <p className="mt-1 text-sm text-slate-500">CSV or XLSX (max. 10MB)</p>
          <div className="mt-6">
            <button
              disabled
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white opacity-50 shadow hover:bg-slate-800"
            >
              Select File
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Dry Run / Error Reporting Structure Placeholder */}
      <SectionCard
        title="Dry Run Results (Preview)"
        description="A mock verification report showing how duplicate detection and schema validation will be grouped."
      >
        <div className="mt-4 space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
             <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-500">Total Rows</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">142</p>
             </div>
             <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-600">Valid</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-900">138</p>
             </div>
             <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-medium text-rose-600">Invalid Schema</p>
                <p className="mt-1 text-2xl font-semibold text-rose-900">3</p>
             </div>
             <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-600">Duplicates</p>
                <p className="mt-1 text-2xl font-semibold text-amber-900">1</p>
             </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Errors & Warnings</h3>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex items-start gap-3 p-4">
                <XCircle className="mt-0.5 size-5 shrink-0 text-rose-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Row 42: Missing required field</p>
                  <p className="text-sm text-slate-500">Column 'SR No' is empty. Every student must have a valid Admission/SR Number.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4">
                <XCircle className="mt-0.5 size-5 shrink-0 text-rose-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Row 88: Invalid Data Type</p>
                  <p className="text-sm text-slate-500">Column 'Tuition Override' contains text ("Free") instead of a numeric value.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4">
                 <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Row 112: Duplicate DB Record</p>
                  <p className="text-sm text-slate-500">Student with SR Number '1044' already exists in the master records.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              Cancel Import
            </button>
            <button disabled className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white opacity-50 shadow">
              Proceed with Valid Rows (138)
            </button>
          </div>
        </div>
      </SectionCard>
      
      <SectionCard
        title="Expected CSV format"
        description="You can view our column mapping rules in the architecture."
      >
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {[
            "Student Name *", "Class *", "SR No *", "DOB", "Father Name", 
            "Mother Name", "Phones", "Transport Route", "Status",
            "Tuition Override", "Transport Override", "Other Fee Head", "Other Fee Amount"
          ].map((column) => (
            <div
              key={column}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
            >
              <FileSpreadsheet className="size-4 text-slate-400" />
              {column}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
