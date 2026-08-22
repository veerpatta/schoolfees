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

const WORKSPACE = "src/modules/whatsapp/ui/reminders-workspace.tsx";
const PANEL = "src/modules/whatsapp/ui/test-send-panel.tsx";
const PAGE = "src/app/protected/reminders/page.tsx";
const ACTIONS = "src/app/protected/reminders/actions.ts";
const CAMPAIGNS = "src/modules/whatsapp/domain/campaigns.ts";
const PICKER = "src/modules/whatsapp/ui/notice-picker.tsx";

describe("WhatsApp reminders on a phone", () => {
  it("clears the tab bar, because /protected/reminders is NOT a takeover", () => {
    // Inverted on 22 Aug 2026. While this screen lived under /protected/admin-tools
    // it was a takeover — MobileBottomNav rendered nothing, so reserving space for
    // it would have floated the send bar 68px above the home indicator. As a
    // top-level tab the bar is really there and must be cleared, which is why this
    // file now also appears in the NAV_CLEARANCE list in
    // tests/ui/mobile-action-reachability.test.ts.
    const source = read(WORKSPACE);

    expect(source).toContain("var(--mobile-bottom-nav-offset");
    expect(source).toContain("md:bottom-0");
    // The safe area is still cleared on top of the nav offset, not instead of it.
    expect(source).toContain("var(--mobile-safe-area-bottom, 0px)");
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

  it("carries the chosen notice, language and date through every GET form", () => {
    // Three forms submit to the same URL: the notice picker (which owns all three
    // of these) and the phone and desk copies of the filters. A filter form
    // missing them drops them from the query string, so narrowing to one class
    // would silently reset the notice to fee-due, the language to Hindi and the
    // deadline to the default — none of which the office chose, all of which a
    // parent then reads.
    const source = read(WORKSPACE);

    const fields = source.slice(
      source.indexOf("function ReminderFilterFields"),
      source.indexOf("export function RemindersWorkspace"),
    );
    for (const field of ["situation", "language", "lastDate"]) {
      expect(fields).toContain(`name="${field}"`);
    }
    // Both filter forms render the same component, so one hidden input covers both.
    expect(source.match(/<ReminderFilterFields/g) ?? []).toHaveLength(2);
  });

  it("hides a filter the notice ignores, but never drops its value", () => {
    // A control that does nothing reads as applied — that is how 87 families
    // ended up chased for installments that were not due. So a notice that
    // ignores a filter hides the control. Hiding it must not DELETE it, though:
    // the office's installment choice has to survive a trip through the
    // previous-session notice and still be there on the way back.
    const source = read(WORKSPACE);

    const fields = source.slice(
      source.indexOf("function ReminderFilterFields"),
      source.indexOf("export function RemindersWorkspace"),
    );

    // Every optional control is a ternary whose else-branch is a hidden input
    // carrying the same name.
    for (const name of ["maxTotalPaid", "installments"]) {
      expect(fields).toContain(`<input type="hidden" name="${name}"`);
      expect(fields).toContain(`applies.${name === "maxTotalPaid" ? "paidSoFar" : name} ?`);
    }
  });

  it("keeps the situation table covering every notice", () => {
    // `SITUATION_FILTERS` and `SITUATION_RULE` are keyed by NoticeSituation, so
    // a seventh campaign cannot be added without deciding what its filters mean.
    const source = read(CAMPAIGNS);

    for (const situation of ["fee_due", "balance", "prevyear"]) {
      expect(source.slice(source.indexOf("SITUATION_FILTERS"))).toContain(`${situation}:`);
      expect(source.slice(source.indexOf("SITUATION_RULE"))).toContain(`${situation}:`);
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
    expect(read(CAMPAIGNS)).toContain("फीस सूचना");
    expect(read(WORKSPACE)).not.toContain("फीस सूचना");
    expect(read(PANEL)).not.toContain("फीस सूचना");
    expect(read(PICKER)).not.toContain("फीस सूचना");
  });

  it("takes its date from a variable, so no template can expire again", () => {
    // The old campaign hardcoded 25 अगस्त 2026 in its body, which is why the
    // screen refused to send from the 26th. All six take the date as a slot.
    const source = read(CAMPAIGNS);

    expect(source).not.toContain("FEE_REMINDER_TEMPLATE_DEADLINE");
    expect(source).toContain("lastDate");
    // Every campaign that prints a date reads it from the slot, never a literal.
    expect(source).not.toMatch(/अंतिम तिथि: 25 अगस्त/);
  });

  it("keeps the slot counts the approved campaigns enforce", () => {
    // A count that does not match is refused with "Template params does not
    // match the campaign" — cheap to catch here, expensive mid-run.
    const source = read(CAMPAIGNS);

    // Tokenised, never `toContain`: `vpps_app_fee_due_hi` is a PREFIX of
    // `vpps_app_fee_due_hi_v2`, so a substring check keeps passing through a
    // version bump and quietly stops guarding the slot counts — the one thing
    // here that costs money.
    const named = new Set(source.match(/vpps_app_[a-z0-9_]+/g) ?? []);
    for (const name of [
      "vpps_app_fee_due_hi_v2",
      "vpps_app_balance_en_v2",
      "vpps_app_prevyear_hi_v2",
    ]) {
      expect([...named]).toContain(name);
    }
    // And the superseded six are gone for good.
    for (const stale of [...named]) {
      expect(stale.endsWith("_v2")).toBe(true);
    }
  });
});

describe("WhatsApp reminders client boundary", () => {
  it.each([WORKSPACE, PANEL, PICKER])("%s value-imports no server-only module", (path) => {
    // lib/whatsapp/fee-reminders.ts and lib/whatsapp/aisensy.ts both carry
    // `import "server-only"`. A value import from either would fail the build.
    const source = read(path);

    // Repointed at the post-restructure paths. The old pattern still matched
    // `@/lib/whatsapp/`, which nothing imports any more, so it silently
    // enforced nothing.
    for (const match of source.matchAll(
      // `[^;]*?` rather than `[\s\S]*?`: the latter happily spans from an
      // EARLIER import statement, so the captured clause was whatever preceded
      // the match and never started with "type". The old pattern had the same
      // flaw but pointed at `@/lib/whatsapp/`, which nothing imports any more,
      // so it matched nothing and hid the bug.
      /import\s+([^;]*?)\s+from\s+"@\/modules\/whatsapp\/(?:domain|data)\/([\w-]+)"/g,
    )) {
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
