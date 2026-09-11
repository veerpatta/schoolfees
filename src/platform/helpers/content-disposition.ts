/**
 * Content-Disposition, RFC 6266, both ways.
 *
 * `filename=` is a quoted ASCII token: a quote, a backslash or a CR/LF inside
 * it is a malformed header at best and an injected one at worst — and the value
 * here is a name the office typed into a student record. `filename*=` is the
 * RFC 5987 ext-value every current browser prefers, and it is injection-proof
 * by construction because percent-encoding escapes CR and LF.
 *
 * Emitting both is not belt-and-braces. A name in Devanagari has no ASCII form,
 * so the fallback necessarily loses it; a browser that only understands the
 * fallback still gets something openable rather than a header it rejects.
 */

/**
 * Strip a name down to something safe inside double quotes.
 *
 * NFKD first so an accented Latin letter degrades to its base letter rather
 * than vanishing — "JOSÉ" becomes "JOSE", not "JOS".
 */
function asciiFallback(fileName: string): string {
  const folded = fileName
    .normalize("NFKD")
    // NFKD has already split "É" into "E" + a combining acute, and the
    // combining mark is itself non-ASCII — so this one range drops every
    // accent, every Devanagari character and every control byte at once.
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return folded || "student-photo.jpg";
}

/**
 * `encodeURIComponent` leaves ' ( ) ! * alone; the ext-value grammar does not
 * allow them, so finish the job by hand.
 */
function encodeExtValue(value: string): string {
  return encodeURIComponent(value).replace(
    /['()!*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function attachmentDisposition(fileName: string): string {
  return `attachment; filename="${asciiFallback(fileName)}"; filename*=UTF-8''${encodeExtValue(fileName)}`;
}
