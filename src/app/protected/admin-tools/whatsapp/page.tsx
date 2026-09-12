import Link from "next/link";

import { PageHeader } from "@/ui/shell/page-header";
import { SectionCard } from "@/ui/shell/section-card";
import { Button } from "@/ui/primitives/button";
import { WhatsappSettingsForm } from "@/modules/whatsapp/ui/whatsapp-settings-form";
import { loadWhatsappSettings } from "@/modules/whatsapp/data/whatsapp-settings";
import { isAisensyConfigured } from "@/modules/whatsapp/data/aisensy";
import { StatusBadge } from "@/ui/shell/status-badge";
import { createAdminClient } from "@/platform/supabase/admin";
import { requireStaffPermission } from "@/platform/supabase/session";

import { saveWhatsappSettingsAction } from "./actions";

/**
 * The WhatsApp controls, on a screen.
 *
 * This route replaces `/protected/admin-tools/whatsapp-templates`, and the
 * swap says what changed. That screen let staff write message bodies into a
 * `whatsapp_templates` table, which was then rendered into `wa.me` links —
 * text nobody had approved, sent from whichever account the staff member
 * happened to be signed into, recorded nowhere.
 *
 * Message bodies now live in AiSensy and Meta, where they are approved before
 * they can be sent at all, so there is nothing here to write. What IS here is
 * everything that used to be a production SQL statement: whether receipts send
 * by themselves, whether a reversal is announced, when messages may go out, and
 * what the month is allowed to cost.
 */
export default async function WhatsappSettingsPage() {
  const staff = await requireStaffPermission("settings:view", { onDenied: "redirect" });
  const canEdit = staff.appRole === "admin";

  // Read under the service role. `app_settings` carries no per-staff policy,
  // the RBAC decision is the guard above, and the usage count reads a table
  // staff have no reason to hold rights on.
  const settings = await loadWhatsappSettings(createAdminClient());
  const providerReady = isAisensyConfigured();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Tools"
        title="WhatsApp"
        description="What the school sends parents by itself, when it may send, and what a month may cost."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/protected/reminders">Open reminders</Link>
          </Button>
        }
      />

      <SectionCard
        title="Message templates live in AiSensy"
        description="Every parent-facing message uses a Meta-approved UTILITY template. There is no body to edit here, and that is the point: an approved template cannot be changed into something nobody reviewed."
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={providerReady ? "AiSensy connected" : "AISENSY_API_KEY not set"}
            tone={providerReady ? "good" : "warning"}
          />
          {providerReady ? null : (
            <span className="text-xs text-muted-foreground">
              Nothing will send until the key is configured.
            </span>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Controls"
        description="These were database rows until 12 September 2026. Turning automatic receipts on used to mean editing production by hand."
      >
        <WhatsappSettingsForm
          initial={{
            receiptNoticeEnabled: settings.receiptNoticeEnabled,
            reversalNoticeEnabled: settings.reversalNoticeEnabled,
            quietHoursStart: settings.quietHoursStart,
            quietHoursEnd: settings.quietHoursEnd,
            runMessageCap: settings.runMessageCap,
            monthMessageCap: settings.monthMessageCap,
            oneMessagePerFamily: settings.oneMessagePerFamily,
          }}
          messagesSentThisMonth={settings.messagesSentThisMonth}
          canEdit={canEdit}
          action={saveWhatsappSettingsAction}
        />
      </SectionCard>
    </div>
  );
}
