import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("office sync events", () => {
  it("has a schema-backed optional sync event stream for cross-tab refresh", () => {
    const migration = readRepoFile("supabase/migrations/20260516100000_office_sync_events.sql");
    const schema = readRepoFile("supabase/schema.sql");
    const publisher = readRepoFile("lib/system-sync/office-sync-events.ts");
    const subscriber = readRepoFile("components/admin/office-sync-listener.tsx");
    const shell = readRepoFile("components/admin/dashboard-shell.tsx");

    expect(migration).toContain("create table if not exists public.office_sync_events");
    expect(migration).toContain("alter publication supabase_realtime add table public.office_sync_events");
    expect(schema).toContain("create table if not exists public.office_sync_events");
    expect(publisher).toContain("publishOfficeSyncEvent");
    expect(subscriber).toContain("postgres_changes");
    expect(subscriber).toContain("router.refresh()");
    expect(shell).toContain("<OfficeSyncListener sessionLabel={viewSessionLabel} />");
  });
});
