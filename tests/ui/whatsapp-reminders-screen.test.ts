import { readdirSync, readFileSync } from "node:fs";
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

/** Every file under `dir`, recursively, as repo-relative paths with `/`. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
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

  it("carries the chosen notice, language, date and window through every GET form", () => {
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
    // `preDueWindowDays` joined the list when the calendar started deriving the
    // installment set: it decides which installments are active, so it decides
    // the audience, so it has to survive an Apply exactly like the other three.
    for (const field of ["situation", "language", "lastDate", "preDueWindowDays"]) {
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

    for (const situation of [
      "fee_due",
      "balance",
      "prevyear",
      "upcoming",
      "upcoming_final",
      "late_fee_applied",
      "promise_lapsed",
    ]) {
      expect(source.slice(source.indexOf("SITUATION_FILTERS"))).toContain(`${situation}:`);
      expect(source.slice(source.indexOf("SITUATION_RULE"))).toContain(`${situation}:`);
    }
  });

  it("keeps the unapproved template bodies out of the browser", () => {
    // `campaign-bodies-v3.ts` holds eight Hindi and English bodies for notices
    // Meta has not approved. A preview is only ever rendered for a campaign
    // `campaignFor` returned, and that returns approved campaigns only — so
    // every byte of them in the client bundle is provably unreachable text, and
    // it measured 1084 gzip bytes against a ceiling that only ratchets down.
    //
    // The module header says "nothing in src/app or src/modules/**/ui may
    // import this file". A comment is not a guard; this is.
    const offenders: string[] = [];
    for (const dir of ["src/app", "src/modules"]) {
      for (const file of walk(dir)) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        // Only the surfaces that reach a browser. `domain/` and `data/` may
        // import it freely, and so may tests.
        if (!file.includes("/ui/") && !file.startsWith("src/app")) continue;
        if (readFileSync(file, "utf8").includes("campaign-bodies-v3")) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("passes the calendar to the audience, and derives the date banner from it", () => {
    // `loadReminderAudience`'s calendar parameter has a default, so leaving it
    // out typechecks cleanly and silently reverts the installment set to the
    // hardcoded pair this feature replaced — while `upcoming`,
    // `upcoming_final` and `late_fee_applied` reach nobody at all.
    //
    // That is not hypothetical: the wiring was lost once to a stray
    // `git checkout` and committed green. This is the guard.
    const source = read(PAGE);

    expect(source).toContain("buildInstallmentCalendar");
    expect(source).toMatch(/loadReminderAudience\(\s*supabase,\s*filters,\s*calendar\s*\)/);
    // The calendar's active set must reach the parser, or the installment
    // default is still a constant.
    expect(source).toContain("calendar.active");
    // And the banner must ask the per-notice rule rather than comparing dates,
    // or `late_fee_applied` is greyed out on the one screen it belongs on.
    expect(source).toContain("describeDateGuard");
    expect(source).not.toMatch(/dateHasPassed = !pickedIso \|\| pickedIso < today/);
  });

  it("shows an unapproved notice disabled rather than hiding it", () => {
    // A missing chip is a mystery; a disabled one with a reason is an answer.
    // The alternative is the office learning a template is not Live from
    // `400 Campaign does not exist.` after pressing Send.
    const source = read(PICKER);

    expect(source).toContain("isCampaignApproved");
    expect(source).toContain("awaiting Meta approval");
    // A `<span>`, never a `<Link>` — an unapproved notice must not be navigable
    // to a screen that would then refuse to send from it.
    expect(source).toContain('aria-disabled="true"');
  });

  it("carries the window on every notice and language link", () => {
    // `hrefWith` rebuilds the whole query string, so a parameter it forgets is a
    // parameter that resets the moment somebody switches notice.
    const source = read(PICKER);
    const href = source.slice(source.indexOf("function hrefWith"), source.indexOf("const CHIP_BASE"));

    for (const field of ["situation", "language", "installments", "preDueWindowDays"]) {
      expect(href).toContain(`"${field}"`);
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
    //
    // Asserted as "carries a version suffix" rather than "ends with _v2": the
    // thing being guarded is that the UN-SUFFIXED six from 21 August — no
    // late-fee slot, no settle-by date — can never be pointed at again. Pinning
    // the literal `_v2` made that guarantee expire the moment a `_v3` was
    // written, which is exactly when it is still needed.
    for (const stale of [...named]) {
      expect(stale).toMatch(/_v\d+$/);
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
    // THE rule: logging a test to `whatsapp_reminder_sends` would claim that
    // student's day, and the unique index would then silently drop them from the
    // real send.
    //
    // This used to be enforced as "no Supabase call at all in the action", which
    // was a good proxy while there was nowhere else for a test to be recorded.
    // There is now: the untested-campaign guard needs to know whether a campaign
    // was tested today, so a test writes to `whatsapp_test_sends` — a different
    // table, with no student_id and no day to claim.
    //
    // So the assertion is now the rule itself rather than the proxy, and it is
    // TIGHTER on the thing that matters: the send log may not be named at all,
    // and the only table the action may write to is the test log.
    const source = read(ACTIONS);
    const start = source.indexOf("export async function sendTestReminderAction");
    expect(start).toBeGreaterThan(-1);

    // Bounded to THIS function. Slicing to end-of-file used to work only
    // because it happened to be the last one in the file, and it silently stops
    // testing anything the moment something is appended after it.
    const after = source.indexOf("\nexport ", start + 1);
    const body = source.slice(start, after === -1 ? undefined : after);

    expect(body).not.toContain("whatsapp_reminder_sends");
    // `recordTestSend` is the one recorded write, and it owns its own table.
    expect(body).not.toContain(".from(");
    expect(body).not.toContain(".insert(");
    expect(body).toContain("recordTestSend");

    // And that helper writes only to the test log, never to the send log.
    const helper = read("src/modules/whatsapp/data/guard-context.ts");
    const recordStart = helper.indexOf("export async function recordTestSend");
    expect(recordStart).toBeGreaterThan(-1);
    const recordBody = helper.slice(recordStart);
    expect(recordBody).toContain("whatsapp_test_sends");
    expect(recordBody).not.toContain("whatsapp_reminder_sends");
  });

  it("passes the provider's own result through instead of summarising it", () => {
    const source = read(ACTIONS);

    expect(source).toContain("httpStatus?: number");
    expect(source).toContain("providerError?: string");
    expect(source).toContain("messageId?: string | null");
  });
});
