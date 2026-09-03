"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  NOTICE_LANGUAGES,
  NOTICE_SITUATIONS,
  TEMPLATE_INSTALLMENTS,
  type NoticeSituation,
} from "@/modules/whatsapp/domain/campaigns";
import { parseCampaignSchedule } from "@/modules/whatsapp/domain/campaign-schedule";
import { LATE_FEE_BASES, lateFeePhrase } from "@/modules/whatsapp/domain/late-fee";
import type { CampaignRunOutcome, SavedCampaign } from "@/modules/whatsapp/data/campaign-store";
import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Notice } from "@/ui/primitives/notice";
import { SelectNative } from "@/ui/primitives/select-native";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";
import { formatInr } from "@/platform/helpers/currency";
import { formatDdMmYyyy } from "@/platform/helpers/date";

/**
 * Saved campaigns: name a set of settings once, apply it as often as you like.
 *
 * **A campaign stores the rule, never the list.** Running one rebuilds the
 * audience from the ledger, which is why families who have paid simply are not
 * in the next run — there is nothing to un-tick and nothing to clear. That is
 * also why "Load" hands you the send screen with the settings applied rather
 * than sending anything: every send stays a press.
 */

/**
 * The two server actions arrive as props rather than being imported.
 *
 * A module's `ui/` importing from `src/app/` is `module-reaches-app`, a ratchet
 * in `quality/architecture-baseline.json` that only ever falls. The page lives
 * in `app/` and can import both, so it hands them down — which is the ordinary
 * React shape anyway and leaves this component testable without a route.
 */
export type CampaignFormState = { status: "idle" | "success" | "error"; message?: string };
type CampaignAction = (
  state: CampaignFormState,
  formData: FormData,
) => Promise<CampaignFormState>;

type Props = {
  saveAction: CampaignAction;
  archiveAction: CampaignAction;
  campaigns: SavedCampaign[];
  /** Latest runs per campaign id, for the "last run" line. */
  runsByCampaign: Record<string, CampaignRunOutcome[]>;
  classOptions: Array<{ classId: string; label: string }>;
  canWrite: boolean;
  /** Opening value for a new campaign's date, from the fee policy. */
  defaultLastDate: string;
  defaultLateFeeAmount: number;
};

const IDLE: CampaignFormState = { status: "idle" };

/** The send screen, with this campaign's settings already applied. */
export function campaignHref(campaign: SavedCampaign): string {
  const params = new URLSearchParams();
  params.set("situation", campaign.situation);
  params.set("language", campaign.language);
  params.set("maxTotalPaid", String(campaign.filters.maxTotalPaid));
  params.set("minDueAmount", String(campaign.filters.minDueAmount));
  params.set("installments", campaign.filters.installments.join(","));
  if (campaign.filters.classId) params.set("classId", campaign.filters.classId);
  if (campaign.filters.includeRte) params.set("includeRte", "on");
  if (campaign.lastDate) params.set("lastDate", formatDdMmYyyy(campaign.lastDate));
  params.set("lateFeeAmount", String(campaign.lateFeeAmount));
  params.set("lateFeeBasis", campaign.lateFeeBasis);
  // Carried so the run records which campaign it came from.
  params.set("campaignId", campaign.id);
  return `/protected/reminders?${params.toString()}`;
}

function situationLabel(situation: NoticeSituation): string {
  return NOTICE_SITUATIONS.find((entry) => entry.value === situation)?.label ?? situation;
}

/**
 * The saved schedule for the campaign being edited, or null.
 *
 * Parsed rather than read raw, so a hand-edited row cannot put an unusable value
 * into a form control and then straight back into the database.
 */
function scheduleOf(campaign: { schedule?: unknown } | null | undefined) {
  return campaign ? parseCampaignSchedule(campaign.schedule) : null;
}

export function CampaignManager({
  saveAction: saveCampaignAction,
  archiveAction: archiveCampaignAction,
  campaigns,
  runsByCampaign,
  classOptions,
  canWrite,
  defaultLastDate,
  defaultLateFeeAmount,
}: Props) {
  const [editing, setEditing] = useState<SavedCampaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [saveState, saveAction] = useActionState(saveCampaignAction, IDLE);
  const [archiveState, archiveAction] = useActionState(archiveCampaignAction, IDLE);

  useActionFeedback(saveState, { successTitle: "Campaign saved", errorTitle: "Not saved" });
  useActionFeedback(archiveState, { successTitle: "Done", errorTitle: "Could not do that" });

  const open = editing ?? (creating ? null : undefined);
  const showForm = creating || editing !== null;

  return (
    <div className="flex flex-col gap-5">
      {campaigns.length === 0 && !showForm ? (
        <Notice tone="info" title="No saved campaigns yet">
          <p>
            A campaign is a set of settings with a name — which notice, in which language, to whom,
            by when, and what late fee it quotes. Save one and you can apply it again next week
            without rebuilding the filters.
          </p>
          <p className="mt-1.5">
            It saves the <strong>rule</strong>, never the list. Families who pay in the meantime are
            simply not in the next run.
          </p>
        </Notice>
      ) : null}

      {campaigns.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {campaigns.map((campaign) => {
            const runs = runsByCampaign[campaign.id] ?? [];
            const last = runs[0];
            const phrase = lateFeePhrase(
              campaign.lateFeeAmount,
              campaign.lateFeeBasis,
              campaign.language,
            );
            return (
              <li
                key={campaign.id}
                className="rounded-xl border border-border bg-card p-3.5 md:p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-extrabold tracking-tight text-foreground">
                      {campaign.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {situationLabel(campaign.situation)} ·{" "}
                      {campaign.language === "hi" ? "हिंदी" : "English"}
                      {campaign.filters.classId
                        ? ` · ${classOptions.find((c) => c.classId === campaign.filters.classId)?.label ?? "one class"}`
                        : " · All classes"}
                      {campaign.situation === "prevyear"
                        ? ""
                        : ` · Inst ${campaign.filters.installments.join(" & ")}`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Late fee on the message:{" "}
                      <span className="font-semibold text-foreground">{phrase}</span>
                      {campaign.lastDate ? ` · by ${formatDdMmYyyy(campaign.lastDate)}` : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={campaignHref(campaign)}>Load</Link>
                    </Button>
                    {canWrite ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCreating(false);
                            setEditing(campaign);
                          }}
                        >
                          Edit
                        </Button>
                        <form action={archiveAction}>
                          <input type="hidden" name="campaignId" value={campaign.id} />
                          <input
                            type="hidden"
                            name="archived"
                            value={campaign.archivedAt ? "false" : "true"}
                          />
                          <Button type="submit" size="sm" variant="ghost">
                            {campaign.archivedAt ? "Restore" : "Archive"}
                          </Button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </div>

                {/* What it has actually collected, not what it was set up to ask for. */}
                {/* The sentence and the action are separate rows, not one
                    paragraph with a link in the middle: inline links render
                    ~15px tall, which is under any thumb. */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-border pt-2.5 text-xs text-muted-foreground">
                  {last ? (
                    <>
                      <span>
                        Last run {formatDdMmYyyy(last.startedAt.slice(0, 10))} ·{" "}
                        <strong className="font-semibold text-foreground">{last.messaged}</strong>{" "}
                        messaged ·{" "}
                        <strong className="font-semibold text-foreground">
                          {last.familiesPaid}
                        </strong>{" "}
                        paid after it ({formatInr(last.moneyCollected)} of{" "}
                        {formatInr(last.moneyQuoted)} asked)
                        {runs.length > 1 ? ` · ${runs.length} runs in all` : null}
                      </span>
                      <Link
                        href={`/protected/reminders/runs/${last.runId}`}
                        className="focus-ring inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2 md:min-h-0"
                      >
                        See the run
                      </Link>
                    </>
                  ) : (
                    <span>Never run.</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {canWrite && !showForm ? (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            Save a new campaign
          </Button>
        </div>
      ) : null}

      {showForm ? (
        <form
          action={saveAction}
          className="rounded-xl border border-border bg-surface-2 p-3.5 md:p-4"
        >
          <h2 className="text-[14px] font-extrabold tracking-tight text-foreground">
            {editing ? `Edit "${editing.name}"` : "New campaign"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Settings only. The families are worked out from the ledger each time it is run.
          </p>

          {editing ? <input type="hidden" name="campaignId" value={editing.id} /> : null}

          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={80}
                defaultValue={open?.name ?? ""}
                placeholder="August chase — Class 1 to 5"
                className="md:max-w-md"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="situation">Notice</Label>
              <SelectNative id="situation" name="situation" defaultValue={open?.situation ?? "fee_due"}>
                {NOTICE_SITUATIONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </SelectNative>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="language">Language</Label>
              <SelectNative id="language" name="language" defaultValue={open?.language ?? "hi"}>
                {NOTICE_LANGUAGES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </SelectNative>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="classId">Class</Label>
              <SelectNative
                id="classId"
                name="classId"
                defaultValue={open?.filters.classId ?? ""}
              >
                <option value="">All classes</option>
                {classOptions.map((option) => (
                  <option key={option.classId} value={option.classId}>
                    {option.label}
                  </option>
                ))}
              </SelectNative>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="installments">Installments</Label>
              <SelectNative
                id="installments"
                name="installments"
                defaultValue={(open?.filters.installments ?? [...TEMPLATE_INSTALLMENTS]).join(",")}
              >
                <option value="1,2">1 and 2</option>
                <option value="1">1 only</option>
                <option value="2">2 only</option>
                <option value="1,2,3">1, 2 and 3</option>
                <option value="3">3 only</option>
              </SelectNative>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cLastDate">Date on the message</Label>
              <Input
                id="cLastDate"
                name="lastDate"
                placeholder="DD-MM-YYYY"
                defaultValue={
                  open?.lastDate ? formatDdMmYyyy(open.lastDate) : defaultLastDate
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cLateFeeAmount">Late fee amount</Label>
              <Input
                id="cLateFeeAmount"
                name="lateFeeAmount"
                type="number"
                min={0}
                defaultValue={open?.lateFeeAmount ?? defaultLateFeeAmount}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cLateFeeBasis">Charged</Label>
              <SelectNative
                id="cLateFeeBasis"
                name="lateFeeBasis"
                defaultValue={open?.lateFeeBasis ?? "per_installment"}
              >
                {LATE_FEE_BASES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </SelectNative>
            </div>

            {/* --------------------------------------------------- schedule */}
            {/* flex gap rather than space-y: the auto row is conditional, and
                space-y also puts a margin around a hidden child. */}
            <div className="flex w-full basis-full flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Schedule
              </p>
              <p className="text-xs text-muted-foreground">
                Relative to an installment, so a campaign written in April still fires correctly in
                January. Leave it unscheduled for one you only ever run by hand.
              </p>
              {/* Wraps onto two rows on a phone, one at the desk. */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cScheduleInstallment">Installment</Label>
                  <SelectNative
                    id="cScheduleInstallment"
                    name="scheduleInstallment"
                    defaultValue={scheduleOf(open)?.installment?.toString() ?? ""}
                    className="w-36"
                  >
                    <option value="">Not scheduled</option>
                    {[1, 2, 3, 4].map((installment) => (
                      <option key={installment} value={installment}>
                        Installment {installment}
                      </option>
                    ))}
                  </SelectNative>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cScheduleOffsetDays">When</Label>
                  <SelectNative
                    id="cScheduleOffsetDays"
                    name="scheduleOffsetDays"
                    defaultValue={scheduleOf(open)?.offsetDays?.toString() ?? "-10"}
                    className="w-56"
                  >
                    <option value="-10">10 days before it is due</option>
                    <option value="-3">3 days before it is due</option>
                    <option value="0">On the day it is due</option>
                    <option value="1">1 day after it was due</option>
                    <option value="15">15 days after it was due</option>
                  </SelectNative>
                </div>
              </div>
              {/* min-h-11 so the whole sentence is a comfortable tap target. */}
              <label className="flex min-h-11 items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="scheduleAuto"
                  defaultChecked={scheduleOf(open)?.auto === true}
                  className="mt-1 size-4 shrink-0"
                />
                <span>
                  <span className="font-semibold">Send this campaign automatically.</span>{" "}
                  <span className="text-muted-foreground">
                    On its scheduled day it will message families without anybody pressing Send.
                    It still refuses on a passed date, an unapproved template or an empty list.
                    Off unless you tick it.
                  </span>
                </span>
              </label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cMaxTotalPaid">Paid so far threshold</Label>
              <Input
                id="cMaxTotalPaid"
                name="maxTotalPaid"
                type="number"
                min={0}
                defaultValue={open?.filters.maxTotalPaid ?? 1100}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cMinDueAmount">Minimum amount</Label>
              <Input
                id="cMinDueAmount"
                name="minDueAmount"
                type="number"
                min={0}
                defaultValue={open?.filters.minDueAmount ?? 1}
              />
            </div>

            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="includeRte"
                  defaultChecked={open?.filters.includeRte ?? false}
                  className="size-4 rounded border-border-strong"
                />
                Include RTE
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <PendingSubmitButton idleLabel="Save campaign" pendingLabel="Saving…" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <span className="text-xs text-muted-foreground">
              Saving sends nothing. Load it when you are ready, then press Send.
            </span>
          </div>
        </form>
      ) : null}
    </div>
  );
}
