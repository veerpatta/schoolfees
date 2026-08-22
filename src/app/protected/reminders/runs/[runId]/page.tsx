import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/ui/shell/page-header";
import { SectionCard } from "@/ui/shell/section-card";
import { OfficeNotice } from "@/ui/office/office-ui";
import { Button } from "@/ui/primitives/button";
import { StatTile } from "@/ui/charts";
import { createAdminClient } from "@/platform/supabase/admin";
import { requireAnyStaffPermission } from "@/platform/supabase/session";
import { listRunOutcomes, loadRunRecipients } from "@/modules/whatsapp/data/campaign-store";
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reminders"
        title={`${situationLabel} · ${formatDdMmYyyy(run.startedAt.slice(0, 10))}`}
        description={`${run.campaignName} · started ${formatDateTimeIst(run.startedAt)}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/protected/reminders/campaigns">All campaigns</Link>
          </Button>
        }
      />

      <SectionCard title="What this run did" description="Messages out, and money in since.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="overflow-x-auto rounded-lg border border-border">
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
    </div>
  );
}
