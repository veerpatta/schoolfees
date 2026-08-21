"use client";

import type { ReactNode, RefObject } from "react";
import { useTranslations } from "next-intl";
import { Search, SlidersHorizontal } from "lucide-react";

import { VoiceSearchButton } from "@/ui/mobile/voice-search-button";
import { MobileStudentList } from "@/components/students/student-list-table";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { cn } from "@/platform/utils";
import type { StudentClassOption, StudentListItem } from "@/lib/students/types";

/**
 * The phone Students screen (mobile app v2, §STUDENTS).
 *
 * Search-first: a sticky header carrying the title, the live count, the search
 * field, the mic and the filter button, then one scrolling row of class chips —
 * and below it a flat stack of student cards. No page header, no card chrome;
 * `PageHeader` is suppressed with `hideOnMobile` and the desktop `SectionCard`
 * layers live in the `hidden md:block` twin.
 *
 * Purely presentational. Every piece of state — filters, the debounced refetch,
 * paging, the URL sync — stays in `student-quick-load.tsx`, which also keeps
 * the FAB and the filter Sheet so both surfaces drive one source of truth.
 */
export function MobileStudentsScreen({
  searchRef,
  query,
  onQueryChange,
  classOptions,
  classId,
  onClassChange,
  onlyWithDues,
  onToggleDues,
  activeFilterCount,
  onOpenFilters,
  totalCount,
  isLoading,
  loadError,
  students,
  hasFilters,
  canWrite,
  canCollectPayments,
  returnTo,
  session,
  page,
  pageCount,
  onPrevPage,
  onNextPage,
  segmentRow,
  activeFilterSummary,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  classOptions: StudentClassOption[];
  classId: string;
  onClassChange: (classId: string) => void;
  onlyWithDues: boolean;
  onToggleDues: () => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  totalCount: number;
  isLoading: boolean;
  loadError: string | null;
  students: StudentListItem[];
  hasFilters: boolean;
  canWrite: boolean;
  canCollectPayments: boolean;
  returnTo: string;
  session?: string;
  page: number;
  pageCount: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  /** Money-segment chips. Below the sticky header, not inside it — the header
      is already title + search + class chips and a fourth row would take a
      fifth of the screen before a single student appeared. */
  segmentRow?: ReactNode;
  /** Removable pills for everything currently applied, incl. sheet-only filters. */
  activeFilterSummary?: ReactNode;
}) {
  const t = useTranslations("Students");
  const tm = useTranslations("MobileApp");

  const chipClass = (active: boolean) =>
    cn(
      "focus-ring inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[12.5px] font-bold transition-colors",
      active
        ? "border-accent bg-accent text-accent-foreground"
        : "border-border bg-card text-muted-foreground",
    );

  return (
    <div className="anim-slide-up">
      {/* The shell insets phone content by px-4 py-4, so the header bleeds back
          out to the screen edges. `main` is the scroll region, so `sticky`
          pins here without any position:fixed. */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-2.5 border-b border-border bg-background/95 px-4 pb-2.5 pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-2.5">
          <h1 className="text-xl font-extrabold leading-tight tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="text-[11.5px] font-semibold text-muted-foreground">
            <span className="tabular font-bold text-foreground">
              {isLoading ? "…" : totalCount}
            </span>{" "}
            {tm("studentsShowing")}
          </p>
        </div>

        <div className="mt-2.5 flex items-stretch gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={searchRef}
              data-student-search="true"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
              className="h-[50px] rounded-[14px] pl-9 text-[15px] font-semibold"
            />
          </div>
          {/* Renders nothing where speech recognition is unavailable, so the
              field goes full width on iOS rather than sitting beside a dead
              square. */}
          <VoiceSearchButton
            label={t("voiceSearch")}
            listeningLabel={t("voiceSearchListening")}
            onTranscript={onQueryChange}
          />
          <button
            type="button"
            onClick={onOpenFilters}
            aria-label={t("filterRouteAndStatus")}
            className="focus-ring relative grid size-[50px] shrink-0 place-items-center rounded-[14px] border border-border-strong bg-card text-foreground active:bg-surface-2"
          >
            <SlidersHorizontal className="size-[18px]" aria-hidden="true" />
            {activeFilterCount > 0 ? (
              <span className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full bg-accent text-[10px] font-extrabold text-accent-foreground">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        <div
          data-mobile-class-filter
          className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4"
        >
          {/* Kept ahead of the class chips: "only with dues" is the filter the
              office actually reaches for, and it is removable with a second
              tap. The design's chip row is class-only; this earns its slot. */}
          <button
            type="button"
            aria-pressed={onlyWithDues}
            onClick={onToggleDues}
            className={chipClass(onlyWithDues)}
          >
            {t("chipOnlyWithDues")}
            {onlyWithDues ? <span aria-hidden="true"> ✕</span> : null}
          </button>
          <button
            type="button"
            aria-pressed={classId === ""}
            onClick={() => onClassChange("")}
            className={chipClass(classId === "")}
          >
            {t("classAll")}
          </button>
          {classOptions.map((classOption) => (
            <button
              key={classOption.id}
              type="button"
              aria-pressed={classId === classOption.id}
              onClick={() => onClassChange(classId === classOption.id ? "" : classOption.id)}
              className={chipClass(classId === classOption.id)}
            >
              {classOption.label}
            </button>
          ))}
        </div>
      </div>

      {segmentRow ? <div className="mb-2.5">{segmentRow}</div> : null}
      {activeFilterSummary ? <div className="mb-2.5">{activeFilterSummary}</div> : null}

      {loadError ? (
        <div className="mb-2.5 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-[11.5px] text-warning-soft-foreground">
          {loadError}
        </div>
      ) : null}

      {isLoading ? (
        <ul className="flex flex-col gap-2.5" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <li
              key={index}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <span className="anim-shimmer size-10 shrink-0 rounded-full bg-surface-2" />
              <span className="min-w-0 flex-1">
                <span className="anim-shimmer block h-3.5 w-32 rounded bg-surface-2" />
                <span className="anim-shimmer mt-2 block h-2.5 w-24 rounded bg-surface-2" />
              </span>
              <span className="anim-shimmer h-3.5 w-14 rounded bg-surface-2" />
            </li>
          ))}
        </ul>
      ) : (
        <MobileStudentList
          students={students}
          hasFilters={hasFilters}
          canWrite={canWrite}
          canCollectPayments={canCollectPayments}
          returnTo={returnTo}
          session={session}
        />
      )}

      {/* The design has no pager, but the list is 40 a page and the office has
          hundreds of students — page 2 has to be reachable from a phone. */}
      {pageCount > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || isLoading}
            onClick={onPrevPage}
          >
            {t("previous")}
          </Button>
          <p className="text-[11.5px] font-semibold text-muted-foreground">
            {t("pageOf", { page, pageCount })}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount || isLoading}
            onClick={onNextPage}
          >
            {t("next")}
          </Button>
        </div>
      ) : null}

      {/* Clearance for the ink FAB, which is rendered by student-quick-load so
          it keeps the nav-offset token the reachability guard checks for. */}
      <div aria-hidden="true" className="h-16" />
    </div>
  );
}
