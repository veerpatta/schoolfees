"use client";

import Link from "next/link";

import {
  NOTICE_LANGUAGES,
  NOTICE_SITUATIONS,
  type NoticeLanguage,
  type NoticeSituation,
} from "@/modules/whatsapp/domain/campaigns";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { cn } from "@/platform/utils";
import type { ReminderFilters } from "@/modules/whatsapp/domain/fee-reminders";

/**
 * Which notice is going out, in which language, and by when.
 *
 * Links, not buttons. Changing the notice changes the audience, so it has to be
 * linkable and back-navigable — the same rule the Dashboard boards follow — and
 * the server action re-derives the list from the very same query string, so a
 * choice held in client state could send to a different set of families than the
 * office is looking at.
 *
 * The chips carry counts because a notice with nobody in it is worth seeing
 * before you pick it: "Balance 252" is the difference between a considered
 * choice and a guess.
 */

type Props = {
  filters: ReminderFilters;
  counts: Record<NoticeSituation, number>;
  /** Rendered inside the GET filter form, so the date round-trips with everything else. */
  dateFieldId: string;
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
  return `?${params.toString()}`;
}

const CHIP_BASE =
  "focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[12.5px] font-bold transition-colors";

export function NoticePicker({ filters, counts, dateFieldId }: Props) {
  const needsDate = filters.situation !== "prevyear";

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

      <div className="flex flex-wrap items-end justify-between gap-3">
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

        {needsDate ? (
          <div className="space-y-1.5">
            <Label htmlFor={dateFieldId}>Last date on the message</Label>
            {/* Submit sits beside the field, not on a row of its own: the screen
                already has an Apply for the filters, and two loose buttons a card
                apart read as two ways to do the same thing. Next to the input it
                reads as part of the date control, which is what it is. */}
            <div className="flex items-center gap-2">
              <Input
                id={dateFieldId}
                name="lastDate"
                inputSize="sm"
                defaultValue={filters.lastDate}
                placeholder="DD-MM-YYYY"
                className="w-36"
              />
              <Button type="submit" variant="outline" size="sm">
                Apply date
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            The previous-session notice carries no date — that balance has no due date and no
            late fee.
          </p>
        )}
      </div>
    </div>
  );
}
