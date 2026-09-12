"use server";

import { revalidatePath } from "next/cache";

import {
  saveWhatsappSettings,
  type WhatsappSettingsInput,
} from "@/modules/whatsapp/data/whatsapp-settings";
import { createAdminClient } from "@/platform/supabase/admin";
import { requireStaffPermission } from "@/platform/supabase/session";

export type WhatsappSettingsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

/** Hours are IST clock hours, so 0-23 and nothing else. */
function parseHour(value: FormDataEntryValue | null, label: string): number {
  const parsed = Number((value ?? "").toString().trim());
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    throw new Error(`${label} must be a whole hour between 0 and 23.`);
  }
  return parsed;
}

function parseCap(value: FormDataEntryValue | null, label: string): number {
  const parsed = Number((value ?? "").toString().trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a whole number of messages, at least 1.`);
  }
  return parsed;
}

/**
 * Save the WhatsApp knobs.
 *
 * `settings:write`, and admin-only above that: two of these decide whether the
 * school messages every paying parent automatically, and the other four decide
 * what the month costs. Neither is a thing an accountant should be able to
 * change between two payments.
 */
export async function saveWhatsappSettingsAction(
  _prevState: WhatsappSettingsActionState,
  formData: FormData,
): Promise<WhatsappSettingsActionState> {
  try {
    const staff = await requireStaffPermission("settings:write");
    if (staff.appRole !== "admin") {
      return { status: "error", message: "Only an admin can change these." };
    }
  } catch {
    return { status: "error", message: "You do not have permission to change these." };
  }

  let settings: WhatsappSettingsInput;
  try {
    const quietHoursStart = parseHour(formData.get("quietHoursStart"), "Quiet hours start");
    const quietHoursEnd = parseHour(formData.get("quietHoursEnd"), "Quiet hours end");
    if (quietHoursEnd <= quietHoursStart) {
      // Not a wrap-around window: the guard compares the current hour against
      // the pair directly, so an end before a start would silence every hour of
      // the day rather than opening one overnight.
      throw new Error("Quiet hours must end later in the day than they start.");
    }

    settings = {
      receiptNoticeEnabled: formData.get("receiptNoticeEnabled") === "on",
      reversalNoticeEnabled: formData.get("reversalNoticeEnabled") === "on",
      quietHoursStart,
      quietHoursEnd,
      runMessageCap: parseCap(formData.get("runMessageCap"), "The per-run cap"),
      monthMessageCap: parseCap(formData.get("monthMessageCap"), "The monthly cap"),
      oneMessagePerFamily: formData.get("oneMessagePerFamily") === "on",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Those values could not be read.",
    };
  }

  // `app_settings` is written under the service role: it carries no per-staff
  // policy, and the RBAC decision was made above rather than in RLS.
  const result = await saveWhatsappSettings({
    supabase: createAdminClient(),
    settings,
  });

  if (!result.ok) {
    return { status: "error", message: `Could not save: ${result.error}` };
  }

  revalidatePath("/protected/admin-tools/whatsapp");
  return { status: "success", message: "Saved." };
}
