"use client";

export function sanitizeDecimalInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  const decimal = decimalParts.join("").slice(0, 2);

  return decimalParts.length > 0 ? `${whole}.${decimal}` : whole;
}

export function normalizeAmountInputShorthand(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([kKlL])$/);

  if (!match) {
    return trimmed;
  }

  const amount = Number(match[1]);

  if (!Number.isFinite(amount)) {
    return trimmed;
  }

  const multiplier = match[2].toLowerCase() === "k" ? 1000 : 100000;
  return String(Math.round(amount * multiplier));
}

export function sanitizeWholeInput(value: string) {
  return value.replace(/\D/g, "");
}

