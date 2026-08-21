export function normalizePaymentDeskQuery(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function looksLikeReceiptQuery(value: string) {
  const normalized = normalizePaymentDeskQuery(value);
  return /^svp/i.test(normalized) || /\d{4,}/.test(normalized);
}
