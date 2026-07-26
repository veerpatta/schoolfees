"use client";

import { useState } from "react";

import { Sheet } from "@/components/ui/sheet";
import {
  addMonths,
  formatCalendarMonth,
  isoToParts,
  monthGrid,
  partsToIso,
  todayPartsIst,
  weekdayHeadings,
  type CalendarDay,
} from "@/lib/helpers/date";
import { cn } from "@/lib/utils";

/**
 * Phone date picker (template §DATE PICKER).
 *
 * The app had none — every date field was a native `<input type="date">`,
 * which on Android opens a full-screen system dialog with no idea which days
 * actually have receipts. This one marks the days that have activity, which
 * is the whole reason a clerk opens it.
 *
 * All arithmetic is on IST calendar parts via `lib/helpers/date`, never on
 * `Date` objects in the runtime's own zone. See the note there.
 */

export type MobileDatePickerLabels = {
  today: string;
  wholeMonth: string;
  dotLegend: string;
  previousMonth: string;
  nextMonth: string;
};

export function MobileDatePicker({
  open,
  onClose,
  value,
  onSelectDate,
  onSelectMonth,
  /** ISO `YYYY-MM-DD` days that have activity — dotted in the grid. */
  activeDates,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  value: string | null;
  onSelectDate: (iso: string) => void;
  onSelectMonth?: (year: number, month: number) => void;
  activeDates?: ReadonlySet<string>;
  labels: MobileDatePickerLabels;
}) {
  const today = todayPartsIst();
  const selected = value ? isoToParts(value) : null;
  const [cursor, setCursor] = useState<CalendarDay>(selected ?? today);

  const cells = monthGrid(cursor.year, cursor.month);
  const todayIso = partsToIso(today);

  const pick = (day: CalendarDay) => {
    onSelectDate(partsToIso(day));
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} size="md">
      <div className="flex items-center justify-between gap-2.5 pt-2">
        <button
          type="button"
          aria-label={labels.previousMonth}
          onClick={() => setCursor(addMonths(cursor, -1))}
          className="focus-ring grid size-10 place-items-center rounded-xl border border-border bg-card text-base"
        >
          ←
        </button>
        <span aria-live="polite" className="text-[15px] font-extrabold text-foreground">
          {formatCalendarMonth(cursor.year, cursor.month)}
        </span>
        <button
          type="button"
          aria-label={labels.nextMonth}
          onClick={() => setCursor(addMonths(cursor, 1))}
          className="focus-ring grid size-10 place-items-center rounded-xl border border-border bg-card text-base"
        >
          →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {weekdayHeadings().map((heading) => (
          <span
            key={heading}
            aria-hidden="true"
            className="text-center text-[10px] font-extrabold uppercase text-muted-foreground"
          >
            {heading}
          </span>
        ))}

        {cells.map((cell, index) => {
          if (!cell) {
            return <span key={`pad-${index}`} aria-hidden="true" className="h-10" />;
          }

          const iso = partsToIso(cell);
          const isSelected = value === iso;
          const isToday = iso === todayIso;
          const hasActivity = activeDates?.has(iso) ?? false;

          return (
            <button
              key={iso}
              type="button"
              aria-pressed={isSelected}
              onClick={() => pick(cell)}
              className={cn(
                "focus-ring relative grid h-10 place-items-center rounded-[11px] border text-[13px]",
                isSelected
                  ? "border-accent bg-accent font-extrabold text-accent-foreground"
                  : isToday
                    ? "border-accent bg-accent-soft font-extrabold text-accent-soft-foreground"
                    : "border-transparent bg-surface-2 font-semibold text-foreground",
              )}
            >
              {cell.day}
              {hasActivity ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-1 size-1 rounded-full",
                    isSelected ? "bg-accent-foreground" : "bg-accent",
                  )}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={() => pick(today)}
          className="focus-ring grid h-[46px] flex-1 place-items-center rounded-[13px] border border-border bg-card text-[12.5px] font-extrabold"
        >
          {labels.today}
        </button>
        {onSelectMonth ? (
          <button
            type="button"
            onClick={() => {
              onSelectMonth(cursor.year, cursor.month);
              onClose();
            }}
            className="focus-ring grid h-[46px] flex-1 place-items-center rounded-[13px] border border-border bg-card text-[12.5px] font-extrabold"
          >
            {labels.wholeMonth}
          </button>
        ) : null}
      </div>

      <p className="mt-2 pb-2 text-center text-[10.5px] font-semibold text-muted-foreground">
        {labels.dotLegend}
      </p>
    </Sheet>
  );
}
