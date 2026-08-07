import { buildPaymentImportTemplateFile } from "@/lib/payments/bulk/template";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";

import { withDownloadToken } from "@/lib/helpers/download-token";
export async function GET(request: Request) {
  const staff = await getAuthenticatedStaff();
  if (!staff || !hasStaffPermission(staff, "payments:bulk")) {
    return new Response("Forbidden", { status: 403 });
  }

  const buffer = await buildPaymentImportTemplateFile();

  return withDownloadToken(
    request,
    new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="bulk-payments-template.xlsx"',
      "cache-control": "no-store",
    },
    }),
  );
}
