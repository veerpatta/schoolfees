import "server-only";

export function isFamilyPaymentsEnabled() {
  return process.env.FAMILY_PAYMENTS_ENABLED === "true";
}
