"use server";

import { revalidatePath } from "next/cache";

import { snoozeIso } from "@/lib/defaulters/cadence";
import {
  insertDefaulterContact,
  type ContactChannel,
  type ContactOutcome,
} from "@/lib/defaulters/contacts";
import { requireStaffPermission } from "@/lib/supabase/session";

export type LogContactState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const VALID_CHANNELS: ContactChannel[] = [
  "call",
  "whatsapp",
  "sms",
  "in_person",
  "email",
];
const VALID_OUTCOMES: ContactOutcome[] = [
  "reached",
  "no_answer",
  "promised_pay",
  "dispute",
  "other",
];

export async function logContactAction(
  _prevState: LogContactState,
  formData: FormData,
): Promise<LogContactState> {
  try {
    await requireStaffPermission("defaulters:view");
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  const studentId = formData.get("studentId") as string | null;
  const channel = formData.get("channel") as string | null;
  const outcome = formData.get("outcome") as string | null;
  const snoozeStr = formData.get("snoozeDays") as string | null;
  const note = (formData.get("note") as string | null)?.trim() || null;
  const sessionLabel = formData.get("sessionLabel") as string | null;
  const voiceNotePath = (formData.get("voiceNotePath") as string | null)?.trim() || null;

  if (!studentId || !channel || !outcome || !sessionLabel) {
    return { status: "error", message: "Missing required fields." };
  }
  if (!VALID_CHANNELS.includes(channel as ContactChannel)) {
    return { status: "error", message: "Invalid channel." };
  }
  if (!VALID_OUTCOMES.includes(outcome as ContactOutcome)) {
    return { status: "error", message: "Invalid outcome." };
  }

  const snoozeDays = snoozeStr ? Number(snoozeStr) : 0;
  const snoozeUntil =
    Number.isFinite(snoozeDays) && snoozeDays > 0
      ? snoozeIso(snoozeDays)
      : null;

  try {
    await insertDefaulterContact({
      studentId,
      sessionLabel,
      channel: channel as ContactChannel,
      outcome: outcome as ContactOutcome,
      snoozeUntil,
      note,
      voiceNotePath,
    });
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Unknown error.",
    };
  }

  revalidatePath("/protected/defaulters");
  return { status: "success", message: "Contact logged." };
}
