"use client";

import { useTranslations } from "next-intl";

import { SegmentChip } from "@/ui/shared/segment-chip";
import {
  SEGMENT_FAMILIES,
  segmentCount,
  segmentsInFamily,
  type SegmentCounts,
  type SegmentFamily,
  type SegmentId,
} from "@/modules/students/domain/student-segments";
import { cn } from "@/platform/utils";

/**
 * The four segment families as chip rows, used unchanged on the phone chip
 * header, in the phone filter sheet, and on the desktop filter card.
 *
 * Scrolls horizontally below `md` and wraps above it — the same behaviour the
 * existing class and route chip rows already have, so the new controls read as
 * part of the page rather than bolted on.
 */

export type SegmentFilterGroupsProps = {
  selected: readonly SegmentId[];
  counts: SegmentCounts | null;
  onToggle: (id: SegmentId) => void;
  /** Families to render, in order. Defaults to all four. */
  families?: readonly SegmentFamily[];
  /** Fee-profile facts need `fees:view`; see the RLS note on the directory view. */
  canViewFees?: boolean;
  /** `scroll` for the phone header, `wrap` inside a sheet or on desktop. */
  layout?: "scroll" | "wrap";
  /** Drop the eyebrows when a single family is rendered as a bare quick row. */
  hideFamilyLabels?: boolean;
  className?: string;
};

export function SegmentFilterGroups({
  selected,
  counts,
  onToggle,
  families = SEGMENT_FAMILIES,
  canViewFees = true,
  layout = "wrap",
  hideFamilyLabels = false,
  className,
}: SegmentFilterGroupsProps) {
  const t = useTranslations("Segments");
  const selectedSet = new Set(selected);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {families.map((family) => {
        const segments = segmentsInFamily(family).filter(
          (segment) => canViewFees || segment.requiresPermission !== "fees:view",
        );
        if (segments.length === 0) return null;

        return (
          <div key={family} className="flex flex-col gap-1.5">
            {hideFamilyLabels ? null : (
              <p className="mobile-eyebrow text-muted-foreground">{t(`family.${family}`)}</p>
            )}
            <div
              className={cn(
                "flex gap-2",
                layout === "scroll"
                  ? "no-scrollbar -mx-4 overflow-x-auto px-4"
                  : "flex-wrap",
              )}
            >
              {segments.map((segment) => (
                <SegmentChip
                  key={segment.id}
                  label={t(segment.i18nKey)}
                  count={segmentCount(counts, segment.id)}
                  active={selectedSet.has(segment.id)}
                  onClick={() => onToggle(segment.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
