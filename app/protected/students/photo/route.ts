import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";

const BUCKET = "student-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 15; // 15 min — staff use, mostly inside a session.

export async function GET(request: Request) {
  try {
    await requireStaffPermission("students:view");
  } catch {
    return NextResponse.json({ error: "permission denied" }, { status: 403 });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path")?.trim() ?? "";
  if (!path || path.includes("..")) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "photo not available" }, { status: 404 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
