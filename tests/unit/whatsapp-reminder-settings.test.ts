import { describe, expect, it } from "vitest";

import {
  lastUsedNoticeSettingsKey,
  loadLastUsedNoticeSettings,
  ONE_MESSAGE_PER_FAMILY_KEY,
  oneMessagePerFamilyEnabled,
  parseLastUsedNoticeSettings,
  rememberLastUsedNoticeSettings,
} from "@/modules/whatsapp/data/reminder-settings";

/**
 * The two settings rows the reminders screen opens on.
 *
 * Both are read before the screen draws, so a bad row has to fall back rather
 * than take the screen down — and the family switch has to fail ON, because
 * that is the behaviour the owner chose and a query error must not silently
 * change what a two-child phone gets.
 */

/** A one-row settings table. */
function settingsClient(rows: Record<string, string>, writes: Record<string, unknown>[] = []) {
  return {
    from(table: string) {
      expect(table).toBe("app_settings");
      let key = "";
      const chain = {
        select: () => chain,
        eq: (_column: string, value: string) => {
          key = value;
          return chain;
        },
        maybeSingle: async () => ({ data: key in rows ? { value: rows[key] } : null }),
        upsert: async (row: Record<string, unknown>) => {
          writes.push(row);
          return { error: null };
        },
      };
      return chain;
    },
  };
}

const broken = {
  from() {
    throw new Error("settings table unreadable");
  },
};

describe("one message per family", () => {
  it("is on with no row, on with any other value, and off only on 'false'", async () => {
    expect(await oneMessagePerFamilyEnabled(settingsClient({}))).toBe(true);
    expect(await oneMessagePerFamilyEnabled(settingsClient({ [ONE_MESSAGE_PER_FAMILY_KEY]: "true" }))).toBe(true);
    expect(await oneMessagePerFamilyEnabled(settingsClient({ [ONE_MESSAGE_PER_FAMILY_KEY]: "FALSE" }))).toBe(false);
  });

  it("fails on when the table cannot be read", async () => {
    expect(await oneMessagePerFamilyEnabled(broken)).toBe(true);
  });
});

describe("last-used notice settings", () => {
  it("round-trips through one row per session", async () => {
    const writes: Record<string, unknown>[] = [];
    const rows: Record<string, string> = {};
    const client = settingsClient(rows, writes);

    await rememberLastUsedNoticeSettings(client, "2026-27", {
      lastDate: "05-09-2026",
      lateFeeAmount: 2000,
      lateFeeBasis: "per_installment",
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]!.key).toBe(lastUsedNoticeSettingsKey("2026-27"));
    rows[String(writes[0]!.key)] = String(writes[0]!.value);

    expect(await loadLastUsedNoticeSettings(client, "2026-27")).toEqual({
      lastDate: "05-09-2026",
      lateFeeAmount: 2000,
      lateFeeBasis: "per_installment",
    });
    // Another session has its own settle-by date.
    expect(await loadLastUsedNoticeSettings(client, "TEST-2026-27")).toBeNull();
  });

  it("falls back field by field on a hand-edited row, and to null on junk", () => {
    expect(parseLastUsedNoticeSettings("not json")).toBeNull();
    expect(parseLastUsedNoticeSettings("")).toBeNull();
    expect(parseLastUsedNoticeSettings("{}")).toBeNull();
    expect(parseLastUsedNoticeSettings(JSON.stringify({ lastDate: "2026-09-05" }))).toBeNull();
    expect(
      parseLastUsedNoticeSettings(
        JSON.stringify({ lastDate: "05-09-2026", lateFeeAmount: "abc", lateFeeBasis: "weekly" }),
      ),
    ).toEqual({ lastDate: "05-09-2026", lateFeeAmount: 0, lateFeeBasis: "per_installment" });
  });

  it("reads as nothing remembered when the table cannot be read, and never throws on write", async () => {
    expect(await loadLastUsedNoticeSettings(broken, "2026-27")).toBeNull();
    await expect(
      rememberLastUsedNoticeSettings(broken, "2026-27", {
        lastDate: "05-09-2026",
        lateFeeAmount: 2000,
        lateFeeBasis: "flat",
      }),
    ).resolves.toBeUndefined();
  });
});
