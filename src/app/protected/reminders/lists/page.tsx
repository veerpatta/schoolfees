import Link from "next/link";

import { PageHeader } from "@/ui/shell/page-header";
import { OfficeNotice } from "@/ui/office/office-ui";
import { ChevronDown } from "lucide-react";

import { MobileEmptyRows, MobileRecordCard } from "@/ui/mobile/mobile-kit";
import { DownloadAnchor } from "@/ui/primitives/download-anchor";
import { CollectionListActions } from "@/modules/whatsapp/ui/collection-list-actions";
import { createAdminClient } from "@/platform/supabase/admin";
import { requireAnyStaffPermission } from "@/platform/supabase/session";
import { resolveCurrentSessionLabel } from "@/modules/whatsapp/domain/fee-reminders";
import {
  readerFor,
  resolveReminderContext,
} from "@/modules/whatsapp/data/reminder-context";
import {
  buildCollectionRows,
  COLLECTION_GROUP_BY,
  COLLECTION_STATUS_LABELS,
  groupCollectionRows,
  isCollectionGroupBy,
  renderAllCollectionsText,
  renderCollectionText,
  type CollectionGroupBy,
} from "@/modules/whatsapp/domain/collection-list";
import { NOTICE_SITUATIONS } from "@/modules/whatsapp/domain/campaigns";
import { formatInr } from "@/platform/helpers/currency";

/**
 * The eligibility list, ready to hand out.
 *
 * `/protected/reminders` decides who owes money and then messages them. This
 * screen takes the same answer and turns it into paper: a class teacher's
 * class, a route in-charge's bus, or the biggest balances first.
 *
 * Three things are deliberate:
 *
 * - **The grouping is a LINK, not client state** (`?groupBy=`), the same rule
 *   the dashboard boards and the notice picker follow. A list somebody is about
 *   to print has to survive a refresh and a back button.
 * - **The filters ride the query string** and are re-derived here through the
 *   same `resolveReminderContext` the send screen uses, so this list and that
 *   one cannot name different families.
 * - **A SUB-PAGE**, so it is a mobile takeover — `/protected/reminders/` is
 *   already in `mobileTakeoverRoutes` and the bottom nav renders nothing here.
 *   That is also why every download lives on this route and not on the send
 *   screen: `/protected/reminders` has ~800 gzip bytes of headroom, and
 *   `DownloadAnchor` is a client component.
 */

export const revalidate = 0;
export const maxDuration = 60;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** Every audience-shaping param, carried through to the export unchanged. */
const CARRIED_PARAMS = [
  "situation",
  "language",
  "installments",
  "maxTotalPaid",
  "minDueAmount",
  "classId",
  "includeRte",
  "lastDate",
  "lateFeeAmount",
  "lateFeeBasis",
  "preDueWindowDays",
] as const;

export default async function CollectionListsPage({ searchParams }: PageProps) {
  await requireAnyStaffPermission(["settings:view", "settings:write"], {
    onDenied: "redirect",
  });

  const params = (await searchParams) ?? {};
  const read = readerFor(params);
  const rawGroupBy = read("groupBy");
  const groupBy: CollectionGroupBy = isCollectionGroupBy(rawGroupBy)
    ? rawGroupBy
    : "class";

  const supabase = createAdminClient();
  const sessionLabel = await resolveCurrentSessionLabel(supabase);
  const { filters, audience } = await resolveReminderContext(
    supabase,
    sessionLabel,
    read,
  );

  const rows = buildCollectionRows(audience);
  const groups = groupCollectionRows(rows, groupBy);
  const grandTotal = groups.reduce((sum, group) => sum + group.total, 0);
  const noticeLabel =
    NOTICE_SITUATIONS.find((entry) => entry.value === filters.situation)
      ?.label ?? filters.situation;

  /**
   * One block covering every group, for the whole-list Copy and Share.
   *
   * Built from the same renderer the per-group text uses, so a class copied on
   * its own and the same class inside the full list cannot read differently.
   */
  const allText = renderAllCollectionsText(groups, {
    title: `Fees pending — ${noticeLabel}`,
    sessionLabel,
  });

  /** The filter, preserved. Dropping it here would export a different list. */
  const carried = new URLSearchParams();
  for (const name of CARRIED_PARAMS) {
    const value = read(name);
    if (value) carried.set(name, value);
  }

  const exportHref = (format: "xlsx" | "pdf", scope: string) => {
    const search = new URLSearchParams(carried);
    search.set("groupBy", groupBy);
    search.set("format", format);
    search.set("scope", scope);
    return `/protected/reminders/lists/export?${search.toString()}`;
  };

  const groupByHref = (value: CollectionGroupBy) => {
    const search = new URLSearchParams(carried);
    search.set("groupBy", value);
    return `/protected/reminders/lists?${search.toString()}`;
  };

  const backHref = carried.toString()
    ? `/protected/reminders?${carried.toString()}`
    : "/protected/reminders";

  return (
    <div
      className="flex flex-col gap-6"
      style={{
        paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)",
      }}
    >
      <div className="print:hidden">
        <PageHeader
          eyebrow="Reminders"
          title="Collection lists"
          description={`${noticeLabel} · session ${sessionLabel}. ${rows.length} students across ${groups.length} lists, ${formatInr(grandTotal)} outstanding.`}
          mobileEyebrow={`${rows.length} students · ${formatInr(grandTotal)}`}
          actions={
            <Link
              href={backHref}
              className="focus-ring inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold"
            >
              Back to reminders
            </Link>
          }
        />
      </div>

      {/* Links, not tabs: a printed list has to be linkable and reloadable.
          On a phone the three sit as an even 3-up row rather than wrapping
          2 + 1, which is what `flex-wrap` did at 375px. */}
      <div className="flex flex-col gap-2 print:hidden md:flex-row md:flex-wrap md:items-center">
        <div className="grid grid-cols-3 gap-2 md:flex md:gap-2">
          {COLLECTION_GROUP_BY.map((option) => (
            <Link
              key={option.value}
              href={groupByHref(option.value)}
              aria-current={option.value === groupBy ? "page" : undefined}
              className={`focus-ring inline-flex min-h-11 items-center justify-center rounded-lg border px-2 text-center text-xs font-semibold md:min-h-0 md:px-4 md:py-2 md:text-sm ${
                option.value === groupBy
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-foreground"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>

        {/* The whole list gets the SAME four actions a single group gets.
            Share and Copy were per-group only, so the office could send one
            teacher their class but not send the lot to anybody. */}
        <div className="ml-auto grid w-full grid-cols-4 gap-1.5 md:flex md:w-auto md:gap-2">
          <DownloadAnchor
            href={exportHref("xlsx", "all")}
            className="focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-xs font-semibold md:min-h-0 md:px-4 md:py-2 md:text-sm"
            pendingLabel="…"
          >
            Excel
          </DownloadAnchor>
          <DownloadAnchor
            href={exportHref("pdf", "all")}
            download
            className="focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-xs font-semibold md:min-h-0 md:px-4 md:py-2 md:text-sm"
            pendingLabel="…"
          >
            PDF
          </DownloadAnchor>
          <CollectionListActions
            pdfHref={exportHref("pdf", "all")}
            fileName={`fees-pending-${groupBy}-${sessionLabel}.pdf`}
            shareTitle={`Fees pending — ${noticeLabel}, session ${sessionLabel}`}
            text={allText}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <OfficeNotice title="Nobody matches these filters" tone="info">
          Either everyone has paid, or the filters are too narrow. Change the
          notice or the installments on the reminders screen and come back.
        </OfficeNotice>
      ) : (
        <>
          <div className="print:hidden">
            <OfficeNotice title="Who is on these lists" tone="info">
              Everyone the filter found — including families held back from a
              message by a snooze, a promise or a cadence, and families with no
              usable number. They are marked, because they still owe the money.
              A family who has paid is simply absent.
            </OfficeNotice>
          </div>

          {/* flex gap, never space-y: the print-only heading is hidden on screen
              and space-y would leave a band where it sits. */}
          <div className="flex flex-col gap-6">
            <h1 className="hidden text-lg font-bold print:block">
              Fees pending — {noticeLabel} — session {sessionLabel}
            </h1>

            {groups.map((group) => {
              const text = renderCollectionText(group);
              const fileName = `fees-pending-${group.key}.pdf`;

              return (
                <section
                  key={group.key}
                  // One sheet per list, so plain Ctrl+P already gives a teacher
                  // their class without anybody else's children on the back.
                  className="break-inside-avoid rounded-xl border border-border bg-card p-4 print:break-after-page print:border-0 print:p-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
                    <h2 className="text-sm font-bold text-foreground">
                      {group.label}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {group.rows.length}{" "}
                        {group.rows.length === 1 ? "student" : "students"} ·{" "}
                        {formatInr(group.total)}
                      </span>
                    </h2>

                    {/* An even 4-up row on a phone. As inline pills these four
                        wrapped onto two lines at 375px, which across 18 groups
                        was most of the scroll. */}
                    <div className="grid w-full grid-cols-4 gap-1.5 print:hidden md:flex md:w-auto md:gap-2">
                      <DownloadAnchor
                        href={exportHref("xlsx", group.key)}
                        className="focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-xs font-semibold md:min-h-0 md:px-3 md:py-1.5"
                        pendingLabel="…"
                      >
                        Excel
                      </DownloadAnchor>
                      <DownloadAnchor
                        href={exportHref("pdf", group.key)}
                        download
                        className="focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-xs font-semibold md:min-h-0 md:px-3 md:py-1.5"
                        pendingLabel="…"
                      >
                        PDF
                      </DownloadAnchor>
                      <CollectionListActions
                        pdfHref={exportHref("pdf", group.key)}
                        fileName={fileName}
                        shareTitle={`${group.label} — fees pending`}
                        text={text}
                      />
                    </div>
                  </div>

                  {/* Desk: a table. Phone: cards. One component, two branches —
                      the same shape the send screen uses. */}
                  {/* `print:block` matters: on a phone the table is hidden and
                      the roll below is collapsed, so without it Ctrl+P from a
                      handset would print eighteen empty pages. */}
                  <div className="mt-3 hidden overflow-x-auto rounded-lg border border-border md:block print:block print:border-0">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Adm</th>
                          <th className="px-3 py-2">Student</th>
                          <th className="px-3 py-2">Parent</th>
                          <th className="px-3 py-2">Number</th>
                          <th className="px-3 py-2 text-right">Owed</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 print:table-cell">
                            Collected
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr
                            key={row.studentId}
                            className="border-t border-border"
                          >
                            <td className="px-3 py-2 font-mono text-xs">
                              {row.admissionNo}
                            </td>
                            <td className="px-3 py-2 font-medium">
                              {row.studentName}
                            </td>
                            <td className="px-3 py-2">{row.parentName}</td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {row.phone ?? (
                                <span className="text-muted-foreground">
                                  no number
                                </span>
                              )}
                              {row.usedMotherPhone ? (
                                <span className="ml-1 text-muted-foreground">
                                  (mother)
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums">
                              {formatInr(row.dueAmount)}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {row.status === "eligible"
                                ? "—"
                                : `${COLLECTION_STATUS_LABELS[row.status]}${row.statusDetail ? ` · ${row.statusDetail}` : ""}`}
                            </td>
                            {/* Blank on purpose — the sheet is written on. */}
                            <td className="px-3 py-2 text-muted-foreground">
                              ______________
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Collapsed on a phone, and this is the whole mobile story:
                      eighteen classes expanded is 114 cards and roughly fifteen
                      thousand pixels of scroll to reach 12 Commerce. Closed,
                      each group is one tappable row and the office finds their
                      class in a screen or two. The desk keeps the table open —
                      there is room for it there. */}
                  <details className="group/roll mt-3 md:hidden print:hidden">
                    <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm font-semibold text-foreground">
                      <span>
                        Show {group.rows.length}{" "}
                        {group.rows.length === 1 ? "student" : "students"}
                      </span>
                      <ChevronDown
                        className="size-4 shrink-0 text-muted-foreground transition-transform group-open/roll:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>

                    <ul className="mt-2.5 flex flex-col gap-2.5">
                      {group.rows.map((row) => (
                        <MobileRecordCard
                          key={row.studentId}
                          title={row.studentName}
                          subtitle={`${row.admissionNo} · ${row.parentName}`}
                          amount={formatInr(row.dueAmount)}
                          status={
                            row.status === "eligible" ? null : (
                              <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                {COLLECTION_STATUS_LABELS[row.status]}
                              </span>
                            )
                          }
                          fields={[
                            {
                              label: "Number",
                              value: row.phone
                                ? `${row.phone}${row.usedMotherPhone ? " (mother)" : ""}`
                                : "no number on record",
                            },
                            { label: "Note", value: row.statusDetail },
                          ]}
                        />
                      ))}
                      {group.rows.length === 0 ? (
                        <MobileEmptyRows>Nobody on this list.</MobileEmptyRows>
                      ) : null}
                    </ul>
                  </details>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
