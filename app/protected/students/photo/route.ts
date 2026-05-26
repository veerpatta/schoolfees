import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";

const BUCKET = "student-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 15; // 15 min — staff use, mostly inside a session.
const MISSING_PHOTO_CACHE_SECONDS = 60 * 5; // 5 min — silence repeat probes without masking a fresh upload for long.

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
    // Optional student photos are normal. Return a cached null instead of 404 so
    // list/tablet renders don't flood the network panel with expected misses.
    return NextResponse.json(
      { url: null },
      {
        status: 200,
        headers: {
          "Cache-Control": `private, max-age=${MISSING_PHOTO_CACHE_SECONDS}`,
        },
      },
    );
  }

  return NextResponse.json(
    { url: data.signedUrl },
    {
      headers: {
        "Cache-Control": `private, max-age=${SIGNED_URL_TTL_SECONDS}`,
      },
    },
  );
}
