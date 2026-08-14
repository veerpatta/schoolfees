/**
 * A readable name for a staff member we only know by their sign-in email.
 *
 * `receipts.received_by` is free text holding whatever the Payment Desk was
 * given — in practice the poster's email, and "Office desk" where there was no
 * signed-in staff member. There is no join back to a staff row, so a receipt
 * list has an email and nothing else.
 *
 * These are DISPLAY transforms only. Anything that filters or groups must key
 * off the raw string: two people can render as "Rajesh" and they are not the
 * same person.
 */

function titleCase(part: string): string {
  return part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part;
}

/** Splits an email local part into name-ish words. Non-emails pass through. */
function nameParts(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (!trimmed.includes("@")) return trimmed.split(/\s+/).filter(Boolean);
  const local = trimmed.split("@")[0] ?? "";
  return local.split(/[._-]+/).filter(Boolean);
}

export function staffDisplayName(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  // Already a name, not an address — leave it exactly as the desk recorded it.
  if (!value.includes("@")) return value;
  const parts = nameParts(value);
  if (parts.length === 0) return value;
  return parts.map(titleCase).join(" ");
}

export function staffInitials(raw: string | null | undefined, fallback = "VP"): string {
  const parts = nameParts(raw ?? "");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return fallback;
}
