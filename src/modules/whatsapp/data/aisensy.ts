import "server-only";

import { getOptionalEnvVar } from "@/platform/env";

/**
 * AiSensy Campaign API client.
 *
 * One endpoint, one job: fire a Meta-approved WhatsApp template at one number
 * by naming a Live API Campaign. The template body and its variable slots live
 * in AiSensy and Meta, not here — all this sends is the campaign name and the
 * values that fill the slots.
 *
 * The Basic plan includes this endpoint. The richer "Project API" (contact
 * CRUD, delivery webhooks) is Pro-only, which is why nothing here reads
 * delivery status back: `submitted_message_id` is an acceptance receipt, not
 * proof the parent's phone lit up. The AiSensy dashboard is where that lives.
 */

const AISENSY_ENDPOINT = "https://backend.aisensy.com/campaign/t1/api/v2";

export type AisensySendResult =
  | { ok: true; status: number; messageId: string | null }
  | { ok: false; status: number; error: string };

export type AisensySendArgs = {
  campaignName: string;
  /** E.164 with country code, e.g. +919352205884. */
  destination: string;
  /** Contact display name in AiSensy. Not necessarily a template variable. */
  userName: string;
  /** Values for the template's {{1}}, {{2}}, … in order. */
  templateParams: string[];
  source?: string;
};

export function isAisensyConfigured(): boolean {
  return Boolean(getOptionalEnvVar("AISENSY_API_KEY")?.trim());
}

export async function sendAisensyCampaignMessage(
  args: AisensySendArgs,
): Promise<AisensySendResult> {
  const apiKey = getOptionalEnvVar("AISENSY_API_KEY")?.trim();
  if (!apiKey) {
    return { ok: false, status: 0, error: "AISENSY_API_KEY is not configured." };
  }

  let response: Response;
  try {
    response = await fetch(AISENSY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        campaignName: args.campaignName,
        destination: args.destination,
        userName: args.userName,
        source: args.source ?? "veerpatta-fees-app",
        templateParams: args.templateParams,
      }),
    });
  } catch (caught) {
    // A network failure is not a delivery failure — we do not know whether
    // AiSensy accepted it. The caller records this as failed and leaves the day
    // claimed, which is the safe direction: one parent missed beats one parent
    // messaged twice.
    return {
      ok: false,
      status: 0,
      error: caught instanceof Error ? caught.message : "Network error calling AiSensy.",
    };
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : text.slice(0, 300);
    return { ok: false, status: response.status, error: message };
  }

  const messageId =
    typeof body === "object" && body !== null && "submitted_message_id" in body
      ? String((body as { submitted_message_id: unknown }).submitted_message_id)
      : null;

  return { ok: true, status: response.status, messageId };
}
