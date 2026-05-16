import "server-only";

import { createClient } from "@/lib/supabase/server";

export type OfficeSyncEventEntity =
  | "student"
  | "fee_setup"
  | "payment"
  | "import"
  | "session"
  | "master_data";

export type PublishOfficeSyncEventPayload = {
  sessionLabel: string;
  entityType: OfficeSyncEventEntity;
  entityId?: string | null;
  action: string;
  affectedStudentIds?: readonly string[];
  metadata?: Record<string, unknown>;
};

export async function publishOfficeSyncEvent(payload: PublishOfficeSyncEventPayload) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("office_sync_events").insert({
      session_label: payload.sessionLabel,
      entity_type: payload.entityType,
      entity_id: payload.entityId ?? null,
      action: payload.action,
      affected_student_ids: payload.affectedStudentIds ? [...payload.affectedStudentIds] : [],
      metadata: payload.metadata ?? {},
    });

    if (error) {
      console.warn(`Unable to publish office sync event: ${error.message}`);
    }
  } catch (error) {
    console.warn("Unable to publish office sync event.", error);
  }
}
