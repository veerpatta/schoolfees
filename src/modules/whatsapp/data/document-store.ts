import "server-only";

import { createAdminClient } from "@/platform/supabase/admin";

/**
 * The private shelf a parent-facing PDF sits on between being rendered and
 * being fetched by Meta.
 *
 * WhatsApp's document header works in one step that is easy to get wrong: Meta
 * fetches the URL ONCE, at send time, with no headers and no session, and then
 * stores the file inside the chat. Two consequences drive everything here.
 *
 *   1. The URL must be reachable by an anonymous fetcher. A staff-gated route
 *      is not, which is why this bucket exists at all.
 *   2. The URL only has to survive that one fetch. An hour is generous; a
 *      permanent public link would expose a child's name, class and family
 *      balance for as long as it existed, to anyone who ever saw it.
 *
 * So: render, upload to a PRIVATE bucket, sign for an hour, send. The object
 * path is what gets written on the send row — a retry re-signs, because by then
 * the first signature is long dead.
 *
 * Every function here is best-effort in the same sense as the notices that call
 * them: they return a result rather than throwing, because none of this may
 * ever take a posting down with it.
 */

const BUCKET = "parent-documents";

/** One hour. Long enough for Meta's fetch and a retry, short enough to forget. */
const SIGNED_URL_TTL_SECONDS = 3600;

export type NoticeDocumentKind = "receipt" | "fee_statement";

export type StoredDocument = {
  /** Path inside the bucket. Written to the send row; re-signable later. */
  path: string;
  /** Signed for {@link SIGNED_URL_TTL_SECONDS}. Never persisted. */
  signedUrl: string;
};

/**
 * Where a document lives.
 *
 * Keyed on the thing the document is ABOUT — a receipt id, a student id — so a
 * second send for the same receipt overwrites rather than accumulating, and so
 * an operator reading the bucket can tell what a file is without opening it.
 * The session label leads, because a year's correspondence is the unit anyone
 * would ever want to purge.
 */
export function noticeDocumentPath(args: {
  sessionLabel: string;
  kind: NoticeDocumentKind;
  id: string;
}): string {
  const safe = (value: string) => String(value ?? "").replace(/[^A-Za-z0-9._-]/g, "_");
  return `${safe(args.sessionLabel)}/${args.kind}/${safe(args.id)}.pdf`;
}

/**
 * Put a rendered PDF on the shelf and hand back a link Meta can fetch.
 *
 * `upsert` is deliberate: the path is derived from the receipt or student, so a
 * re-send of the same document is the same document. Accumulating
 * `receipt-abc-1.pdf`, `-2`, `-3` would leave the bucket full of near-identical
 * files and no way to say which one a parent actually holds.
 */
export async function storeNoticeDocument(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  sessionLabel: string;
  kind: NoticeDocumentKind;
  id: string;
  pdf: Uint8Array;
}): Promise<StoredDocument | null> {
  // Storage writes and signatures always run under the service role. The
  // bucket carries no staff policy at all (see 20260912190000), so a cookie
  // client would be refused — and SHOULD be: nothing in a browser may reach
  // the school's parent correspondence.
  const supabase = args.supabase ?? createAdminClient();
  const path = noticeDocumentPath(args);

  try {
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, args.pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (uploadError) {
      console.warn("[whatsapp-documents] upload failed", path, uploadError.message);
      return null;
    }

    const signedUrl = await signDocumentUrl({ supabase, path });
    if (!signedUrl) return null;

    return { path, signedUrl };
  } catch (caught) {
    console.warn("[whatsapp-documents] upload threw", path, caught);
    return null;
  }
}

/**
 * Mint a fresh signature for an object already on the shelf.
 *
 * This is the retry lane's half of the contract. A failed send row carries the
 * PATH; the signature it was sent with expired an hour after the first attempt.
 * Re-signing is what makes a retry deliver a document that opens rather than
 * one that 400s in the parent's hand.
 *
 * Returns null when the object is gone, which the caller must treat as "cannot
 * retry with a document" rather than "send without one" — a document template
 * sent with no media is rejected by AiSensy outright.
 */
export async function signDocumentUrl(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  path: string;
}): Promise<string | null> {
  const supabase = args.supabase ?? createAdminClient();
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(args.path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      console.warn("[whatsapp-documents] could not sign", args.path, error?.message);
      return null;
    }
    return data.signedUrl as string;
  } catch (caught) {
    console.warn("[whatsapp-documents] signing threw", args.path, caught);
    return null;
  }
}

/**
 * What the parent sees as the file name in WhatsApp.
 *
 * Never an admission number and never an internal id. A parent's phone shows
 * this in the chat list and in their downloads; it should read like something
 * the school handed them across the counter.
 */
export function parentFacingFilename(args: {
  kind: NoticeDocumentKind;
  studentName: string;
  receiptNumber?: string;
}): string {
  const name = String(args.studentName ?? "")
    .trim()
    .replace(/[^A-Za-z0-9ऀ-ॿ ]/g, "")
    .replace(/\s+/g, "-");
  if (args.kind === "receipt") {
    const receipt = String(args.receiptNumber ?? "").replace(/[^A-Za-z0-9-]/g, "");
    return `Receipt-${receipt || "VPPS"}${name ? `-${name}` : ""}.pdf`;
  }
  return `Fee-Statement${name ? `-${name}` : ""}.pdf`;
}
