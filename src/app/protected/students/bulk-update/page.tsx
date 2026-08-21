import { PageHeader } from "@/ui/shell/page-header";
import { BulkUpdateWorkspace } from "@/modules/students/ui/bulk-update-workspace";
import { getActiveSessionLabel } from "@/platform/session/active";
import { getBulkUpdateClassOptions } from "@/modules/students/data/bulk-update/data";
import { requireStaffPermission } from "@/platform/supabase/session";

export default async function StudentBulkUpdatePage() {
  await requireStaffPermission("students:write", { onDenied: "redirect" });

  const sessionLabel = await getActiveSessionLabel();
  const classOptions = await getBulkUpdateClassOptions(sessionLabel);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Bulk update"
        description="Pick the classes and the fields you want to change, fill the downloaded sheet, and review every change before it saves."
      />

      <BulkUpdateWorkspace sessionLabel={sessionLabel} classOptions={classOptions} />
    </div>
  );
}
