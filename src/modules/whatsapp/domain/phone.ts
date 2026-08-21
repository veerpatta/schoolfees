/**
 * Turning what the office typed into what AiSensy will accept.
 *
 * Deliberately free of `server-only`, and deliberately not in `./aisensy`: it
 * is a pure string function with no I/O and no env, and the reminders test
 * panel resolves a destination in the browser so staff can see the exact
 * `+91…` string that will be posted before they spend a message on it.
 */

/**
 * AiSensy wants a country code. Indian mobiles are stored here as ten bare
 * digits, sometimes with spaces, a leading zero, or a +91 already attached.
 *
 * Returns null for anything not recognisably an Indian mobile. That null is
 * load-bearing: every send costs money, and a message to a wrong number is a
 * stranger receiving a child's name and the family's fee balance.
 */
export function toWhatsappDestination(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return toWhatsappDestination(digits.slice(1));
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) {
    return `+${digits}`;
  }
  return null;
}
