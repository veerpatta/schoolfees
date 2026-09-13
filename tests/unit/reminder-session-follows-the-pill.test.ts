import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getViewSessionCookie = vi.fn<() => Promise<string | null>>(async () => null);
vi.mock("@/platform/session/cookie", () => ({ getViewSessionCookie }));

const resolveCurrentSessionLabel = vi.fn(async () => "2026-27");
vi.mock("@/modules/whatsapp/domain/fee-reminders", () => ({ resolveCurrentSessionLabel }));

/**
 * Which ledger the WhatsApp reminder screens are reading.
 *
 * This is a safety test, not a tidiness one. Every route under
 * `/protected/reminders` resolved its session from
 * `academic_sessions.is_current` — the school's LIVE year, globally — while the
 * session pill that staff actually switch with writes a cookie. So an office
 * sitting in `TEST-2026-27` opened WhatsApp reminders and was shown 141 real
 * families with real parents' phone numbers, beneath a badge reading
 * "TEST SESSION — not live data". Pressing Send there would have messaged real
 * parents from a screen that said it could not.
 */

describe("resolveReminderSessionLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCurrentSessionLabel.mockResolvedValue("2026-27");
  });

  it("follows the session the staff member is looking at", async () => {
    getViewSessionCookie.mockResolvedValue("TEST-2026-27");
    const { resolveReminderSessionLabel } = await import(
      "@/modules/whatsapp/data/reminder-session"
    );

    expect(await resolveReminderSessionLabel({})).toBe("TEST-2026-27");
    // The live session is not even consulted — the cookie is the answer.
    expect(resolveCurrentSessionLabel).not.toHaveBeenCalled();
  });

  it("normalises the cookie through the same parser the pill uses", async () => {
    // `parseAcademicSessionLabel`, exactly as `resolveViewSession` does — so the
    // reminders lane and every other screen can never disagree about which year
    // is on screen. It trims; it deliberately does not re-case a prefix, and
    // `setViewSessionCookie` normalises on the way in anyway.
    getViewSessionCookie.mockResolvedValue("  TEST-2026-27  ");
    const { resolveReminderSessionLabel } = await import(
      "@/modules/whatsapp/data/reminder-session"
    );

    expect(await resolveReminderSessionLabel({})).toBe("TEST-2026-27");
  });

  it("falls back to the live session when nobody has switched", async () => {
    getViewSessionCookie.mockResolvedValue(null);
    const { resolveReminderSessionLabel } = await import(
      "@/modules/whatsapp/data/reminder-session"
    );

    expect(await resolveReminderSessionLabel({})).toBe("2026-27");
  });

  it("is what every reminders route resolves its session with", async () => {
    /**
     * Asserted on the source, because there is no other way to say it: a single
     * route going back to `resolveCurrentSessionLabel` puts real parents back on
     * a screen labelled as test data, and nothing else in the suite would notice.
     *
     * The cron is the one deliberate exception and is not in this list — it has
     * no cookie and no staff member, and a scheduled run is about the school's
     * live year by definition.
     */
    const fs = await import("node:fs");
    const path = await import("node:path");

    const routes = [
      "page.tsx",
      "actions.ts",
      "campaigns/page.tsx",
      "campaigns/actions.ts",
      "lists/page.tsx",
      "lists/export/route.ts",
      "runs/[runId]/page.tsx",
      "unreachable/page.tsx",
    ];

    const offenders: string[] = [];
    for (const route of routes) {
      const file = path.join(process.cwd(), "src/app/protected/reminders", route);
      const source = fs.readFileSync(file, "utf8");
      if (source.includes("resolveCurrentSessionLabel")) offenders.push(route);
      if (!source.includes("resolveReminderSessionLabel")) offenders.push(`${route} (neither)`);
    }

    expect(offenders, "these reminders routes do not follow the session pill").toEqual([]);
  });

  it("falls back rather than throwing on a cookie it cannot read", async () => {
    // A hand-edited or stale cookie must not take the screen down. Showing the
    // year the school is actually in is the lesser failure, and a visible one.
    getViewSessionCookie.mockResolvedValue("not-a-session");
    const { resolveReminderSessionLabel } = await import(
      "@/modules/whatsapp/data/reminder-session"
    );

    expect(await resolveReminderSessionLabel({})).toBe("2026-27");
  });
});
