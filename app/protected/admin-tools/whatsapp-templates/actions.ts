"use server";

import { revalidatePath } from "next/cache";

import { requireStaffPermission } from "@/lib/supabase/session";
import {
  createWhatsappTemplate,
  deleteWhatsappTemplate,
  updateWhatsappTemplate,
} from "@/lib/whatsapp-templates/data";
import { extractPlaceholders } from "@/lib/whatsapp-templates/render";
import type { WhatsappTemplateCategory } from "@/lib/whatsapp-templates/types";

export type TemplateActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const VALID_CATEGORIES: WhatsappTemplateCategory[] = [
  "reminder",
  "final_reminder",
  "receipt",
  "custom",
];

function parseInput(formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const body = (formData.get("body") as string | null)?.toString() ?? "";
  const category = (formData.get("category") as string | null)?.trim() ?? "";
  const isActive = formData.get("isActive") === "on";

  if (!name) return { error: "Template name is required." } as const;
  if (name.length > 80) return { error: "Template name must be 80 characters or fewer." } as const;
  if (!body.trim()) return { error: "Template body is required." } as const;
  if (body.length > 2000) return { error: "Template body is too long (max 2000 characters)." } as const;
  if (!VALID_CATEGORIES.includes(category as WhatsappTemplateCategory)) {
    return { error: "Invalid category." } as const;
  }

  return {
    name,
    body,
    category: category as WhatsappTemplateCategory,
    isActive,
    placeholders: extractPlaceholders(body),
  } as const;
}

export async function createTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  try {
    await requireStaffPermission("settings:write");
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  const parsed = parseInput(formData);
  if ("error" in parsed) return { status: "error", message: parsed.error };

  try {
    await createWhatsappTemplate(parsed);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Failed to save template.",
    };
  }

  revalidatePath("/protected/admin-tools/whatsapp-templates");
  return { status: "success", message: "Template created." };
}

export async function updateTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  try {
    await requireStaffPermission("settings:write");
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  const id = (formData.get("id") as string | null)?.trim() ?? "";
  if (!id) return { status: "error", message: "Missing template id." };

  const parsed = parseInput(formData);
  if ("error" in parsed) return { status: "error", message: parsed.error };

  try {
    await updateWhatsappTemplate(id, parsed);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Failed to save template.",
    };
  }

  revalidatePath("/protected/admin-tools/whatsapp-templates");
  return { status: "success", message: "Template updated." };
}

export async function deleteTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  try {
    await requireStaffPermission("settings:write");
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  const id = (formData.get("id") as string | null)?.trim() ?? "";
  if (!id) return { status: "error", message: "Missing template id." };

  try {
    await deleteWhatsappTemplate(id);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Failed to delete template.",
    };
  }

  revalidatePath("/protected/admin-tools/whatsapp-templates");
  return { status: "success", message: "Template deleted." };
}
