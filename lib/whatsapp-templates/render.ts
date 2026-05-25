/**
 * Renders a WhatsApp template body by substituting `{{token}}` placeholders.
 *
 * Unknown tokens are left in-place so the staff member sees them before
 * sending — the app never silently drops or hides data.
 */
export function renderWhatsappTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, token: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, token)) {
      const value = vars[token];
      if (value === null || value === undefined) return match;
      return String(value);
    }
    return match;
  });
}

/** Extract the set of `{{token}}` placeholders used in a body. */
export function extractPlaceholders(body: string): string[] {
  const tokens = new Set<string>();
  const pattern = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) {
    tokens.add(match[1]);
  }
  return Array.from(tokens).sort();
}

/** Build a wa.me URL with the rendered text. Phone is digits-only, no `+`. */
export function buildWaMeLink(phone: string, text: string): string {
  const cleaned = phone.replace(/[^0-9]/g, "");
  // wa.me expects the country code. Default to 91 (India) if the local
  // number has 10 digits and no country code prefix.
  const normalised = cleaned.length === 10 ? `91${cleaned}` : cleaned;
  return `https://wa.me/${normalised}?text=${encodeURIComponent(text)}`;
}
