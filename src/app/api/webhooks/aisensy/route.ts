import { NextResponse } from "next/server";

import { logWarn } from "@/platform/observability/log";
import { createAdminClient } from "@/platform/supabase/admin";
import { readDeliveryStatus, STATUS_RANK } from "@/modules/whatsapp/domain/delivery-report";
import type { DeliveryStatus } from "@/modules/whatsapp/domain/delivery-report";

/**
 * AiSensy delivery webhook.
 *
 * **A no-op 404 unless `AISENSY_WEBHOOK_SECRET` is set**, and it is not set,
 * because delivery webhooks are a Pro-plan feature and this school is on Basic.
 * The route exists so that upgrading the plan is a matter of setting one
 * environment variable rather than writing this on the day it is needed — and
 * so that until then it is genuinely absent rather than an unauthenticated
 * endpoint waiting to be found.
 *
 * 404 rather than 401 when unconfigured, deliberately: an endpoint that answers
 * "unauthorised" confirms it exists. Until the secret is set, this is not a
 * route.
 *
 * It writes exactly what the CSV import writes, through the same pure rules —
 * the same status vocabulary, the same never-move-backwards ranking, and the
 * same refusal to touch a `covered_by_sibling` row.
 */

function configuredSecret(): string | null {
  return process.env.AISENSY_WEBHOOK_SECRET?.trim() || null;
}

const NOT_HERE = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function POST(request: Request) {
  const secret = configuredSecret();
  if (!secret) return NOT_HERE();

  const provided =
    request.headers.get("x-aisensy-signature") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("secret");

  if (provided !== secret) {
    logWarn("webhook.aisensy.unauthorized", { reason: "Secret missing or does not match." });
    // 401 here, not 404: the route IS configured, so hiding it buys nothing and
    // a rotated secret should be diagnosable.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body is not JSON." }, { status: 400 });
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const messageId =
    String(body.submitted_message_id ?? body.messageId ?? body.message_id ?? "").trim() || null;
  const status = readDeliveryStatus(String(body.status ?? body.event ?? ""));

  if (!messageId || !status) {
    // Accepted and ignored. A provider that retries on non-2xx would hammer this
    // forever over a payload shape we do not understand.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supabase = createAdminClient();

  // Only a row this app actually sent. A `covered_by_sibling` row carries its
  // sibling's provider id, and writing a delivery result to both would report
  // one delivered message as several.
  const { data: rows } = await supabase
    .from("whatsapp_reminder_sends")
    .select("id, delivery_status")
    .eq("provider_message_id", messageId)
    .eq("status", "sent");

  const target = ((rows ?? []) as Array<{ id: string; delivery_status: string | null }>)[0];
  if (!target) return NextResponse.json({ ok: true, matched: false });

  // Never backwards: webhooks arrive out of order, and "submitted" landing after
  // "read" must not undo it.
  const currentRank = target.delivery_status
    ? STATUS_RANK[target.delivery_status as DeliveryStatus]
    : 0;
  if (STATUS_RANK[status] <= currentRank) {
    return NextResponse.json({ ok: true, matched: true, changed: false });
  }

  const now = new Date().toISOString();
  await supabase
    .from("whatsapp_reminder_sends")
    .update({
      delivery_status: status,
      ...(status === "delivered" ? { delivered_at: now } : {}),
      ...(status === "read" ? { read_at: now } : {}),
      updated_at: now,
    })
    .eq("id", target.id);

  return NextResponse.json({ ok: true, matched: true, changed: true });
}

/** Same rule as POST: without the secret this route does not exist. */
export async function GET() {
  return configuredSecret()
    ? NextResponse.json({ ok: true, configured: true })
    : NOT_HERE();
}
