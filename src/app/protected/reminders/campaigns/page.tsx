import Link from "next/link";

import { PageHeader } from "@/ui/shell/page-header";
import { Button } from "@/ui/primitives/button";
import { SectionCard } from "@/ui/shell/section-card";
import { OfficeNotice } from "@/ui/office/office-ui";
import { CampaignManager } from "@/modules/whatsapp/ui/campaign-manager";
import { RunComparisons } from "@/modules/whatsapp/ui/run-comparisons";
import { createAdminClient } from "@/platform/supabase/admin";
import { hasStaffPermission, requireAnyStaffPermission } from "@/platform/supabase/session";
import {
  listCampaigns,
  listRunOutcomes,
  type CampaignRunOutcome,
  type SavedCampaign,
} from "@/modules/whatsapp/data/campaign-store";
import { resolveCurrentSessionLabel, istToday } from "@/modules/whatsapp/domain/fee-reminders";
import { getFeePolicySummary } from "@/modules/fees/data/policy";
import { formatDdMmYyyy } from "@/platform/helpers/date";
import { archiveCampaignAction, saveCampaignAction } from "./actions";

/**
 * Saved campaigns and how they have done.
 *
 * Not cached. The run figures move whenever a payment lands, and a stale
 * "3 families paid" is the kind of number somebody acts on.
 */
export const revalidate = 0;

export default async function ReminderCampaignsPage() {
  const staff = await requireAnyStaffPermission(["settings:view", "settings:write"], {
    onDenied: "redirect",
  });
  const canWrite = hasStaffPermission(staff, "settings:write");
  const supabase = createAdminClient();

  let sessionLabel = "";
  let campaigns: SavedCampaign[] = [];
  let runs: CampaignRunOutcome[] = [];
  let classOptions: Array<{ classId: string; label: string }> = [];
  let defaultLastDate = "";
  let defaultLateFeeAmount = 0;
  let loadError: string | null = null;

  try {
    sessionLabel = await resolveCurrentSessionLabel(supabase);
    const policy = await getFeePolicySummary({ useAdmin: true }).catch(() => null);
    defaultLateFeeAmount = Number(policy?.lateFeeFlatAmount ?? 0);
    const upcoming = (policy?.installmentSchedule ?? [])
      .map((entry) => entry.dueDate)
      .filter((due): due is string => Boolean(due) && due >= istToday())
      .sort()[0];
    defaultLastDate = formatDdMmYyyy(upcoming ?? null);

    [campaigns, runs] = await Promise.all([
      listCampaigns(supabase, sessionLabel),
      listRunOutcomes(supabase, sessionLabel),
    ]);

    const { data: classes } = await supabase
      .from("classes")
      .select("id, class_name")
      .eq("session_label", sessionLabel)
      .order("class_name");
    classOptions = ((classes ?? []) as Array<{ id: string; class_name: string }>).map((row) => ({
      classId: String(row.id),
      label: String(row.class_name),
    }));
  } catch (caught) {
    loadError = caught instanceof Error ? caught.message : "Could not load campaigns.";
  }

  // Newest first per campaign, so the list can show "last run" without a second query.
  const runsByCampaign: Record<string, CampaignRunOutcome[]> = {};
  for (const run of runs) {
    if (!run.campaignId) continue;
    (runsByCampaign[run.campaignId] ??= []).push(run);
  }

  const adHoc = runs.filter((run) => !run.campaignId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reminders"
        title="Campaigns"
        description="Named settings you can apply again. Saving one sends nothing."
        actions={
          // Desk only: this route is a mobile takeover, so MobileTakeoverBar
          // already puts a Back arrow at the top of the phone screen.
          <Button asChild variant="outline" size="sm" className="max-md:hidden">
            <Link href="/protected/reminders">Back to sending</Link>
          </Button>
        }
      />

      {loadError ? (
        <OfficeNotice title="Could not load campaigns" tone="danger">
          {loadError}
        </OfficeNotice>
      ) : (
        <>
          {/* Above the campaign list: "which of these works better" is the
              question the office came to this page with. */}
          <RunComparisons
            runs={runs.map((run) => ({
              language: run.language,
              situation: run.situation,
              startedAt: run.startedAt,
              messaged: run.messaged,
              familiesPaid: run.familiesPaid,
              daysToPay: run.daysToPay,
              scheduledFor: run.scheduledFor,
              lastDate: run.lastDate,
            }))}
          />

          <SectionCard
            title="Saved campaigns"
            description={`Session ${sessionLabel}. A campaign stores the rule, not the list — run it again and anyone who has paid since simply is not in it.`}
          >
            <CampaignManager
              saveAction={saveCampaignAction}
              archiveAction={archiveCampaignAction}
              campaigns={campaigns}
              runsByCampaign={runsByCampaign}
              classOptions={classOptions}
              canWrite={canWrite}
              defaultLastDate={defaultLastDate}
              defaultLateFeeAmount={defaultLateFeeAmount}
            />
          </SectionCard>

          {adHoc.length > 0 ? (
            <SectionCard
              title="Sends not attached to a campaign"
              description="Pressed straight from the send screen. Still recorded, still measurable."
            >
              <ul className="flex flex-col gap-2">
                {adHoc.slice(0, 10).map((run) => (
                  <li key={run.runId} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <Link
                      href={`/protected/reminders/runs/${run.runId}`}
                      className="focus-ring font-semibold text-accent underline underline-offset-2"
                    >
                      {formatDdMmYyyy(run.startedAt.slice(0, 10))}
                    </Link>
                    <span className="text-muted-foreground">
                      {run.messaged} messaged · {run.familiesPaid} paid after it
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {run.campaignName}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
