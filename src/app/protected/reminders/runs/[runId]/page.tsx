import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/ui/shell/page-header";
import { SectionCard } from "@/ui/shell/section-card";
import { OfficeNotice } from "@/ui/office/office-ui";
import { Button } from "@/ui/primitives/button";
import { StatTile } from "@/ui/charts";
import { MobileEmptyRows, MobileRecordCard, MobileStatStrip } from "@/ui/mobile/mobile-kit";
import { createAdminClient } from "@/platform/supabase/admin";
import { requireAnyStaffPermission } from "@/platform/supabase/session";
import {
  listRunOutcomes,
  loadRunHoldout,
  loadRunRecipients,
} from "@/modules/whatsapp/data/campaign-store";
import { loadStuckSends } from "@/modules/whatsapp/data/delivery-store";
import { RunDeliveryPanel } from "./run-delivery-panel";
import { RunMeasurementPanel } from "@/modules/whatsapp/ui/run-measurement-panel";
import { resolveCurrentSessionLabel } from "@/modules/whatsapp/domain/fee-reminders";
import { NOTICE_SITUATIONS } from "@/modules/whatsapp/domain/campaigns";
import { formatInr } from "@/platform/helpers/currency";
import { formatDdMmYyyy, formatDateTimeIst } from "@/platform/helpers/date";
import { isUuid } from "@/platform/helpers/uuid";

/** The numbers move whenever a payment lands. Never cached. */
export const revalidate = 0;

type Props = { params: Promise<{ runId: string }> };

export default async function ReminderRunPage({ params }: Props) {
  await requireAnyStaffPermission(["settings:view", "settings:write"], { onDenied: "redirect" });
  const { runId } = await params;
  // Before any read. Postgres does not return "no rows" for a malformed uuid, it
  // raises `invalid input syntax for type uuid` — an unhandled 500 from a stale
  // link, not the not-found page.
  if (!isUuid(runId)) notFound();
  const supabase = createAdminClient();

  const sessionLabel = await resolveCurrentSessionLabel(supabase);
  const runs = await listRunOutcomes(supabase, sessionLabel, { limit: 200 });
  const run = runs.find((entry) => entry.runId === runId);
  if (!run) notFound();

  const recipients = await loadRunRecipients(supabase, runId);
  const situationLabel =
    NOTICE_SITUATIONS.find((entry) => entry.value === run.situation)?.label ?? run.situation;

  const failedRows = recipients.filter((row) => row.status === "failed");

  // Rows the provider never answered about. Best-effort: a run page that cannot
  // load this is still worth showing.
  const stuck = await loadStuckSends({ supabase, runId }).catch(() => []);
  const holdout = await loadRunHoldout(supabase, runId);

  // Null, not zero, when no delivery report has ever been imported. Zero would
  // read as "nothing arrived", which is a very different thing from "we have not
  // been told".
  const hasDeliveryData =
    run.delivered !== null && run.delivered !== undefined && (run.delivered > 0 || run.readCount > 0 || run.deliveryFailed > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reminders"
        title={`${situationLabel} · ${formatDdMmYyyy(run.startedAt.slice(0, 10))}`}
        description={`${run.campaignName} · started ${formatDateTimeIst(run.startedAt)}`}
        actions={
          // Desk only: this route is a mobile takeover, so MobileTakeoverBar
          // already puts a Back arrow at the top of the phone screen.
          <Button asChild variant="outline" size="sm" className="max-md:hidden">
            <Link href="/protected/reminders/campaigns">All campaigns</Link>
          </Button>
        }
      />

      <SectionCard title="What this run did" description="Messages out, and money in since.">
        {/* Two shapes, one set of numbers. The desk gets four tiles; the phone
            gets the divided strip it uses everywhere else, because four stacked
            tiles is most of a screen before the list even begins. */}
        <div className="md:hidden">
          <MobileStatStrip
            stats={[
              { label: "Messaged", value: run.messaged },
              { label: "Asked for", value: formatInr(run.moneyQuoted) },
              { label: "Paid after", value: run.familiesPaid, tone: run.familiesPaid > 0 ? "success" : "neutral" },
              { label: "Collected", value: formatInr(run.moneyCollected), tone: run.moneyCollected > 0 ? "success" : "neutral" },
            ]}
          />
        </div>
        <div className="hidden gap-3 sm:grid-cols-2 md:grid lg:grid-cols-4">
          <StatTile label="Messaged" value={run.messaged} format="count" />
          <StatTile label="Asked for" value={run.moneyQuoted} format="money" />
          <StatTile label="Paid after it" value={run.familiesPaid} format="count" />
          <StatTile label="Collected since" value={run.moneyCollected} format="money" />
        </div>

        {/* The honest caveat, on the screen rather than in a doc nobody opens. */}
        <p className="mt-3 text-xs text-muted-foreground">
          <strong className="font-semibold text-foreground">Paid after this reminder</strong>, not
          because of it. These are families who were messaged and whose money landed between the
          send and{" "}
          {run.lastDate ? formatDdMmYyyy(run.lastDate) : "now"} — a counter collection entered in
          bulk that day counts here too. Discount close-outs and reversed receipts are excluded.
        </p>
        {run.lateFeePhrase ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            The message quoted:{" "}
            <span className="font-semibold text-foreground">{run.lateFeePhrase}</span>
          </p>
        ) : null}
      </SectionCard>

      {failedRows.length > 0 ? (
        <OfficeNotice title={`${failedRows.length} did not go out`} tone="warning">
          <ul className="mt-1 space-y-1 text-xs">
            {failedRows.slice(0, 10).map((row) => (
              <li key={row.studentId}>
                <span className="font-semibold">{row.studentName}</span> ({row.admissionNo}) —{" "}
                {row.error ?? "no reason recorded"}
              </li>
            ))}
          </ul>
        </OfficeNotice>
      ) : null}

      <SectionCard
        title={`Who was messaged (${recipients.length})`}
        description="Largest amount first, as the run itself was ordered."
      >
        <ul className="flex flex-col gap-2.5 md:hidden">
          {recipients.length === 0 ? (
            <MobileEmptyRows>Nobody was messaged in this run.</MobileEmptyRows>
          ) : null}
          {recipients.map((row) => (
            <MobileRecordCard
              key={row.studentId}
              className={row.status === "failed" ? "opacity-70" : undefined}
              title={row.studentName}
              subtitle={row.admissionNo}
              amount={formatInr(row.dueAmount)}
              status={
                row.status === "failed" ? (
                  <span className="rounded bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
                    Failed
                  </span>
                ) : null
              }
              fields={[{ label: "Number", value: row.destination }]}
              footnote={row.error ?? undefined}
            />
          ))}
        </ul>

        <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
          <table className="w-full min-w-[38rem] text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Adm</th>
                <th className="px-3 py-2 font-semibold">Student</th>
                <th className="px-3 py-2 font-semibold">Number</th>
                <th className="px-3 py-2 text-right font-semibold">Quoted</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((row) => (
                <tr key={row.studentId} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{row.admissionNo}</td>
                  <td className="px-3 py-2">{row.studentName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.destination}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatInr(row.dueAmount)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        row.status === "sent"
                          ? "text-muted-foreground"
                          : "font-semibold text-danger"
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
      <RunMeasurementPanel
        daysToPay={run.daysToPay}
        messaged={run.messaged}
        familiesPaid={run.familiesPaid}
        moneyCollected={run.moneyCollected}
        // Second numbers make a run cost more messages than it has families,
        // and the bill follows the messages.
        messagesBilled={run.messaged + run.failed}
        holdout={holdout}
      />

      <RunDeliveryPanel
        runId={runId}
        failedCount={failedRows.length}
        stuckCount={stuck.length}
        deliveredCount={hasDeliveryData ? run.delivered : null}
        readCount={hasDeliveryData ? run.readCount : null}
      />

    </div>
  );
}
