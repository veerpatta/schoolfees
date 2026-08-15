/**
 * Supabase Storage, the read half.
 *
 * supabase.mjs speaks only to `/rest/v1`; the object store lives at
 * `/storage/v1` and needs its own base. Same service-role key, which bypasses
 * storage RLS entirely — so nothing in here may ever take a caller-supplied
 * bucket or path. Every caller resolves the path from the database first, from a
 * domain id it was allowed to look up.
 */

/** Buckets this server is permitted to read. Not a parameter, on purpose. */
export const BUCKETS = {
  studentPhotos: "student-photos",
  voiceNotes: "defaulter-voice-notes",
};

function required(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing required Worker secret: ${name}`);
  return value;
}

function storageBase(env) {
  return `${required(env, "NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "")}/storage/v1`;
}

function authHeaders(env) {
  const key = required(env, "SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, authorization: `Bearer ${key}` };
}

/**
 * A time-limited URL anyone can open.
 *
 * Supabase returns `signedURL` as a path relative to /storage/v1, not an
 * absolute URL — the JS client prefixes it and raw REST callers must too.
 * Returning it unprefixed produces a plausible-looking string that 404s.
 */
export async function createSignedUrl(env, bucket, objectPath, expiresIn) {
  const response = await fetch(
    `${storageBase(env)}/object/sign/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "POST",
      headers: { ...authHeaders(env), "content-type": "application/json" },
      body: JSON.stringify({ expiresIn }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Storage sign failed for ${bucket} (${response.status}): ${text.slice(0, 200)}`);
  }

  const { signedURL } = await response.json();
  if (!signedURL) throw new Error(`Storage sign returned no URL for ${bucket}/${objectPath}`);

  return {
    url: `${storageBase(env)}${signedURL.startsWith("/") ? "" : "/"}${signedURL}`,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    expiresInSeconds: expiresIn,
  };
}

/**
 * The bytes themselves, refused above `maxBytes` rather than truncated.
 *
 * Checks content-length first so an oversized object is declined before it is
 * buffered — a 5 MB voice note should not be pulled into a Worker's memory just
 * to discover it is too big to return.
 */
export async function downloadObject(env, bucket, objectPath, { maxBytes }) {
  const url = `${storageBase(env)}/object/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, { headers: authHeaders(env) });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Storage read failed for ${bucket} (${response.status}): ${text.slice(0, 200)}`);
  }

  const declared = Number(response.headers.get("content-length") || 0);
  if (declared && declared > maxBytes) {
    return { tooLarge: true, byteLength: declared, limit: maxBytes };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    return { tooLarge: true, byteLength: bytes.byteLength, limit: maxBytes };
  }

  return {
    tooLarge: false,
    bytes,
    byteLength: bytes.byteLength,
    mimeType: response.headers.get("content-type") || "application/octet-stream",
  };
}

/**
 * Base64 for a Worker.
 *
 * `btoa(String.fromCharCode(...bytes))` blows the stack on anything sizeable —
 * apply() spreads every byte as an argument. There is no Buffer here either:
 * workerd provides one only under nodejs_compat, which this Worker does not set
 * and should not gain for four lines.
 */
export function toBase64(bytes) {
  let binary = "";
  const CHUNK = 0x8000;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}
