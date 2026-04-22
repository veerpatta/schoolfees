import { PageHeader } from "@/components/admin/page-header";
import { GenerateLedgerClient } from "@/components/fees/generate-ledger-client";
import { INITIAL_LEDGER_REGENERATION_ACTION_STATE } from "@/lib/fees/types";
import { requireStaffPermission } from "@/lib/supabase/session";
import { runLedgerRegenerationAction } from "./actions";

export default async function GenerateLedgerPage() {
  await requireStaffPermission("fees:write", { onDenied: "redirect" });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fee Setup"
        title="Ledger recalculation"
        description="Preview how the current fee policy will recalculate future and unpaid installment rows for the active academic session before you apply it."
      />

      <GenerateLedgerClient
        initialState={INITIAL_LEDGER_REGENERATION_ACTION_STATE}
        action={runLedgerRegenerationAction}
      />
    </div>
  );
}
