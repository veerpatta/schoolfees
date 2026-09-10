"use server";

import { parseCampaignSchedule } from "@/modules/whatsapp/domain/campaign-schedule";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/platform/supabase/admin";
import { requireStaffPermission } from "@/platform/supabase/session";
import {
  archiveCampaign,
  saveCampaign,
  type SavedCampaignFilters,
} from "@/modules/whatsapp/data/campaign-store";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_SITUATION,
  isNoticeLanguage,
  isNoticeSituation,
  TEMPLATE_INSTALLMENTS,
} from "@/modules/whatsapp/domain/campaigns";
import {
  DEFAULT_LATE_FEE_BASIS,
  isLateFeeBasis,
  isLateFeeSource,
  type LateFeeBasis,
} from "@/modules/whatsapp/domain/late-fee";
import { savedAudienceFrom } from "@/modules/whatsapp/domain/audience";
import { isoFromDdMmYyyy } from "@/platform/helpers/date";
import { resolveCurrentSessionLabel } from "@/modules/whatsapp/domain/fee-reminders";

export type CampaignFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

/**
 * Save a campaign — the settings, never the audience.
 *
 * `settings:write`, the same permission that lets someone actually send: a
 * campaign is a loaded gun, and being able to save one that quotes a ₹5,000
 * late fee is the same authority as sending it.
 *
 * Unlike the send path this DOES revalidate — the campaigns list is a plain
 * cached page and a save that does not show up reads as a save that failed.
 */
export async function saveCampaignAction(
  _prev: CampaignFormState,
  formData: FormData,
): Promise<CampaignFormState> {
  const staff = await requireStaffPermission("settings:write");
  const supabase = createAdminClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", message: "Give the campaign a name." };
  if (name.length > 80) {
    return { status: "error", message: "That name is too long — keep it under 80 characters." };
  }

  const rawSituation = String(formData.get("situation") ?? "");
  const rawLanguage = String(formData.get("language") ?? "");
  const rawBasis = String(formData.get("lateFeeBasis") ?? "");

  const number = (key: string, fallback: number) => {
    const parsed = Number(formData.get(key));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };

  const installments = String(formData.get("installments") ?? TEMPLATE_INSTALLMENTS.join(","))
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => value >= 1 && value <= 4);

  /**
   * The whole audience, from the form.
   *
   * `savedAudienceFrom` rather than an object literal, so the ONE reader of a
   * stored campaign's audience is also the one writer's shape. A field the form
   * does not carry is stored as null, meaning "take the notice's preset" — the
   * same thing it means for a row written before the audience was split from
   * the template.
   *
   * Hand-picked students are deliberately absent: a saved campaign is a
   * standing rule a nightly cron replays, and an included student bypasses both
   * the filters and their reminder cadence.
   */
  const filters: SavedCampaignFilters = savedAudienceFrom(
    isNoticeSituation(rawSituation) ? rawSituation : DEFAULT_SITUATION,
    {
      maxTotalPaid: formData.get("maxTotalPaid"),
      minTotalPaid: formData.get("minTotalPaid"),
      minDueAmount: number("minDueAmount", 1),
      installments: installments.length > 0 ? installments : [...TEMPLATE_INSTALLMENTS],
      installmentMatch: formData.get("installmentMatch"),
      lateFee: formData.get("lateFee"),
      overdue: formData.get("overdue"),
      carryForward: formData.get("carryForward"),
      promise: formData.get("promise"),
      // Present on every form since the split, and the marker that says this row
      // is a new-format one rather than a legacy five-key blob.
      quote: formData.get("quote"),
      classId: String(formData.get("classId") ?? "").trim() || null,
      includeRte: formData.get("includeRte") === "on",
    },
  );

  // Stored as ISO so Postgres can hold it as a date; the screen formats it back.
  const lastDate = isoFromDdMmYyyy(String(formData.get("lastDate") ?? ""));

  // Which late-fee mode the office was in when they saved. Without it a waiver
  // campaign saved with a custom amount replays through the cron quoting the
  // LEDGER instead — the mode never leaves the screen.
  const rawLateFeeSource = formData.get("lateFeeSource");
  const lateFeeSource = isLateFeeSource(rawLateFeeSource) ? rawLateFeeSource : null;

  let sessionLabel: string;
  try {
    sessionLabel = await resolveCurrentSessionLabel(supabase);
  } catch (caught) {
    return {
      status: "error",
      message: caught instanceof Error ? caught.message : "Could not resolve the session.",
    };
  }

  const existingId = String(formData.get("campaignId") ?? "").trim() || undefined;

  try {
    const result = await saveCampaign(
      supabase,
      {
        sessionLabel,
        name,
        situation: isNoticeSituation(rawSituation) ? rawSituation : DEFAULT_SITUATION,
        language: isNoticeLanguage(rawLanguage) ? rawLanguage : DEFAULT_LANGUAGE,
        filters,
        lastDate,
        lateFeeAmount: number("lateFeeAmount", 0),
        lateFeeBasis: (isLateFeeBasis(rawBasis) ? rawBasis : DEFAULT_LATE_FEE_BASIS) as LateFeeBasis,
        lateFeeSource,
        schedule: scheduleFromForm(formData),
      },
      (staff?.id as string | undefined) ?? null,
      existingId,
    );

    if ("duplicateName" in result) {
      return {
        status: "error",
        message: `A campaign called "${name}" already exists this session. Pick another name, or edit that one.`,
      };
    }
  } catch (caught) {
    return {
      status: "error",
      message: caught instanceof Error ? caught.message : "Could not save that campaign.",
    };
  }

  revalidatePath("/protected/reminders/campaigns");
  return { status: "success", message: existingId ? `Updated "${name}".` : `Saved "${name}".` };
}

/**
 * Archive, never delete. A campaign is referenced by its runs, and a run is the
 * record that parents were messaged — the same reason `campaign_id` is
 * `on delete set null` rather than a cascade.
 */
export async function archiveCampaignAction(
  _prev: CampaignFormState,
  formData: FormData,
): Promise<CampaignFormState> {
  await requireStaffPermission("settings:write");
  const supabase = createAdminClient();

  const id = String(formData.get("campaignId") ?? "").trim();
  if (!id) return { status: "error", message: "No campaign named." };
  const archived = formData.get("archived") === "true";

  try {
    await archiveCampaign(supabase, id, archived);
  } catch (caught) {
    return {
      status: "error",
      message: caught instanceof Error ? caught.message : "Could not archive that campaign.",
    };
  }

  revalidatePath("/protected/reminders/campaigns");
  return { status: "success", message: archived ? "Archived." : "Restored." };
}

/**
 * The schedule the form describes, or null when it is left unscheduled.
 *
 * Built and then round-tripped through `parseCampaignSchedule`, so what reaches
 * the jsonb column is exactly what the reader will accept. Writing a shape the
 * parser then rejects would leave a campaign that looks scheduled on the form
 * and is invisible to the due-today card.
 */
function scheduleFromForm(formData: FormData): Record<string, unknown> | null {
  const installment = Number(formData.get("scheduleInstallment"));
  if (!Number.isInteger(installment) || installment < 1 || installment > 4) return null;

  const offsetDays = Number(formData.get("scheduleOffsetDays"));
  const candidate = {
    installment,
    offsetDays: Number.isFinite(offsetDays) ? Math.trunc(offsetDays) : 0,
    // Only a ticked box turns it on. A campaign must never start sending itself
    // because a value was absent.
    auto: formData.get("scheduleAuto") === "on",
  };

  const parsed = parseCampaignSchedule(candidate);
  return parsed ? { ...parsed } : null;
}
