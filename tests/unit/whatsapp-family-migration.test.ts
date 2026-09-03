import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The two migrations Phase 2 applied, checked as text.
 *
 * Both were applied through the Supabase MCP, which records a version from the
 * wall clock at apply time rather than from the filename — so the FILENAME
 * check below is not pedantry. A file whose leading timestamp disagrees with
 * what Postgres recorded makes `supabase db push --dry-run` fail with "Remote
 * migration versions not found in local migrations directory", which is the
 * trap CLAUDE.md documents and which has bitten this repo before.
 */

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const read = (file: string) => readFileSync(join(MIGRATIONS, file), "utf8");

const FAMILY = "20260903130517_whatsapp_family_language_and_numbers.sql";
const CAMPAIGNS = "20260903131911_whatsapp_campaigns_accept_new_notices.sql";

describe("the family, language and second-number migration", () => {
  const sql = read(FAMILY);

  it("adds the family language as NULLABLE, so null can mean 'follow the run'", () => {
    expect(sql).toContain("add column if not exists whatsapp_language text");
    // Null is a third state, not a missing 'hi'. A NOT NULL default would erase
    // the difference between a family who has answered and one who has not.
    expect(sql).not.toMatch(/whatsapp_language text[^;]*not null/i);
    expect(sql).toContain("whatsapp_language is null or whatsapp_language in ('hi', 'en')");
  });

  it("records the language the message actually went out in", () => {
    // The run's language is the DEFAULT. Answering "which language did this
    // parent get" from the run record would be a guess.
    expect(sql).toContain("alter table public.whatsapp_reminder_sends");
    expect(sql).toContain("add column if not exists language text");
  });

  it("admits covered_by_sibling without dropping the statuses that exist", () => {
    expect(sql).toContain(
      "check (status in ('pending', 'sent', 'failed', 'covered_by_sibling'))",
    );
  });

  it("caps the second number with an enum rather than the phone string", () => {
    // Putting `destination` in the unique index was the alternative and is
    // worse: the index is what guarantees a family is not messaged twice for one
    // notice, and a re-formatted number would silently buy a third message.
    expect(sql).toContain("destination_role text not null default 'primary'");
    expect(sql).toContain("check (destination_role in ('primary', 'secondary'))");
    expect(sql).toContain(
      "(student_id, session_label, sent_on, campaign_name, destination_role)",
    );
    // The old index must go, or the two disagree about how many rows are allowed.
    expect(sql).toContain("drop index if exists public.whatsapp_reminder_sends_student_day_campaign_idx");
  });

  it("is idempotent — every add guarded, every constraint checked first", () => {
    for (const guard of [
      "add column if not exists",
      "create unique index if not exists",
      "create index if not exists",
      "drop constraint if exists",
    ]) {
      expect(sql).toContain(guard);
    }
  });

  it("explains itself in table and column comments", () => {
    // The repo's rule for migrations: comments say WHY, on the object, so the
    // next person reads them from the database rather than from git history.
    expect(sql).toContain("comment on column public.student_collection_flags.whatsapp_language");
    expect(sql).toContain("comment on column public.whatsapp_reminder_sends.language");
    expect(sql).toContain("comment on column public.whatsapp_reminder_sends.destination_role");
    expect(sql).toContain("comment on index public.whatsapp_reminder_sends_student_day_campaign_role_idx");
  });
});

describe("the saved-campaign situation migration", () => {
  const sql = read(CAMPAIGNS);

  it("accepts every notice the registry knows, not only the August three", () => {
    // A campaign saves the RULE, not the audience, so the office may save "due
    // soon" before its template is Live. Saving and sending are different acts;
    // only the second needs Meta.
    for (const situation of [
      "fee_due",
      "balance",
      "prevyear",
      "upcoming",
      "upcoming_final",
      "late_fee_applied",
      "promise_lapsed",
    ]) {
      expect(sql).toContain(`'${situation}'`);
    }
  });

  it("leaves the run history unconstrained", () => {
    // A run records what was ATTEMPTED. Constraining history to a list that
    // grows would make an old run unreadable the day a notice is retired.
    //
    // Asserted on the ALTER, not on the name: the migration names the table in
    // a comment precisely to say it is being left alone, and a check that
    // forbade the word would forbid explaining the decision.
    expect(sql).not.toMatch(/alter\s+table\s+public\.whatsapp_campaign_runs/i);
  });
});

describe("every migration filename matches the version Postgres recorded", () => {
  it("keeps the two Phase 2 files at their applied versions", () => {
    const files = readdirSync(MIGRATIONS);
    expect(files).toContain(FAMILY);
    expect(files).toContain(CAMPAIGNS);

    // And the versions they were written as are gone, so a rename cannot be
    // half-done — which is what leaves `supabase db push` broken.
    expect(files).not.toContain("20260903120000_whatsapp_family_language_and_numbers.sql");
    expect(files).not.toContain("20260903140000_whatsapp_campaigns_accept_new_notices.sql");
  });

  it("cites its own applied version in the comments it writes", () => {
    // A comment naming the pre-rename version would send the next reader to a
    // migration that does not exist.
    expect(read(FAMILY)).toContain("20260903130517");
    expect(read(FAMILY)).not.toContain("20260903120000");
    expect(read(CAMPAIGNS)).toContain("20260903131911");
    expect(read(CAMPAIGNS)).not.toContain("20260903140000");
  });
});
