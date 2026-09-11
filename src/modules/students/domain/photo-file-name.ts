/**
 * The name a downloaded student photograph lands under.
 *
 * `2166-SADHANA-KANWAR-CHUNDAWAT.jpg`
 *
 * The SR number leads on purpose. `full_name` is free text and may hold
 * Devanagari, and the ASCII half of a Content-Disposition header folds that
 * away to nothing — so the identifier that always survives the fold is the one
 * that goes first. A folder of these sorts by SR, which is how the office
 * already thinks about students.
 */

/**
 * 100 characters keeps the whole name inside every filesystem's 255-BYTE cap
 * even at 3 bytes per Devanagari character, with room for the extension.
 */
const MAX_BASE_LENGTH = 100;

export function studentPhotoFileName(input: {
  admissionNo: string | null;
  fullName: string;
  photoPath: string;
}): string {
  // Derived, not assumed. Everything stored today is JPEG — the browser
  // uploader canvas-encodes it and scripts/import-student-photos.mjs writes
  // .jpg — but a name that lies about its own format is worse than one regex.
  const matched = /\.(jpe?g|png|webp)$/i.exec(input.photoPath)?.[1]?.toLowerCase();
  const extension = !matched || matched === "jpeg" ? "jpg" : matched;

  const sr = (input.admissionNo ?? "").trim().replace(/\s+/g, "-");
  const name = input.fullName.trim().toUpperCase().replace(/\s+/g, "-");
  const base = [sr, name].filter(Boolean).join("-").slice(0, MAX_BASE_LENGTH);

  return `${base || "student-photo"}.${extension}`;
}
