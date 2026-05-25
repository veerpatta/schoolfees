import { NextResponse } from "next/server";

import { createVoiceNoteSignedUrl } from "@/lib/defaulters/contacts";
import { requireStaffPermission } from "@/lib/supabase/session";

/**
 * GET /protected/defaulters/voice-note?path=<storage-path>
 * Returns a short-lived signed URL for playing back a defaulter voice note.
 */
export async function GET(request: Request) {
  try {
    await requireStaffPermission("defaulters:view");
  } catch {
    return NextResponse.json({ error: "permission denied" }, { status: 403 });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path")?.trim() ?? "";
  if (!path || path.includes("..")) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  const signedUrl = await createVoiceNoteSignedUrl(path);
  if (!signedUrl) {
    return NextResponse.json({ error: "voice note not available" }, { status: 404 });
  }

  return NextResponse.json({ url: signedUrl });
}
