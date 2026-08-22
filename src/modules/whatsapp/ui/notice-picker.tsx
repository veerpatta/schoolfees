"use client";

import Link from "next/link";

import {
  NOTICE_LANGUAGES,
  NOTICE_SITUATIONS,
  type NoticeLanguage,
  type NoticeSituation,
} from "@/modules/whatsapp/domain/campaigns";
import { LATE_FEE_BASES, lateFeePhrase } from "@/modules/whatsapp/domain/late-fee";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { SelectNative } from "@/ui/primitives/select-native";
import { cn } from "@/platform/utils";
import type { ReminderFilters } from "@/modules/whatsapp/domain/fee-reminders";

/**
 * Which notice is going out, in which language, by when, and with what late fee.
 *
 * Links, not buttons, for the notice and the language. Changing the notice
 * changes the audience, so it has to be linkable and back-navigable — the same
 * rule the Dashboard boards follow — and the server action re-derives the list
 * from the very same query string, so a choice held in client state could send
 * to a different set of families than the office is looking at.
 *
 * The chips carry counts because a notice with nobody in it is worth seeing
 * before you pick it: "Balance 171" is the difference between a considered
 * choice and a guess.
 */

type Props = {
  filters: ReminderFilters;
  counts: Record<NoticeSituation, number>;
  /** Rendered inside the GET filter form, so the date round-trips with everything else. */
  dateFieldId: string;
  /** Shown when the phrase will not match what the ledger charges. Never blocks. */
  lateFeeWarning: string | null;
};

/** Keeps every other filter while changing one thing. */
function hrefWith(
  filters: ReminderFilters,
  override: Partial<Pick<ReminderFilters, "situation" | "language">>,
): string {
  const params = new URLSearchParams();
  params.set("situation", override.situation ?? filters.situation);
  params.set("language", override.language ?? filters.language);
  params.set("maxTotalPaid", String(filters.maxTotalPaid));
  params.set("minDueAmount", String(filters.minDueAmount));
  params.set("installments", filters.installments.join(","));
  if (filters.classId) params.set("classId", filters.classId);
  if (filters.includeRte) params.set("includeRte", "on");
  if (filters.lastDate) params.set("lastDate", filters.lastDate);
  // The late fee travels too, or switching notice silently rewrites what the
  // message threatens.
  params.set("lateFeeAmount", String(filters.lateFeeAmount));
  params.set("lateFeeBasis", filters.lateFeeBasis);
  return `?${params.toString()}`;
}

const CHIP_BASE =
  "focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[12.5px] font-bold transition-colors";

export function NoticePicker({ filters, counts, dateFieldId, lateFeeWarning }: Props) {
  const isPrevYear = filters.situation === "prevyear";
  // Exactly what slot 7 will carry, rendered here so the office reads the
  // sentence rather than inferring it from a number and a dropdown.
  const phrase = lateFeePhrase(filters.lateFeeAmount, filters.lateFeeBasis, filters.language);

  return (
    <div className="flex flex-col gap-3">
      {/* One line on a 390px screen: scroll rather than wrap, so the row never
          reflows under a thumb mid-tap. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
        {NOTICE_SITUATIONS.map((entry) => {
          const active = entry.value === filters.situation;
          const count = counts[entry.value];
          return (
            <Link
              key={entry.value}
              href={hrefWith(filters, { situation: entry.value })}
              scroll={false}
              title={entry.hint}
              aria-current={active ? "page" : undefined}
              className={cn(
                CHIP_BASE,
                active
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-card text-foreground hover:border-border-strong",
                // Dimmed, never hidden: a notice with nobody in it today is
                // information, and hiding it would move the row under a finger.
                count === 0 && !active && "opacity-45",
              )}
            >
              <span className="whitespace-nowrap">{entry.label}</span>
              <span
                className={cn(
                  "tabular-nums text-[11px] font-extrabold",
                  active ? "opacity-80" : "text-muted-foreground",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="flex items-center gap-1 rounded-[14px] bg-surface-2 p-1">
          {NOTICE_LANGUAGES.map((entry) => {
            const active = entry.value === (filters.language as NoticeLanguage);
            return (
              <Link
                key={entry.value}
                href={hrefWith(filters, { language: entry.value })}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring grid h-8 min-w-[72px] place-items-center rounded-[10px] px-3 text-xs font-extrabold transition-colors",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label}
              </Link>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={dateFieldId}>
            {isPrevYear ? "Settle by" : "Last date on the message"}
          </Label>
          <Input
            id={dateFieldId}
            name="lastDate"
            inputSize="sm"
            defaultValue={filters.lastDate}
            placeholder="DD-MM-YYYY"
            className="w-36"
          />
        </div>

        {/* An amount and a basis, never a free-text box: a typo here is a number
            a parent will hold the school to. */}
        <div className="space-y-1.5">
          <Label htmlFor="lateFeeAmount">Late fee on the message</Label>
          <div className="flex items-center gap-2">
            <Input
              id="lateFeeAmount"
              name="lateFeeAmount"
              type="number"
              min={0}
              inputSize="sm"
              defaultValue={filters.lateFeeAmount}
              className="w-24"
            />
            <SelectNative
              id="lateFeeBasis"
              name="lateFeeBasis"
              defaultValue={filters.lateFeeBasis}
              className="h-9 w-40 text-sm"
            >
              {LATE_FEE_BASES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </SelectNative>
            <Button type="submit" variant="outline" size="sm">
              Apply
            </Button>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        The message will say:{" "}
        <span className="font-semibold text-foreground">{phrase}</span>
      </p>

      {lateFeeWarning ? (
        // Warn, never block. The office may deliberately quote something the
        // ledger will not charge — that is what this control is for — but they
        // should press Send knowing it.
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
          <strong className="font-semibold">Heads up.</strong> {lateFeeWarning}
        </p>
      ) : null}
    </div>
  );
}
