import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { OfficeNotice } from "@/components/office/office-ui";
import { TemplatesListClient } from "@/components/whatsapp-templates/templates-list-client";
import { listWhatsappTemplates } from "@/lib/whatsapp-templates/data";
import { hasStaffPermission, requireAnyStaffPermission } from "@/lib/supabase/session";

export const revalidate = 0;

export default async function WhatsappTemplatesPage() {
  const staff = await requireAnyStaffPermission(["settings:view", "settings:write"], {
    onDenied: "redirect",
  });
  const canEdit = hasStaffPermission(staff, "settings:write");
  const templates = await listWhatsappTemplates();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Tools"
        title="WhatsApp templates"
        description="Pre-canned message templates with placeholder variables used by the defaulters list and receipt sharing."
      />

      <OfficeNotice title="Templates are drafts only" tone="info">
        The app never sends WhatsApp messages on its own. It renders the template with
        the selected student&apos;s data, opens a wa.me link, and lets the staff member
        review and send manually.
      </OfficeNotice>

      <SectionCard
        title="Library"
        description="Templates available to staff for defaulter follow-ups and receipt confirmations."
      >
        <TemplatesListClient templates={templates} canEdit={canEdit} />
      </SectionCard>
    </div>
  );
}
