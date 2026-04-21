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
        title="Session Ledger Generation"
        description="Convert fee settings into student ledger installments for a new academic session. You can preview the generation before running it."
      />

      <GenerateLedgerClient 
        previewAction={previewGenerationAction}
        submitAction={submitGenerationAction}
      />
    </div>
  );
}
