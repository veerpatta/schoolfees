import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { WhatsappTemplate, WhatsappTemplateCategory } from "@/lib/whatsapp-templates/types";

type Row = {
  id: string;
  name: string;
  body: string;
  placeholders: string[] | null;
  category: WhatsappTemplateCategory;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): WhatsappTemplate {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    placeholders: row.placeholders ?? [],
    category: row.category,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Returns every template. Gracefully handles a missing table (42P01) so the
 * UI can render an empty state while the migration is pending.
 */
export async function listWhatsappTemplates(options: {
  onlyActive?: boolean;
} = {}): Promise<WhatsappTemplate[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("whatsapp_templates")
    .select("id, name, body, placeholders, category, is_active, created_at, updated_at");

  if (options.onlyActive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query
    .order("is_active", { ascending: false })
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`Failed to load WhatsApp templates: ${error.message}`);
  }

  return ((data ?? []) as Row[]).map(mapRow);
}

export async function getWhatsappTemplate(id: string): Promise<WhatsappTemplate | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("whatsapp_templates")
    .select("id, name, body, placeholders, category, is_active, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === "42P01") return null;
    throw new Error(`Failed to load template: ${error.message}`);
  }

  return data ? mapRow(data as Row) : null;
}

export type WhatsappTemplateInput = {
  name: string;
  body: string;
  category: WhatsappTemplateCategory;
  isActive: boolean;
  placeholders: string[];
};

export async function createWhatsappTemplate(input: WhatsappTemplateInput): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("whatsapp_templates").insert({
    name: input.name,
    body: input.body,
    category: input.category,
    is_active: input.isActive,
    placeholders: input.placeholders,
  });

  if (error) throw new Error(`Failed to create template: ${error.message}`);
}

export async function updateWhatsappTemplate(
  id: string,
  input: WhatsappTemplateInput,
): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("whatsapp_templates")
    .update({
      name: input.name,
      body: input.body,
      category: input.category,
      is_active: input.isActive,
      placeholders: input.placeholders,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`Failed to update template: ${error.message}`);
}

export async function deleteWhatsappTemplate(id: string): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("whatsapp_templates")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete template: ${error.message}`);
}
