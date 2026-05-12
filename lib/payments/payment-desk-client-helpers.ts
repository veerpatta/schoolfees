"use client";

export function sanitizeDecimalInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  const decimal = decimalParts.join("").slice(0, 2);

  return decimalParts.length > 0 ? `${whole}.${decimal}` : whole;
}

export function sanitizeWholeInput(value: string) {
  return value.replace(/\D/g, "");
}

