/**
 * Indian-system amount-to-words in English, for parent-facing fee documents.
 * The Devanagari counterpart is `amountInWordsHindi` in ./amount-in-words-hi.
 *
 * This existed three times before this file did — once in the phone receipt and
 * twice, byte-identical, in the two A4 receipt documents — in two renderings
 * that a reader would not guess were the same code:
 *
 *   sentence: "Rupees eleven thousand one hundred twenty-one only"
 *   title:    "Eleven Thousand One Hundred Twenty One Rupees Only"
 *
 * Both are preserved exactly, because a receipt already in a parent's hand and
 * a statement printed tomorrow have to agree. Casing and the tens–ones joiner
 * (hyphen vs space) are the only differences, so `style` drives both.
 *
 * Grouping is Indian (crore / lakh / thousand) in either style. Figures
 * themselves stay in Latin digits — only the words differ.
 */

export type AmountWordsStyle = "sentence" | "title";

const ONES_SENTENCE = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS_SENTENCE = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

const ONES_TITLE = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS_TITLE = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

/**
 * 1–999 in the chosen style. Sentence style hyphenates compound tens
 * ("twenty-one"); title style spaces them ("Twenty One"). Both are load-bearing
 * — they are what is already printed on receipts in circulation.
 */
function underThousand(value: number, style: AmountWordsStyle): string {
  if (value <= 0) return "";

  const ones = style === "title" ? ONES_TITLE : ONES_SENTENCE;
  const tens = style === "title" ? TENS_TITLE : TENS_SENTENCE;
  const hundredWord = style === "title" ? "Hundred" : "hundred";
  const tensJoiner = style === "title" ? " " : "-";

  const parts: string[] = [];
  let remaining = value;

  if (remaining >= 100) {
    parts.push(`${ones[Math.floor(remaining / 100)]} ${hundredWord}`);
    remaining %= 100;
  }

  if (remaining >= 20) {
    const unit = remaining % 10;
    parts.push(`${tens[Math.floor(remaining / 10)]}${unit ? `${tensJoiner}${ones[unit]}` : ""}`);
  } else if (remaining > 0) {
    parts.push(ones[remaining]);
  }

  return parts.join(" ");
}

/**
 * The words alone, with no currency noun or suffix — callers append their own,
 * because the receipt documents take theirs from the i18n dictionary.
 *
 * Returns an empty string for zero (and for anything that rounds to zero), so
 * every caller states its own zero wording rather than inheriting one.
 * Negative input is clamped to zero; fractions round to whole rupees.
 */
export function englishAmountWords(
  value: number,
  options: { style?: AmountWordsStyle } = {},
): string {
  const style = options.style ?? "sentence";
  const amount = Math.max(Math.round(value || 0), 0);
  if (amount === 0) return "";

  const groups: Array<[number, string]> = [
    [10_000_000, style === "title" ? "Crore" : "crore"],
    [100_000, style === "title" ? "Lakh" : "lakh"],
    [1_000, style === "title" ? "Thousand" : "thousand"],
    [1, ""],
  ];

  const parts: string[] = [];
  let remaining = amount;

  for (const [size, label] of groups) {
    const groupValue = Math.floor(remaining / size);
    if (groupValue > 0) {
      parts.push(`${underThousand(groupValue, style)}${label ? ` ${label}` : ""}`);
      remaining %= size;
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * "Rupees eleven thousand one hundred twenty-one only" — the phone receipt's
 * wording. Takes the absolute value, matching the slip it replaced.
 */
export function amountInWordsEnglish(value: number): string {
  const words = englishAmountWords(Math.abs(value || 0), { style: "sentence" });
  return words ? `Rupees ${words} only` : "Rupees zero only";
}

/**
 * "Eleven Thousand One Hundred Twenty One Rupees Only" — the wording the A4
 * receipt documents compose from the i18n dictionary, spelled out here for
 * documents that are English-only (the fee statement's footer).
 */
export function amountInWordsEnglishFormal(value: number): string {
  const words = englishAmountWords(value, { style: "title" });
  return words ? `${words} Rupees Only` : "Zero Rupees Only";
}
