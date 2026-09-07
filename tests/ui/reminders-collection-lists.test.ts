import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Turning the eligibility filter into paper somebody can carry.
 *
 * Two properties here are structural rather than cosmetic, and both fail
 * silently: the send screen's byte ceiling, and the export re-deriving its own
 * audience instead of trusting one posted from a browser.
 */

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const LINKS = "src/modules/whatsapp/ui/collection-list-links.tsx";
const LISTS_PAGE = "src/app/protected/reminders/lists/page.tsx";
const EXPORT_ROUTE = "src/app/protected/reminders/lists/export/route.ts";
const ACTIONS = "src/modules/whatsapp/ui/collection-list-actions.tsx";
const WORKSPACE = "src/modules/whatsapp/ui/reminders-workspace.tsx";
const SEND_PAGE = "src/app/protected/reminders/page.tsx";

describe("the send screen stays under its byte ceiling", () => {
  it("reaches the lists with a server-rendered link and no client code", () => {
    const source = read(LINKS);

    // /protected/reminders has ~800 gzip bytes of headroom and the file's own
    // rule is that ceilings ratchet down. A "use client" here spends them.
    expect(source).not.toContain('"use client"');
    expect(source).not.toContain("useState");
  });

  it("names no download route on the send screen's own files", () => {
    // DownloadAnchor is a client component, and tests/ui/exports-page-links
    // fails any .tsx naming a download route beside a <Link> unless it is
    // allowlisted. Linking to a PAGE avoids both problems.
    // Asserted on the IMPORT, not the word: the files explain this rule in
    // prose, and a test that trips over its own explanation teaches nobody.
    for (const path of [LINKS, WORKSPACE, SEND_PAGE]) {
      const source = read(path);
      expect(source).not.toContain("lists/export?");
      expect(source).not.toMatch(/^import .*download-anchor/m);
    }
  });

  it("passes the links in as a ReactNode, the way holdoutControl already is", () => {
    const workspace = read(WORKSPACE);
    const page = read(SEND_PAGE);

    expect(workspace).toContain("listActions: ReactNode;");
    expect(workspace).toContain("{listActions}");
    expect(page).toContain("listActions={<CollectionListLinks");
  });
});

describe("the list follows the filter", () => {
  it("carries every audience-shaping value through to the lists screen", () => {
    const source = read(LINKS);

    // Drop one of these and the printed list is not the list on screen.
    for (const name of [
      "situation",
      "language",
      "installments",
      "maxTotalPaid",
      "minDueAmount",
      "preDueWindowDays",
      "classId",
      "includeRte",
    ]) {
      expect(source).toContain(name);
    }
  });

  it("re-derives the audience in the export rather than trusting the client", () => {
    const source = read(EXPORT_ROUTE);

    // A family who paid since the page loaded must not appear on a sheet the
    // office is about to hand a teacher — and the audience is never stored.
    expect(source).toContain("resolveReminderContext");
    expect(source).not.toContain("formData");
    expect(source).not.toContain("request.json()");
  });

  it("builds the screen and the export from the same two pure functions", () => {
    for (const path of [LISTS_PAGE, EXPORT_ROUTE]) {
      const source = read(path);
      expect(source).toContain("buildCollectionRows");
      expect(source).toContain("groupCollectionRows");
    }
  });
});

describe("the export route", () => {
  it("gates on settings:view, so a collector who cannot send can still print", () => {
    const source = read(EXPORT_ROUTE);

    expect(source).toContain('hasStaffPermission(staff, "settings:view")');
    expect(source).not.toContain('"settings:write"');
  });

  it("wraps every response in the download token the anchor's spinner reads", () => {
    expect(read(EXPORT_ROUTE)).toContain("withDownloadToken(request,");
  });

  it("runs on Node with a raised ceiling, because react-pdf needs both", () => {
    const source = read(EXPORT_ROUTE);

    expect(source).toContain('export const runtime = "nodejs"');
    expect(source).toContain("export const maxDuration");
  });

  it("imports the PDF renderer dynamically, so a load failure is a handled 500", () => {
    const source = read(EXPORT_ROUTE);

    expect(source).toContain('await import(\n        "@/modules/whatsapp/domain/collection-list-pdf"');
  });
});

describe("the lists screen", () => {
  it("keeps the grouping in the URL, not in client state", () => {
    const source = read(LISTS_PAGE);

    // A list somebody is about to print has to survive a refresh and a back
    // button — the same rule the dashboard boards follow.
    expect(source).not.toContain('"use client"');
    expect(source).toContain("groupBy");
    expect(source).toContain("aria-current");
  });

  it("breaks one group per printed page", () => {
    expect(read(LISTS_PAGE)).toContain("print:break-after-page");
  });

  it("renders cards on a phone and a table on the desk", () => {
    const source = read(LISTS_PAGE);

    expect(source).toContain("MobileRecordCard");
    expect(source).toContain("md:hidden");
    expect(source).toContain("hidden overflow-x-auto");
  });

  it("hides the app chrome from the printed sheet", () => {
    expect(read(LISTS_PAGE)).toContain("print:hidden");
  });

  it("gives every tap target a phone-sized height", () => {
    const source = read(LISTS_PAGE);

    expect(source).toContain("min-h-11");
  });
});

describe("the files the office actually takes away", () => {
  it("sends the PDF as an attachment, so the button downloads it", () => {
    // Unlike the receipt and fee-statement PDFs, which open inline: those are
    // one page somebody glances at, this is a stack of class sheets to print.
    const source = read(EXPORT_ROUTE);

    expect(source).toContain('`attachment; filename="${formatExportName(filenameBase, "pdf")}"`');
    expect(source).not.toContain("inline; filename");
  });

  it("does not open a tab it would only close again", () => {
    // An attachment plus target="_blank" flashes a blank tab on every download.
    const source = read(LISTS_PAGE);

    expect(source).not.toContain('target="_blank"');
    expect(source).toContain("download");
  });

  it("prints on A4 landscape, because eight columns do not fit portrait", () => {
    // Portrait gives 539pt of usable width, which is ~17 characters for a
    // student name at 9pt. Landscape gives 786pt.
    const source = read("src/modules/whatsapp/domain/collection-list-pdf.tsx");

    expect(source).toContain('size="A4" orientation="landscape"');
    // Both the group pages and the summary page, or the stack prints mixed.
    expect(source.match(/orientation="landscape"/g)?.length).toBe(2);
  });

  it("widths every workbook column so nothing opens as ####", () => {
    const source = read("src/modules/exports/data/responses.ts");

    expect(source).toContain('worksheet["!cols"]');
    // SheetJS CE emits no <pane>, so a freeze here would be a claim, not a
    // behaviour — verified against the generated sheet XML.
    expect(source).not.toContain('worksheet["!freeze"]');
  });
});

describe("the lists screen on a phone", () => {
  it("collapses each group's roll, so eighteen classes are not one long scroll", () => {
    // Expanded, the live fee_due list is 114 cards across 18 classes — roughly
    // fifteen thousand pixels to reach 12 Commerce. Collapsed, each group is
    // one tappable row.
    const source = read(LISTS_PAGE);

    expect(source).toContain("<details");
    expect(source).toContain("Show {group.rows.length}");
    // The desk has room for the table and keeps it open.
    expect(source).toContain("md:hidden print:hidden");
  });

  it("still prints the full table when the print comes from a phone", () => {
    // The table is `hidden md:block` and the phone roll is a collapsed
    // <details>. Without `print:block` a Ctrl+P from a handset prints
    // eighteen empty pages.
    const source = read(LISTS_PAGE);

    expect(source).toMatch(/hidden overflow-x-auto[^"]*md:block print:block/);
  });

  it("lays the per-group actions out as one even row, not two wrapped ones", () => {
    const source = read(LISTS_PAGE);

    expect(source).toContain("grid w-full grid-cols-4");
  });

  it("gives the group-by control an even row on a phone", () => {
    for (const path of [LISTS_PAGE, LINKS]) {
      expect(read(path)).toContain("grid grid-cols-3");
    }
  });
});

describe("sharing a list to a teacher", () => {
  it("fetches before sharing, in two presses", () => {
    const source = read(ACTIONS);

    // Fetching inside the sharing click consumes the transient user activation
    // iOS Safari requires, and the share is rejected with "could not share".
    expect(source).toContain("file ? share : prepare");
    expect(source).toContain("selectShareStrategy");
  });

  it("stays quiet when the person cancels the share", () => {
    // A cancelled share is a decision, not a failure.
    expect(read(ACTIONS)).toContain("AbortError");
  });

  it("does not reuse the parent-facing share sheet", () => {
    // DocumentShareSheet takes a parent's numbers to choose between; a teacher
    // is picked from the operating system's own sheet.
    expect(read(ACTIONS)).not.toMatch(/^import .*document-share-sheet/m);
  });
});
