import { afterEach, describe, expect, it, vi } from "vitest";

import { purgeSignedOutCaches } from "@/modules/payments/domain/signed-out-purge";

/**
 * The office counter is a shared device. Before this existed, the previous
 * staffer's student index, admission numbers and fee balances stayed in Cache
 * Storage, IndexedDB and localStorage while the next person signed in.
 *
 * The other half of the contract matters just as much: unsent work survives.
 * A session that expires while somebody is half-way through entering an amount
 * must not also destroy what they typed.
 */

type StoreEntries = Record<string, string>;

function fakeLocalStorage(entries: StoreEntries) {
  const store = new Map(Object.entries(entries));

  return {
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    remaining: () => Array.from(store.keys()).sort(),
  };
}

function install(entries: StoreEntries, cacheKeys: string[]) {
  const storage = fakeLocalStorage(entries);
  const deletedCaches: string[] = [];
  const deletedDatabases: string[] = [];

  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("indexedDB", {
    deleteDatabase: (name: string) => void deletedDatabases.push(name),
  });
  vi.stubGlobal("caches", {
    keys: async () => cacheKeys,
    delete: async (key: string) => {
      deletedCaches.push(key);
      return true;
    },
  });

  return { storage, deletedCaches, deletedDatabases };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signed-out cache purge", () => {
  it("clears cached school data from all three client stores", async () => {
    const { storage, deletedCaches, deletedDatabases } = install(
      {
        "vpps.paymentDesk.studentIndex:2026-27": "[]",
        "vpps.paymentDesk.studentIndex:TEST-2026-27": "[]",
        "vpps.paymentDesk.studentSummary:2026-27:abc:2026-08-19": "{}",
      },
      ["vpps-student-index-v2", "vpps-navigation-data-v2", "vpps-fee-admin-v2"],
    );

    await purgeSignedOutCaches();

    expect(storage.remaining()).toEqual([]);
    expect(deletedDatabases).toEqual(["vpps-payment-desk-cache"]);
    expect(deletedCaches.sort()).toEqual([
      "vpps-fee-admin-v2",
      "vpps-navigation-data-v2",
      "vpps-student-index-v2",
    ]);
  });

  it("keeps the staffer's own unsent work and preferences", async () => {
    // Drafts, saved views and preferences are not caches of server data. A
    // draft in particular is an amount somebody typed and has not posted yet.
    const { storage, deletedDatabases } = install(
      {
        "vpps.paymentDesk.studentIndex:2026-27": "[]",
        "vpps.paymentDesk.lastPaymentMode": "cash",
        "vpps.paymentDesk.classStreak": "3",
        "vpps.locale": "hi",
      },
      [],
    );

    await purgeSignedOutCaches();

    expect(storage.remaining()).toEqual([
      "vpps.locale",
      "vpps.paymentDesk.classStreak",
      "vpps.paymentDesk.lastPaymentMode",
    ]);
    expect(deletedDatabases).not.toContain("vpps-payment-drafts");
  });

  it("leaves caches belonging to other origins' apps alone", async () => {
    const { deletedCaches } = install({}, ["vpps-student-index-v2", "workbox-precache-v2"]);

    await purgeSignedOutCaches();

    expect(deletedCaches).toEqual(["vpps-student-index-v2"]);
  });

  it("does not throw when the browser denies storage", async () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("caches", undefined);

    await expect(purgeSignedOutCaches()).resolves.toBeUndefined();
  });
});
