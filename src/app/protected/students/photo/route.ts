import { NextResponse } from "next/server";

import { createClient } from "@/platform/supabase/server";
import { requireStaffPermission } from "@/platform/supabase/session";

const BUCKET = "student-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 15; // 15 min — staff use, mostly inside a session.
const MISSING_PHOTO_CACHE_SECONDS = 60 * 5; // 5 min — silence repeat probes without masking a fresh upload for long.

/**
 * The list avatar renders at 32-56 CSS px. The stored photo is 600x800 and
 * about 53 KB, so serving the original to a list of 27 rows moved roughly 4 MB
 * to paint circles the size of a fingernail.
 *
 * 192px covers the largest avatar (56px) at 3x device pixel ratio with room to
 * spare, and Supabase's transformer answers it in about 3.5 KB — a 45x saving
 * per row. One size for all three avatar sizes on purpose: a shared cache key
 * means the same student in a card list and a table costs one fetch, not two.
 *
 * The viewer deliberately does NOT use this. It renders up to 420x560 CSS px,
 * which at 2x is larger than the stored image, so the original is already the
 * right answer there and a transform would only lose detail.
 */
const THUMB_PX = 192;

/**
 * A rendered thumbnail is cached hard, because the object it names can never
 * change: the upload path carries a timestamp, so a replaced photo is a
 * different path. `private` keeps it in the staff member's own browser and out
 * of any shared cache.
 */
const THUMB_CACHE_SECONDS = 60 * 60 * 24 * 7;

export async function GET(request: Request) {
  try {
    await requireStaffPermission("students:view");
  } catch {
    return NextResponse.json({ error: "permission denied" }, { status: 403 });
  }

  const url = new URL(request.url);
  const wantsThumb = url.searchParams.get("variant") === "thumb";

  const single = url.searchParams.get("path")?.trim() ?? "";
  const isSafe = (value: string) => value.length > 0 && !value.includes("..");

  if (!isSafe(single)) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  const supabase = await createClient();

  /**
   * The thumbnail is served as BYTES, not as a signed URL, and that is the
   * whole performance story for the list.
   *
   * A signed URL costs the browser two round trips per avatar — one to mint it,
   * one to fetch the image — and the minted URL expires, so nothing can cache
   * it usefully across a page load. Returning the image itself makes an avatar
   * a plain `<img src>`: one request, cached by the browser for a week, lazily
   * loaded by the platform rather than by an IntersectionObserver, and warm on
   * every later visit to the list.
   *
   * The transform is what makes that affordable. The stored photo is 600x800
   * and ~53 KB; this hands back ~3.5 KB.
   */
  if (wantsThumb) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(single, {
        transform: { width: THUMB_PX, height: THUMB_PX, resize: "cover", quality: 72 },
      });

    if (error || !data) {
      // A student with no photo is ordinary. 404 with a short cache so a list
      // of rows without photos does not re-ask on every render, and so a photo
      // uploaded a minute from now is not masked for long.
      return new NextResponse(null, {
        status: 404,
        headers: { "Cache-Control": `private, max-age=${MISSING_PHOTO_CACHE_SECONDS}` },
      });
    }

    return new NextResponse(data.stream(), {
      headers: {
        "Content-Type": data.type || "image/jpeg",
        "Cache-Control": `private, max-age=${THUMB_CACHE_SECONDS}, immutable`,
      },
    });
  }

  // Full size stays a signed URL: the viewer wants the original, and at ~53 KB
  // it is worth fetching straight from Storage rather than through this app.
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(single, SIGNED_URL_TTL_SECONDS);

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
