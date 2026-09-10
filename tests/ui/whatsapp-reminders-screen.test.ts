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
const BODIES = "src/modules/whatsapp/domain/campaign-bodies.ts";
const PICKER = "src/modules/whatsapp/ui/notice-picker.tsx";
const CONTEXT = "src/modules/whatsapp/data/reminder-context.ts";
const AUDIENCE = "src/modules/whatsapp/domain/audience.ts";
const AUDIENCE_BUILDER = "src/modules/whatsapp/ui/audience-builder.tsx";
const SEND_PAGE = "src/app/protected/reminders/page.tsx";
const FEE_REMINDERS = "src/modules/whatsapp/domain/fee-reminders.ts";

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

  it("carries every other setting through every form on the screen", () => {
    // Four forms submit to the same URL: the notice card, the phone and desk
    // copies of the filters, and the add-a-student box. A form that forgets a
    // key drops it from the query string, so narrowing to one class would
    // silently reset the notice to fee-due, the language to Hindi and the
    // deadline to the default -- none of which the office chose, all of which a
    // parent then reads.
    //
    // Was four hand-written lists of hidden inputs, checked here name by name.
    // That guarded the keys that existed and nothing added afterwards, and this
    // feature has shipped that bug once. Every form now renders ONE component
    // over ONE key list, and declares only what it owns.
    expect((read(PICKER).match(/<CarriedFilterFields/g) ?? []).length).toBe(1);
    expect((read(AUDIENCE_BUILDER).match(/<CarriedFilterFields/g) ?? []).length).toBe(3);

    // The send form too -- the action rebuilds the audience from what it posts.
    expect(read(SEND_PAGE)).toContain("sendFormFields={<CarriedFilterFields filters={filters} />}");
    expect(read(WORKSPACE)).toContain("{sendFormFields}");

    // And each form's `except` names only the keys that form actually owns.
    expect(read(PICKER)).toContain("except={NOTICE_FORM_KEYS}");
    expect(read(AUDIENCE_BUILDER)).toContain("except={FILTER_FORM_KEYS}");
  });

  it("shows every filter on every notice, and mounts the panel twice", () => {
    // The inverse of the rule this screen used to follow. `SITUATION_FILTERS`
    // HID the installment, paid-so-far and minimum controls on any notice whose
    // rule ignored them -- honest while the notice decided the audience, and a
    // cage the moment it stopped. Every filter now applies to every template,
    // so every filter is shown.
    const source = read(AUDIENCE_BUILDER);

    expect(source).not.toMatch(/import[^;]*SITUATION_FILTERS/);
    for (const name of [
      "maxTotalPaid",
      "minTotalPaid",
      "minDueAmount",
      "installments",
      "installmentMatch",
      "promise",
      "quote",
      "classId",
      "includeRte",
    ]) {
      expect(source).toContain(`name="${name}"`);
    }
    // The three yes/no/either filters share one renderer, so their names reach
    // the markup through it rather than as literals.
    for (const name of ["lateFee", "overdue", "carryForward"]) {
      expect(source).toContain(`tri("${name}"`);
    }
    expect(source).toContain('name={key}');

    // Collapsed behind a disclosure on a phone, the desk grid above md. Both
    // sit in the DOM at every viewport, which is what `idPrefix` is for.
    expect((source.match(/<FilterFields/g) ?? []).length).toBe(2);
    expect(source).toContain('idPrefix="m-"');
  });

  it("keeps the template from deciding who is on the list", () => {
    // The whole point of the split. `loadReminderAudience` must gate on the
    // FILTERS; the situation may only pick the campaign and the wording.
    const audience = read(FEE_REMINDERS);

    expect(audience).toContain("matchesAudienceFilters(filters, facts)");
    // The old gate, by name. `qualifies[filters.situation]` was the single
    // expression that made "any template to any audience" impossible.
    expect(audience).not.toContain("qualifies[filters.situation]");
    // The amount is a chosen basis, not a switch on the template.
    expect(audience).toContain("quotedAmountFor(filters.quote");
  });

  it("keeps the per-notice tables covering every notice", () => {
    // `NOTICE_FACTS` and `presetFor` are keyed by NoticeSituation, so a
    // thirteenth campaign cannot be added without deciding two things: which of
    // its slots need a fact the family may not have, and what audience its
    // preset starts from.
    //
    // Repointed from `SITUATION_FILTERS` / `SITUATION_RULE`, which answered
    // "which families is this notice about" — a question the notice stopped
    // being allowed to answer on 2026-09-08.
    const source = read(AUDIENCE);
    const facts = source.slice(source.indexOf("NOTICE_FACTS: Record"));
    const preset = source.slice(
      source.indexOf("export function presetFor"),
      source.indexOf("export const DEFAULT_MAX_TOTAL_PAID"),
    );

    for (const situation of [
      "fee_due",
      "balance",
      "prevyear",
      "upcoming",
      "upcoming_final",
      "late_fee_applied",
      "promise_lapsed",
      "late_fee_waiver",
      "waiver_last_call",
      "overdue_final",
      "promise_due",
      "exam_clearance",
    ]) {
      expect(facts).toContain(`${situation}:`);
      expect(preset).toContain(`case "${situation}":`);
    }
  });

  it("keeps every template body out of the browser", () => {
    // `campaign-bodies-v3.ts` holds the family and receipt bodies, and since
    // 2026-09-08 `campaign-bodies.ts` holds every per-student body too. Only
    // the server renders any of them — the send screen's preview is a
    // server-rendered prop and the test panel asks a server action — so every
    // byte of them in the client bundle is provably unreachable text against a
    // ceiling that only ratchets down. Moving the per-student bodies out is
    // what made room for the ten `_v4` notices without raising it.
    //
    // The module headers say "nothing in src/app or src/modules/**/ui may
    // import this file". A comment is not a guard; this is. `src/app/**/
    // actions.ts` files are server actions and may import them — the page's
    // preview and the panel's preview both go through one.
    const offenders: string[] = [];
    for (const dir of ["src/app", "src/modules"]) {
      for (const file of walk(dir)) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        // Only the surfaces that reach a browser. `domain/` and `data/` may
        // import it freely, and so may tests.
        if (!file.includes("/ui/") && !file.startsWith("src/app")) continue;
        // A server component or a server action renders on the server; a
        // client component is the browser. `"use client"` is the line.
        const source = readFileSync(file, "utf8");
        const isClient = /^\s*["']use client["']/m.test(source);
        if (!isClient && (file.endsWith("/page.tsx") || file.endsWith("/actions.ts"))) continue;
        if (/campaign-bodies(-v3)?["']/.test(source)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("previews the test panel through a server action, never in the browser", () => {
    // The panel used to import `campaignFor(...).renderPreview`, which pulled
    // every body into the client bundle so that one could be shown.
    const panel = read(PANEL);
    expect(panel).toContain("previewNoticeAction");
    expect(panel).not.toContain("renderPreview");
    expect(panel).not.toContain("renderNoticePreview");
    expect(panel).not.toContain("campaign-bodies");
  });

  it("passes the calendar to the audience, and derives the date banner from it", () => {
    // `loadReminderAudience`'s calendar parameter has a default, so leaving it
    // out typechecks cleanly and silently reverts the installment set to the
    // hardcoded pair this feature replaced — while `upcoming`,
    // `upcoming_final` and `late_fee_applied` reach nobody at all.
    //
    // That is not hypothetical: the wiring was lost once to a stray
    // `git checkout` and committed green. This is the guard.
    //
    // The wiring moved into `resolveReminderContext` when the collection lists
    // arrived, because the send screen, the lists screen and the lists export
    // all have to derive the SAME audience from the same query string. So this
    // now guards ONE place on behalf of three callers, which is stronger than
    // it was — but only while the page really does go through it.
    const context = read(CONTEXT);

    expect(context).toContain("buildInstallmentCalendar");
    expect(context).toMatch(/loadReminderAudience\(\s*supabase,\s*filters,\s*calendar\s*\)/);
    // The calendar's active set must reach the parser, or the installment
    // default is still a constant.
    expect(context).toContain("calendar.active");
    // The window is parsed BEFORE the calendar that depends on it.
    expect(context).toContain("preDueWindowDays");

    const source = read(PAGE);
    expect(source).toContain("resolveReminderContext");
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

  it("leaves the audience alone when the template changes", () => {
    // `hrefWith` rebuilds the whole query string from `reminderQuery`, so a
    // parameter it forgets is one that resets the moment somebody switches
    // notice -- and since the split, switching TEMPLATE must not rebuild the
    // list at all. `presetHref` is the control that does that, and it lives on
    // the audience builder where it says so.
    const source = read(PICKER);
    const href = source.slice(source.indexOf("function hrefWith"), source.indexOf("const CHIP_BASE"));

    expect(href).toContain("reminderQuery(filters");
    // The template row must not carry an audience control at all.
    expect(href).not.toContain("shortcutHref");
    expect(read(PICKER)).not.toContain("AUDIENCE_SHORTCUTS");

    // And the audience row is named for the AUDIENCE, never for a notice —
    // twelve notice-named chips under twelve notice-named template chips is
    // the confusion this replaced.
    const builder = read(AUDIENCE_BUILDER);
    expect(builder).toContain("shortcutHref(filters, entry.key, calendarArgs)");
    expect(builder).not.toContain("NOTICE_SITUATIONS");
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

describe("the per-row Remove link", () => {
  /**
   * It shipped broken and nothing caught it, because every check hand-built
   * `?exclude=<id>` and so exercised the PARSE, never the LINK.
   *
   * `reminderQuery` collapses an empty value to an absent key, and
   * `[...[], ""].join(",")` is empty — so with nothing excluded yet, which is
   * the normal case, the prefix ended at the previous parameter and the row
   * href became `quote=ledger_feesf9c15390-…`. The button silently corrupted
   * the quote basis and excluded nobody. Found by reading the rendered
   * accessibility tree on production.
   */
  it("appends the key itself, so an empty exclude list still ends in `exclude=`", () => {
    const page = read(SEND_PAGE);

    // The key is appended to the string, NOT passed through reminderQuery,
    // which would delete it when the list is empty.
    expect(page).toContain('reminderQuery(filters, { exclude: null }).toString()}&exclude=');
    // And the trailing separator only appears when there is something to
    // separate from, so the href never starts with a stray comma.
    expect(page).toContain("filters.excludeStudentIds.length > 0");

    // The old shape must not come back.
    expect(page).not.toContain('exclude: [...filters.excludeStudentIds, ""].join(",")');
  });
});

describe("the test panel matches what a real send would do", () => {
  /**
   * The panel composed slot 7 from the TYPED amount whatever mode the run was
   * in, so a test of an Actual-mode fee-due notice posted ₹4,000 while the run
   * itself would send the ledger's ₹1,000. It read correctly on the waiver
   * notices only because those default to ledger — which is exactly what hid
   * it. A test that does not match the send is worse than no test.
   */
  it("receives the run's late-fee mode and the policy rate", () => {
    const page = read(SEND_PAGE);
    expect(page).toContain("lateFeeSource={filters.lateFeeSource}");
    expect(page).toContain("policyLateFeeAmount={filters.policyLateFeeAmount}");

    const panel = read(PANEL);
    expect(panel).toContain("lateFeeSource: LateFeeSource;");
    expect(panel).toContain("policyLateFeeAmount: number;");
    // And forwards them into the settings the opening values are built from.
    const settings = panel.slice(
      panel.indexOf("const settings: OpeningSettings = {"),
      panel.indexOf("const [testPhone"),
    );
    expect(settings).toContain("lateFeeSource,");
    expect(settings).toContain("policyLateFeeAmount,");
  });
});

describe("WhatsApp reminders template", () => {
  it("keeps one renderer for the message body", () => {
    // Two copies of the template would drift, and the preview would start
    // promising something the parent never receives. The bodies live in
    // `campaign-bodies.ts`; the registry carries names, slots and samples only.
    expect(read(BODIES)).toContain("फीस सूचना");
    expect(read(CAMPAIGNS)).not.toContain("फीस सूचना");
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
