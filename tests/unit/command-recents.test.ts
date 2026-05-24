import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearRecents, listRecents, pushRecent } from "@/lib/command/recents";

/**
 * The recents module is intentionally tolerant of missing window/
 * localStorage so it works in SSR. To exercise it under tests we install
 * a minimal localStorage shim on a synthetic `window` global.
 */
type StorageStub = {
  store: Map<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function makeStorage(): StorageStub {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
  };
}

declare global {
  interface globalThis {
    window: { localStorage: StorageStub } | undefined;
  }
}

let storage: StorageStub;

beforeEach(() => {
  storage = makeStorage();
  vi.stubGlobal("window", { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("command/recents", () => {
  it("starts empty", () => {
    expect(listRecents()).toEqual([]);
  });

  it("pushes and returns most-recent-first", () => {
    pushRecent({ id: "a", kind: "student", label: "A" });
    pushRecent({ id: "b", kind: "student", label: "B" });
    const list = listRecents();
    expect(list.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("de-duplicates by (kind, id) and bumps the entry to the top", () => {
    pushRecent({ id: "a", kind: "student", label: "A v1" });
    pushRecent({ id: "b", kind: "student", label: "B" });
    pushRecent({ id: "a", kind: "student", label: "A v2" });
    const list = listRecents();
    expect(list.map((row) => row.id)).toEqual(["a", "b"]);
    expect(list[0].label).toBe("A v2");
  });

  it("caps the list at 8 entries", () => {
    for (let i = 0; i < 12; i += 1) {
      pushRecent({ id: `id-${i}`, kind: "student", label: `Row ${i}` });
    }
    const list = listRecents();
    expect(list).toHaveLength(8);
    // Newest first — id-11 should be on top.
    expect(list[0].id).toBe("id-11");
  });

  it("tolerates corrupt JSON in storage", () => {
    storage.setItem("vpps.command.recents", "{not-json");
    expect(() => listRecents()).not.toThrow();
    expect(listRecents()).toEqual([]);
  });

  it("clears all entries", () => {
    pushRecent({ id: "a", kind: "student", label: "A" });
    clearRecents();
    expect(listRecents()).toEqual([]);
  });
});
