import { NextResponse } from "next/server";
import { z } from "zod";

import { logError } from "@/platform/observability/log";
import { requireJobSecret } from "@/platform/jobs/job-secret";
import { createAdminClient } from "@/platform/supabase/admin";

/**
 * Where the off-platform backup reports what it did.
 *
 * The nightly backup runs in GitHub Actions, not in this app: it needs
 * `pg_dump`, `age` and `rclone`, and it must keep working when Vercel or this
 * deployment is the thing that is broken. But a backup nobody can see is a
 * backup nobody trusts, so the workflow POSTs its manifest summary here and the
 * row lands in `backup_runs` where the school can be shown it.
 *
 * `verified` is the field that matters and the workflow only sets it true when
 * `rclone check` has read every file back from both destinations. An upload
 * that returned 200 is not a backup; a file you have read back and checksummed
 * is.
 *
 * Node runtime: this writes with the service-role client.
 */

export const runtime = "nodejs";

const JOB_NAME = "backup_report";

const bodySchema = z.object({
  kind: z.enum(["nightly", "restore_drill"]),
  dump_bytes: z.number().int().nonnegative().nullish(),
  sha256: z.string().min(1).max(200).nullish(),
  row_counts: z.record(z.string(), z.unknown()).nullish(),
  destinations: z
    .union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
    .nullish(),
  verified: z.boolean(),
  notes: z.string().max(5000).nullish(),
});

export async function POST(request: Request) {
  // No `allowQuery` here. This route is new, its only caller is a workflow we
  // are writing in the same phase, and a secret in a query string ends up in
  // logs. The three legacy routes get the query-string affordance because they
  // already had it; nothing new does.
  const auth = requireJobSecret(request, JOB_NAME);
  if (!auth.ok) {
    return auth.response;
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("backup_runs")
    .insert({
      kind: parsed.data.kind,
      dump_bytes: parsed.data.dump_bytes ?? null,
      sha256: parsed.data.sha256 ?? null,
      row_counts: parsed.data.row_counts ?? null,
      destinations: parsed.data.destinations ?? null,
      verified: parsed.data.verified,
      notes: parsed.data.notes ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // The backup itself may well have succeeded. Losing the record of it is
    // still a problem worth an error-level line, because the next question
    // anybody asks is "when did it last run".
    logError("jobs.backup-report.insert-failed", { error: error.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
