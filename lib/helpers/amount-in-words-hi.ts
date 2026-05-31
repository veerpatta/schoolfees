/**
 * Indian-system amount-to-words in Devanagari Hindi, for parent-facing fee
 * receipts. Mirrors the English `amountInWords` used in the receipt component
 * but in proper Hindi (e.g. 11100 → "ग्यारह हज़ार एक सौ रुपये मात्र").
 *
 * Hindi 1–99 do not compose regularly (21 is "इक्कीस", not "बीस एक"), so a full
 * lookup table is the only correct approach. Grouping is Indian
 * (करोड़ / लाख / हज़ार / सौ).
 *
 * Figures themselves stay in Latin digits on the receipt — only the words are
 * translated.
 */

// Index 0–99. WORD_0_99[0] is the empty string so callers can skip a zero group.
const WORD_0_99 = [
  "",
  "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ", "दस",
  "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस", "बीस",
  "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस", "तीस",
  "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस", "चालीस",
  "इकतालीस", "बयालीस", "तैंतालीस", "चौवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास", "पचास",
  "इक्यावन", "बावन", "तिरेपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ", "साठ",
  "इकसठ", "बासठ", "तिरेसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर", "सत्तर",
  "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उन्यासी", "अस्सी",
  "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी", "नब्बे",
  "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे",
] as const;

function inWords(value: number): string {
  if (value === 0) return "शून्य";

  const parts: string[] = [];
  let remaining = value;

  const crore = Math.floor(remaining / 10000000);
  if (crore > 0) {
    // Crores can exceed 99, so recurse to keep very large figures honest.
    parts.push(`${inWords(crore)} करोड़`);
    remaining %= 10000000;
  }

  const lakh = Math.floor(remaining / 100000);
  if (lakh > 0) {
    parts.push(`${WORD_0_99[lakh]} लाख`);
    remaining %= 100000;
  }

  const thousand = Math.floor(remaining / 1000);
  if (thousand > 0) {
    parts.push(`${WORD_0_99[thousand]} हज़ार`);
    remaining %= 1000;
  }

  const hundred = Math.floor(remaining / 100);
  if (hundred > 0) {
    parts.push(`${WORD_0_99[hundred]} सौ`);
    remaining %= 100;
  }

  if (remaining > 0) {
    parts.push(WORD_0_99[remaining]);
  }

  return parts.join(" ");
}

/**
 * Returns the Devanagari Hindi words for a rupee amount, suffixed with
 * "रुपये मात्र" (… Rupees Only). Negative/fractional inputs are clamped and
 * rounded to whole rupees, matching the English helper.
 */
export function amountInWordsHindi(value: number): string {
  const amount = Math.max(Math.round(value || 0), 0);
  if (amount === 0) return "शून्य रुपये मात्र";
  return `${inWords(amount)} रुपये मात्र`;
}
