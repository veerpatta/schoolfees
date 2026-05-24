import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteView,
  generateViewId,
  listSavedViews,
  renameView,
  saveView,
} from "@/lib/data-table/saved-views";

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

let storage: StorageStub;

beforeEach(() => {
  storage = makeStorage();
  vi.stubGlobal("window", { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("data-table/saved-views", () => {
  it("returns an empty list when storage is empty", () => {
    expect(listSavedViews("students")).toEqual([]);
  });

  it("saves and lists views, newest first", () => {
    saveView("students", { id: "u:a", label: "A", state: { class: "10" } });
    saveView("students", { id: "u:b", label: "B", state: { class: "12" } });
    const list = listSavedViews<{ class: string }>("students");
    expect(list.map((v) => v.id)).toEqual(["u:b", "u:a"]);
    expect(list[0].state.class).toBe("12");
  });

  it("places builtIn views before user views, preserving their order", () => {
    saveView("students", { id: "u:a", label: "Mine", state: 1 });
    const list = listSavedViews<number>("students");
    expect(list[0].id).toBe("u:a");

    // Inject a built-in directly to verify the sort honors the flag.
    storage.setItem(
      "vpps.views.students",
      JSON.stringify([
        { id: "b:all", label: "All", state: 0, builtIn: true, createdAt: 1 },
        { id: "u:a", label: "Mine", state: 1, createdAt: 10 },
      ]),
    );
    const list2 = listSavedViews<number>("students");
    expect(list2[0].builtIn).toBe(true);
    expect(list2[1].id).toBe("u:a");
  });

  it("dedupes by id when saving", () => {
    saveView("students", { id: "u:a", label: "A v1", state: 1 });
    saveView("students", { id: "u:a", label: "A v2", state: 2 });
    const list = listSavedViews<number>("students");
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("A v2");
    expect(list[0].state).toBe(2);
  });

  it("deletes a view by id", () => {
    saveView("students", { id: "u:a", label: "A", state: 1 });
    saveView("students", { id: "u:b", label: "B", state: 2 });
    deleteView("students", "u:a");
    const list = listSavedViews("students");
    expect(list.map((v) => v.id)).toEqual(["u:b"]);
  });

  it("renames a view by id", () => {
    saveView("students", { id: "u:a", label: "Old", state: 1 });
    renameView("students", "u:a", "New");
    const list = listSavedViews("students");
    expect(list[0].label).toBe("New");
  });

  it("generates a slug-style id from a label", () => {
    const id1 = generateViewId("Class 10 — Defaulters");
    expect(id1).toMatch(/^u:class-10-defaulters:[a-z0-9]+$/);

    const id2 = generateViewId("   weird !! chars ??? ");
    expect(id2.startsWith("u:weird-chars:")).toBe(true);

    const id3 = generateViewId("####");
    expect(id3.startsWith("u:view:")).toBe(true);
  });

  it("tolerates corrupt JSON in storage", () => {
    storage.setItem("vpps.views.students", "{not-json");
    expect(() => listSavedViews("students")).not.toThrow();
    expect(listSavedViews("students")).toEqual([]);
  });
});
