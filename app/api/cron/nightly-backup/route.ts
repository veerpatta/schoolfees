import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "nightly-backups";
const TABLES_TO_DUMP = [
  "students",
  "payments",
  "receipts",
  "fee_policy_configs",
  "audit_logs",
] as const;

// Cap row count per table to keep within Edge memory limits. The schools
// largest tables (audit_logs) will be windowed to "since N days" instead of
// a full scan.
const ROW_LIMIT_PER_TABLE: Record<(typeof TABLES_TO_DUMP)[number], number> = {
  students: 5000,
  payments: 50_000,
  receipts: 50_000,
  fee_policy_configs: 200,
  audit_logs: 20_000,
};

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str: string;
  if (value instanceof Date) {
    str = value.toISOString();
  } else if (typeof value === "object") {
    str = JSON.stringify(value);
  } else {
    str = String(value);
  }
  if (/[,"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCell(row[header])).join(","));
  }
  return lines.join("\n");
}

function todayPathPrefix(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function authorize(request: Request): { ok: boolean; reason?: string } {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return { ok: false, reason: "CRON_SECRET env var not configured." };
  }
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== expectedSecret) {
    return { ok: false, reason: "Invalid or missing secret." };
  }
  return { ok: true };
}

export async function GET(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  const supabase = createAdminClient();
  const prefix = todayPathPrefix();
  const results: Array<{ table: string; rows: number; bytes: number; ok: boolean; error?: string }> = [];

  for (const table of TABLES_TO_DUMP) {
    try {
      const query = supabase.from(table).select("*").limit(ROW_LIMIT_PER_TABLE[table]);
      const orderedQuery =
        table === "audit_logs" || table === "payments" || table === "receipts"
          ? query.order("created_at", { ascending: false })
          : query;
      const { data, error } = await orderedQuery;
      if (error) {
        results.push({ table, rows: 0, bytes: 0, ok: false, error: error.message });
        continue;
      }
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const csv = rowsToCsv(rows);
      const bytes = new TextEncoder().encode(csv).length;
      const uploadPath = `${prefix}/${table}.csv`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(uploadPath, csv, {
          contentType: "text/csv",
          cacheControl: "private, max-age=0",
          upsert: true,
        });
      if (uploadError) {
        results.push({ table, rows: rows.length, bytes, ok: false, error: uploadError.message });
        continue;
      }
      results.push({ table, rows: rows.length, bytes, ok: true });
    } catch (error) {
      results.push({
        table,
        rows: 0,
        bytes: 0,
        ok: false,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const manifest = {
    timestamp: new Date().toISOString(),
    prefix,
    results,
  };

  await supabase.storage
    .from(BUCKET)
    .upload(`${prefix}/manifest.json`, JSON.stringify(manifest, null, 2), {
      contentType: "application/json",
      cacheControl: "private, max-age=0",
      upsert: true,
    });

  const allOk = results.every((entry) => entry.ok);

  return NextResponse.json(
    {
      ok: allOk,
      prefix,
      results,
    },
    { status: allOk ? 200 : 207 },
  );
}
