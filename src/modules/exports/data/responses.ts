/**
 * Split out of app/protected/exports/[exportType]/route.ts, which had grown
 * to 2,182 lines around a single 1,383-line function. The route is now the
 * dispatcher it always claimed to be.
 */
import "server-only";

import { STUDENT_INFO_FIELDS } from "@/modules/students/domain/info-fields";
import type { StudentInfoFields } from "@/modules/students/domain/info-fields";
import { formatDateTimeIst } from "@/platform/helpers/date";
/** Today in IST as YYYY-MM-DD — schedule rows are priced against it. */
export function todayIsoIst() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function workbookResponse(filename: string, rows: Array<Record<string, string | number>>) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
  const data = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders the same rows as a printable HTML page. The browser's Save-as-PDF
 * destination produces a PDF that mirrors the XLSX export.
 */
export function printableHtmlResponse(
  title: string,
  rows: Array<Record<string, string | number>>,
): Response {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ["Export"];
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11px; color: #111; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 8px; border-bottom: 1px solid #999; margin-bottom: 12px; }
  h1 { font-size: 16px; margin: 0; }
  .meta { font-size: 10px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: #f3f3f3; }
  th, td { border: 1px solid #d8d8d8; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  tr:nth-child(even) td { background: #fafafa; }
  .print-hint { padding: 8px 12px; background: #fff8d6; border: 1px solid #e5d97a; font-size: 11px; margin-bottom: 12px; }
  @media print { .print-hint { display: none; } }
</style>
</head>
<body>
  <div class="print-hint">Use your browser's Print dialog (Ctrl+P / Cmd+P) and choose <strong>Save as PDF</strong>.</div>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Generated ${escapeHtml(formatDateTimeIst(new Date()))} · ${rows.length} row${rows.length === 1 ? "" : "s"}</div>
  </header>
  <table>
    <thead>
      <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row) =>
            `<tr>${headers
              .map((header) => {
                const value = row[header];
                // Cell numbers are export-cell values which may be money, counts,
                // or percentages. We render them via Intl.NumberFormat (en-IN
                // grouping) to keep the existing CSV/HTML output stable. This is
                // the export pipeline, not a money-display surface — the audit
                // suppression is genuine and bounded to this cell renderer.
                const display =
                  value === undefined || value === null
                    ? ""
                    : typeof value === "number"
                      ? new Intl.NumberFormat("en-IN").format(value) // @allow-raw-money-format
                      : String(value);
                return `<td>${escapeHtml(display)}</td>`;
              })
              .join("")}</tr>`,
        )
        .join("\n")}
    </tbody>
  </table>
  <script>
    window.addEventListener("load", () => { setTimeout(() => window.print(), 200); });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Appends the 25 information columns to a row, renaming any that would collide
 * with a column already on it.
 *
 * The bundle's Students sheet already carries "Guardian name" and "Guardian
 * phone" — but those come from `student_family_groups`: a different guardian,
 * on a different table, belonging to the family rather than the child.
 * Spreading the student's own guardian over them replaced one fact with the
 * other and silently dropped two columns from the sheet, so a student with no
 * family group still showed a family guardian.
 *
 * Generic rather than a two-name special case: the next information field that
 * happens to share a header would fail the same way and just as quietly.
 */
export function withStudentInfoColumns(
  base: Record<string, unknown>,
  info: StudentInfoFields | undefined,
) {
  const row: Record<string, unknown> = { ...base };

  for (const field of STUDENT_INFO_FIELDS) {
    const key = Object.hasOwn(row, field.header)
      ? `${field.header} (student record)`
      : field.header;
    row[key] = info?.[field.name] ?? "";
  }

  return row;
}

export async function rowsResponse(
  format: "xlsx" | "pdf",
  filenameBase: string,
  title: string,
  rows: Array<Record<string, string | number>>,
): Promise<Response> {
  if (format === "pdf") {
    return printableHtmlResponse(title, rows);
  }
  return workbookResponse(`${filenameBase}.xlsx`, rows);
}

