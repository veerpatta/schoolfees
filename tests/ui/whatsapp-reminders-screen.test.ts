import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The WhatsApp reminders screen sends real, billed messages carrying a child's
 * name and a family's fee balance. These are the properties that are cheap to
 * break by accident and expensive to discover in production.
 */

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/**
 * Comments here necessarily NAME the thing being banned — the takeover-route
 * comment has to say `--mobile-bottom-nav-offset` to explain why it is wrong.
 * Strip them before asserting absence.
 */
function readCode(path: string) {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const WORKSPACE = "src/modules/whatsapp/ui/reminders-workspace.tsx";
const PANEL = "src/modules/whatsapp/ui/test-send-panel.tsx";
const PAGE = "src/app/protected/admin-tools/whatsapp-reminders/page.tsx";
const ACTIONS = "src/app/protected/admin-tools/whatsapp-reminders/actions.ts";
const TEMPLATE = "src/modules/whatsapp/domain/reminder-template.ts";

describe("WhatsApp reminders on a phone", () => {
  it("clears only the safe area, because /protected/admin-tools is a takeover route", () => {
    // MobileBottomNav renders nothing on a takeover, so reserving
    // --mobile-bottom-nav-offset would float the send bar 68px above the home
    // indicator. This asserts the opposite of the NAV_CLEARANCE list in
    // tests/ui/mobile-action-reachability.test.ts — deliberately.
    const source = read(WORKSPACE);

    expect(source).toContain("calc(var(--mobile-safe-area-bottom, 0px) + ");
    expect(readCode(WORKSPACE)).not.toContain("--mobile-bottom-nav-offset");
  });

  it("keeps both branches inside the one send form", () => {
    // The hidden studentId inputs, the filter inputs and the confirm state are
    // shared. Two forms would mean two selections that could disagree.
    const source = read(WORKSPACE);

    expect(source.match(/action=\{sendFormAction\}/g) ?? []).toHaveLength(1);

    const formIndex = source.indexOf("action={sendFormAction}");
    expect(source.indexOf('className="flex flex-col gap-2.5 md:hidden"')).toBeGreaterThan(formIndex);
    expect(source.indexOf('className="hidden overflow-x-auto')).toBeGreaterThan(formIndex);
  });

  it("never gives the phone checkbox a name", () => {
    // A `name` on the card checkbox would post a second, unfiltered copy of the
    // selection alongside the hidden inputs the server actually re-derives from.
    const source = read(WORKSPACE);

    for (const line of source.split("\n")) {
      if (line.includes('name="studentId"')) {
        expect(line).toContain('type="hidden"');
      }
    }
  });

  it("renders the desk table only above md", () => {
    expect(read(WORKSPACE)).toContain('<div className="hidden overflow-x-auto rounded-lg border border-border md:block">');
  });

  it("has dropped the desktop-only notice", () => {
    // The inverse of tests/ui/mobile-screen-coverage.test.ts — the removal is
    // deliberate, and this keeps it removed.
    expect(read(PAGE)).not.toContain("MobileDesktopOnlyNotice");
  });
});

describe("WhatsApp reminders template", () => {
  it("keeps one renderer for the message body", () => {
    // Two copies of the template would drift, and the preview would start
    // promising something the parent never receives.
    expect(read(TEMPLATE)).toContain("फीस सूचना");
    expect(read(WORKSPACE)).not.toContain("फीस सूचना");
    expect(read(PANEL)).not.toContain("फीस सूचना");
  });

  it("derives the printed deadline from the same constant as the guard", () => {
    const source = read(TEMPLATE);

    expect(source).toContain('FEE_REMINDER_TEMPLATE_DEADLINE = "2026-08-25"');
    expect(source).toContain("FEE_REMINDER_DEADLINE_LABEL");
    expect(source).toContain("अंतिम तिथि: ${FEE_REMINDER_DEADLINE_LABEL}");
  });
});

describe("WhatsApp reminders client boundary", () => {
  it.each([WORKSPACE, PANEL])("%s value-imports no server-only module", (path) => {
    // lib/whatsapp/fee-reminders.ts and lib/whatsapp/aisensy.ts both carry
    // `import "server-only"`. A value import from either would fail the build.
    const source = read(path);

    for (const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+"@\/lib\/whatsapp\/(\w[\w-]*)"/g)) {
      const [, clause, module] = match;
      if (module !== "fee-reminders" && module !== "aisensy") continue;
      expect(clause.trimStart().startsWith("type ")).toBe(true);
    }
  });
});

describe("the reminder test send", () => {
  it("never writes to the send log", () => {
    // Logging a test would claim that student's day and silently drop them from
    // the real send.
    const source = read(ACTIONS);
    const start = source.indexOf("export async function sendTestReminderAction");
    expect(start).toBeGreaterThan(-1);

    const body = source.slice(start);
    expect(body).not.toContain("whatsapp_reminder_sends");
    expect(body).not.toContain(".insert(");
  });

  it("passes the provider's own result through instead of summarising it", () => {
    const source = read(ACTIONS);

    expect(source).toContain("httpStatus?: number");
    expect(source).toContain("providerError?: string");
    expect(source).toContain("messageId?: string | null");
  });
});
