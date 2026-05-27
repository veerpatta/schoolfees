/**
 * Canonical INR formatting. Every money figure rendered to a staff or parent
 * must flow through `formatInr` (or the higher-level `<Money>` component).
 *
 * Why this file is the only place that may touch `Intl.NumberFormat("en-IN", …)`
 * or the `₹` glyph: clarity audits depend on grep-ability — if a money
 * surface bypasses this helper we cannot guarantee consistent handling of
 * null, zero, signs, paise, or symbol.
 */

const WHOLE_RUPEE_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const PAISE_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INDIAN_PLAIN_FORMATTER = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

export type FormatInrOptions = {
  /** Replacement for null / undefined / NaN. Default "—". Use "" to suppress. */
  fallback?: string;
  /** Render the leading "+" for positive non-zero values. Default false. */
  signed?: boolean;
  /** Two-decimal paise rendering. Default false (whole rupees only). */
  showPaise?: boolean;
  /** Compact rendering: ₹1.2L / ₹3.4Cr / ₹12K. Use sparingly (KPIs only). */
  compact?: boolean;
};

/**
 * Format a rupee value. Returns the fallback for null/undefined/NaN so the
 * caller never has to defend against missing data.
 */
export function formatInr(
  value: number | null | undefined,
  options: FormatInrOptions = {},
): string {
  const { fallback = "—", signed = false, showPaise = false, compact = false } = options;

  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  const absolute = Math.abs(value);
  // ASCII hyphen-minus for negatives — matches Intl en-IN currency default and
  // every existing screenshot/test in the codebase. Do not switch to the
  // typographic U+2212 without a coordinated update.
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";

  if (compact) {
    return `${sign}${formatCompactRupees(absolute)}`;
  }

  const formatter = showPaise ? PAISE_FORMATTER : WHOLE_RUPEE_FORMATTER;
  return `${sign}${formatter.format(absolute)}`;
}

/**
 * Structured rupee parts for tabular layouts that want to control glyph,
 * integer group, paise, and sign independently.
 */
export type RupeesParts = {
  sign: "" | "-" | "+";
  symbol: "₹";
  integer: string;
  paise: string | null;
  fallback: string | null;
};

export function formatRupeesParts(
  value: number | null | undefined,
  options: Pick<FormatInrOptions, "fallback" | "signed" | "showPaise"> = {},
): RupeesParts {
  const { fallback = "—", signed = false, showPaise = false } = options;

  if (value === null || value === undefined || Number.isNaN(value)) {
    return { sign: "", symbol: "₹", integer: "", paise: null, fallback };
  }

  const absolute = Math.abs(value);
  const sign: RupeesParts["sign"] = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  const integerPart = INDIAN_PLAIN_FORMATTER.format(Math.floor(absolute));

  if (!showPaise) {
    return { sign, symbol: "₹", integer: integerPart, paise: null, fallback: null };
  }

  const paise = Math.round((absolute - Math.floor(absolute)) * 100)
    .toString()
    .padStart(2, "0");
  return { sign, symbol: "₹", integer: integerPart, paise, fallback: null };
}

function formatCompactRupees(absolute: number): string {
  if (absolute >= 10000000) {
    return `₹${(absolute / 10000000).toFixed(absolute >= 100000000 ? 0 : 1)}Cr`;
  }
  if (absolute >= 100000) {
    return `₹${(absolute / 100000).toFixed(absolute >= 1000000 ? 0 : 1)}L`;
  }
  if (absolute >= 1000) {
    return `₹${(absolute / 1000).toFixed(absolute >= 10000 ? 0 : 1)}K`;
  }
  return `₹${Math.round(absolute)}`;
}
