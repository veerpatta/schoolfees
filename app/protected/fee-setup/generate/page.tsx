import { PageHeader } from "@/components/admin/page-header";
import { GenerateLedgerClient } from "@/components/fees/generate-ledger-client";
import { requireStaffPermission } from "@/lib/supabase/session";
import { previewGenerationAction, submitGenerationAction } from "./actions";

export default async function GenerateLedgerPage() {
  await requireStaffPermission("fees:write", { onDenied: "redirect" });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fee Setup"
        title="Session Ledger Sync"
        description="Preview how the canonical fee policy will insert, update, or cancel unpaid installments for the active academic session before you run the sync."
      />

      <GenerateLedgerClient 
        previewAction={previewGenerationAction}
        submitAction={submitGenerationAction}
      />
    </div>
  );
}
