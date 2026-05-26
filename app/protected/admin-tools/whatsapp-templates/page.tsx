import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { OfficeNotice } from "@/components/office/office-ui";
import { TemplatesListClient } from "@/components/whatsapp-templates/templates-list-client";
import { listWhatsappTemplates } from "@/lib/whatsapp-templates/data";
import { hasStaffPermission, requireAnyStaffPermission } from "@/lib/supabase/session";

export const revalidate = 0;

export default async function WhatsappTemplatesPage() {
  const t = await getTranslations("AdminTools");
  const staff = await requireAnyStaffPermission(["settings:view", "settings:write"], {
    onDenied: "redirect",
  });
  const canEdit = hasStaffPermission(staff, "settings:write");
  const templates = await listWhatsappTemplates();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("whatsappTitle")}
        description={t("whatsappDescription")}
      />

      <OfficeNotice title={t("whatsappNoticeTitle")} tone="info">
        {t("whatsappNoticeBody")}
      </OfficeNotice>

      <SectionCard
        title={t("whatsappLibraryTitle")}
        description={t("whatsappLibraryDescription")}
      >
        <TemplatesListClient templates={templates} canEdit={canEdit} />
      </SectionCard>
    </div>
  );
}
