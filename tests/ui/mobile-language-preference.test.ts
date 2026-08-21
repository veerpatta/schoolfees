import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mobileLocaleOptions, supportedLocales } from "@/platform/i18n/locales";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * The phone app's language card: two options, saved to the account.
 *
 * Two separate promises are pinned here. The first is the design's
 * ("one language at a time", two choices). The second is the copy's — the
 * note under the picker claims the choice follows the login to any device,
 * and that claim is only true while the write path actually reaches the
 * database. A cookie-only regression would leave the string lying.
 */

describe("mobile language preference", () => {
  it("offers exactly English and हिन्दी on the phone", () => {
    expect([...mobileLocaleOptions]).toEqual(["en", "hi"]);
  });

  it("keeps Hinglish supported even though the phone does not offer it", () => {
    // Removing it from supportedLocales would strand accounts already on it
    // and orphan a fully translated 1,600-key catalog.
    expect([...supportedLocales]).toContain("hi-en");
    expect([...mobileLocaleOptions]).not.toContain("hi-en");
  });

  it("still renders the active locale's row when it is not an offered option", () => {
    // Otherwise a Hinglish account opens Settings to a radiogroup with
    // nothing selected and no way to see what it is currently set to.
    const picker = read("src/ui/mobile/language-picker.tsx");
    expect(picker).toContain("mobileLocaleOptions.includes(locale)");
    expect(picker).toContain("...mobileLocaleOptions, locale");
  });

  it("persists the choice to the account, not just the cookie", () => {
    const actions = read("src/platform/locale/actions.ts");
    expect(actions).toContain("set_my_preferred_locale");
    // Must be the user's client: the RPC is SECURITY DEFINER over
    // `where id = auth.uid()`, which is null under the service-role key, so
    // an admin client would silently update zero rows.
    expect(actions).toContain('from "@/platform/supabase/server"');
    expect(actions).not.toContain("supabase/admin");
  });

  it("never lets a failed persist break the language switch", () => {
    const actions = read("src/platform/locale/actions.ts");
    const rpcIndex = actions.indexOf("set_my_preferred_locale");
    expect(actions.lastIndexOf("try {", rpcIndex)).toBeGreaterThan(-1);
    // The cookie write must come BEFORE the RPC, so a database blip still
    // leaves the choice applied on this device.
    expect(actions.indexOf("cookieStore.set")).toBeLessThan(rpcIndex);
  });

  it("seeds the cookie from the account at sign-in", () => {
    // This is what makes "every device you sign in on" true without paying
    // for a database read on every request.
    const login = read("src/app/auth/login/actions.ts");
    expect(login).toContain("preferred_locale");
    expect(login).toContain("LOCALE_COOKIE_NAME");
  });

  it("reads the account locale on the profile query the session already runs", () => {
    const session = read("src/platform/supabase/session.ts");
    expect(session).toContain(
      "full_name, role, is_active, last_login_at, preferred_locale",
    );
  });

  it("keeps the picker note honest about where the choice is saved", () => {
    const en = JSON.parse(read("src/messages/en.json"));
    const note: string = en.MobileApp.languageNote;
    expect(note).toMatch(/login/i);
    expect(note).not.toMatch(/this device/i);
    // Receipts are a parent document and stay bilingual regardless.
    expect(note).toMatch(/bilingual/i);
  });

  it("ships the locale column and both accessors in one migration", () => {
    const migration = read(
      "supabase/migrations/20260726134923_user_preferred_locale.sql",
    );
    expect(migration).toContain("add column if not exists preferred_locale");
    expect(migration).toContain("security definer");
    expect(migration).toContain("grant execute on function public.set_my_preferred_locale(text) to authenticated");
    // The audit trigger writes a full row snapshot on every UPDATE, so a
    // no-op write must not reach it. Dropping this guard turns every tap on
    // the language card into an audit_logs row.
    expect(migration).toContain("preferred_locale is distinct from p_locale");
  });
});
