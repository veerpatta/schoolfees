/**
 * The collection list as a file: one workbook of sheets, or one PDF of pages.
 *
 * It rebuilds the audience from the query string with the SAME
 * `resolveReminderContext` the screen uses, rather than accepting a list of
 * students from the client. Two reasons, and the second is the one that matters:
 *
 * - A family who paid since the page loaded must not appear on a sheet the
 *   office is about to hand a teacher.
 * - The audience is never stored anywhere in this feature, by rule. Posting one
 *   back to be exported would be the first place it was.
 */
import type { NextRequest } from "next/server";

import { recordActivity } from "@/modules/activity/data/events";
import { groupedWorkbookResponse } from "@/modules/exports/data/responses";
import {
  buildCollectionRows,
  groupCollectionRows,
  isCollectionGroupBy,
  toExportRow,
  type CollectionGroup,
} from "@/modules/whatsapp/domain/collection-list";
import { resolveReminderContext } from "@/modules/whatsapp/data/reminder-context";
import { resolveCurrentSessionLabel } from "@/modules/whatsapp/domain/fee-reminders";
import { NOTICE_SITUATIONS } from "@/modules/whatsapp/domain/campaigns";
import { createAdminClient } from "@/platform/supabase/admin";
import { getAuthenticatedStaff, hasStaffPermission } from "@/platform/supabase/session";
import { withDownloadToken } from "@/platform/helpers/download-token";
import { formatExportName } from "@/platform/helpers/export";
import { formatDateTimeIst } from "@/platform/helpers/date";

// `@react-pdf/renderer` needs Node, and the list is per-request by definition.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A whole school across 22 route sheets is comfortably inside this, but the
// default ceiling is not something to discover halfway through a download.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return withDownloadToken(request, await handleExport(request));
}

async function handleExport(request: NextRequest) {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return new Response("Unauthorized", { status: 401 });
  }
  // The same gate the four reminders screens use. Deliberately `settings:view`
  // and not `settings:write`: an accountant or a fee collector who may not SEND
  // may certainly print the list they are being asked to collect against.
  if (!hasStaffPermission(staff, "settings:view")) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const params = request.nextUrl.searchParams;
    const rawGroupBy = params.get("groupBy");
    const groupBy = isCollectionGroupBy(rawGroupBy) ? rawGroupBy : "class";
    const format = params.get("format") === "pdf" ? "pdf" : "xlsx";
    const scope = (params.get("scope") ?? "").trim();

    const supabase = createAdminClient();
    const sessionLabel = await resolveCurrentSessionLabel(supabase);
    const { filters, audience } = await resolveReminderContext(supabase, sessionLabel, (key) =>
      params.get(key),
    );

    const all = groupCollectionRows(buildCollectionRows(audience), groupBy);
    // `?scope=` is what the per-group buttons use, so a class teacher's sheet is
    // one press rather than a download plus a delete of eighteen other tabs.
    const groups: CollectionGroup[] =
      scope && scope !== "all" ? all.filter((group) => group.key === scope) : all;

    if (groups.length === 0) {
      return new Response("Nobody matches these filters.", {
        status: 404,
        headers: { "content-type": "text/plain" },
      });
    }

    const scopeName = scope && scope !== "all" ? groups[0]!.label : `by ${groupBy}`;
    const filenameBase = `VPPS-fees-pending-${scopeName}-${sessionLabel}`.replace(
      /[^a-z0-9-]+/gi,
      "-",
    );
    const noticeLabel =
      NOTICE_SITUATIONS.find((entry) => entry.value === filters.situation)?.label ??
      filters.situation;
    const subtitle = `${noticeLabel} · session ${sessionLabel}`;

    void recordActivity({
      userId: (staff?.id as string | undefined) ?? null,
      kind: "export_downloaded",
      payload: {
        exportType: "reminders-collection-list",
        sessionLabel,
        groupBy,
        scope: scope || "all",
        format,
      },
    });

    if (format === "pdf") {
      // Dynamic import so a module-init failure surfaces in the catch below as a
      // handled 500, rather than crashing the function at load with an opaque one.
      const { renderCollectionListPdf } = await import(
        "@/modules/whatsapp/domain/collection-list-pdf"
      );
      const buffer = await renderCollectionListPdf({
        groups,
        sessionLabel,
        subtitle,
        generatedAt: formatDateTimeIst(new Date()),
      });

      return new Response(new Uint8Array(buffer), {
        headers: {
          "content-type": "application/pdf",
          // `inline`, like every other PDF here: the office prints these far
          // more often than it files them.
          "content-disposition": `inline; filename="${formatExportName(filenameBase, "pdf")}"`,
          "cache-control": "no-store",
        },
      });
    }

    const sheets = [
      // "All" first, because the office reconciles against one number and then
      // hands out the tabs behind it.
      ...(groups.length > 1
        ? [{ name: "All", rows: groups.flatMap((group) => group.rows).map(toExportRow) }]
        : []),
      ...groups.map((group) => ({ name: group.label, rows: group.rows.map(toExportRow) })),
    ];

    return groupedWorkbookResponse(formatExportName(filenameBase, "xlsx"), sheets);
  } catch (error) {
    console.error("[reminders-collection-list] export failed", error);
    return new Response("Could not build the list. Please try again.", {
      status: 500,
      headers: { "content-type": "text/plain" },
    });
  }
}
