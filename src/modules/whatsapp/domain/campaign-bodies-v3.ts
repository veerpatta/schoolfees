import {
  LATE_FEE_APPLIED_SKELETON,
  lateFeeAppliedParams,
  promiseLapsedParams,
  SLOT_SKELETON,
  upcomingParams,
  APPROVED_CAMPAIGNS,
  type CampaignDescriptor,
  type NoticeLanguage,
  type NoticeSituation,
  type NoticeValues,
} from "@/modules/whatsapp/domain/campaigns";

/**
 * The eight `_v3` notices: their approved-shape bodies and their descriptors.
 *
 * Split out of `campaigns.ts` for one reason, and it is a measured one. That
 * module is client-reachable — the send screen previews the message live as
 * staff type — but a preview is only ever rendered for a campaign `campaignFor`
 * handed back, and `campaignFor` returns approved campaigns only. Eight
 * unapproved bodies in Hindi and English are therefore ~2.4 KB gzip of provably
 * unreachable text on every load of `/protected/reminders`, against a ceiling in
 * `quality/route-bundle-baseline.json` that only ratchets down.
 *
 * Nothing in `src/app` or `src/modules/**\/ui` may import this file. Tests do,
 * and so may a server-side preview once these are approved — at which point the
 * descriptor moves back into `campaigns.ts` alongside the other approved six and
 * this file shrinks by two.
 *
 * `buildParams` and `renderPreview` still sit on ONE descriptor, which is the
 * invariant that matters: the preview a member of staff reads and the message a
 * parent receives cannot quote different values.
 *
 * Bodies are copied from `docs/modules/whatsapp-campaign-registry.md`, which is
 * the ground truth submitted to Meta.
 */

const UPI = "upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank";

/* Written here and into docs/modules/whatsapp-campaign-registry.md together.
   None of these is approved yet — the descriptors below carry `approved: false`
   and `campaignFor` refuses them, so a body change here is free until Meta says
   otherwise. Strictly UTILITY: every line states a fact about this family's
   account or what to do about it. Nothing is offered, discounted or sold. */

function upcomingBodyEn(v: NoticeValues): string {
  const [p, s, c, phrase, amount, date, fee] = upcomingParams(v, "en");
  return [
    "*Fee Reminder — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Installment: ${phrase}`,
    `Amount due: Rs. ${amount}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Last date: ${date}`,
    `Late fee after the last date: ${fee}`,
    "",
    "The installment above falls due shortly. Paying on or before the last date avoids the late fee.",
    "",
    "Pay at the school fee counter or using this UPI link:",
    UPI,
    "",
    "Please write the student's name with the payment and collect a receipt. If you have already paid, kindly ignore this message.",
    "",
    "For any query, call the office on 9352205884.",
  ].join("\n");
}

function upcomingBodyHi(v: NoticeValues): string {
  const [p, s, c, phrase, amount, date, fee] = upcomingParams(v, "hi");
  return [
    "*फीस स्मरण — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `किश्त: ${phrase}`,
    `देय राशि: रु. ${amount}`,
    `अंतिम तिथि: ${date}`,
    `अंतिम तिथि के बाद विलंब शुल्क: ${fee}`,
    "",
    "उपरोक्त किश्त शीघ्र ही देय है। अंतिम तिथि तक फीस जमा करने पर कोई विलंब शुल्क नहीं लगेगा।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से जमा करें:",
    UPI,
    "",
    "भुगतान करते समय विद्यार्थी का नाम अवश्य लिखें तथा रसीद प्राप्त करें। यदि भुगतान हो चुका है तो इस संदेश को अनदेखा करें।",
    "",
    "जानकारी हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

/**
 * The firm one. Same seven slots, and the only difference a parent sees is that
 * the late fee is described as starting on a specific day rather than as a
 * consequence in general.
 *
 * Meta rejects a body that near-duplicates an approved one, so this is worded
 * differently throughout rather than being the courtesy body with one line
 * changed.
 */
function upcomingFinalBodyEn(v: NoticeValues): string {
  const [p, s, c, phrase, amount, date, fee] = upcomingParams(v, "en");
  return [
    "*Final Fee Reminder — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Installment: ${phrase}`,
    `Amount payable: Rs. ${amount}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Last date: ${date}`,
    `Late fee from the day after: ${fee}`,
    "",
    "Only a few days remain. From the day after the last date shown above, the late fee is added to this account.",
    "",
    "Settle at the school fee counter or using this UPI link:",
    UPI,
    "",
    "Kindly mention the student's name with the payment and take a receipt. Ignore this message if the amount has already been paid.",
    "",
    "To confirm your record, call the office on 9352205884.",
  ].join("\n");
}

function upcomingFinalBodyHi(v: NoticeValues): string {
  const [p, s, c, phrase, amount, date, fee] = upcomingParams(v, "hi");
  return [
    "*अंतिम फीस स्मरण — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `किश्त: ${phrase}`,
    `देय राशि: रु. ${amount}`,
    `अंतिम तिथि: ${date}`,
    `अगले दिन से विलंब शुल्क: ${fee}`,
    "",
    "अब कुछ ही दिन शेष हैं। उपरोक्त अंतिम तिथि के अगले दिन से इस खाते में विलंब शुल्क जोड़ दिया जाएगा।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से निपटान करें:",
    UPI,
    "",
    "भुगतान के साथ विद्यार्थी का नाम अवश्य लिखें तथा रसीद लें। राशि जमा हो चुकी हो तो इस संदेश को अनदेखा करें।",
    "",
    "अपना रिकॉर्ड जांचने हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

/**
 * Three figures on three lines, never added up for the parent except in the
 * total slot the ledger itself provides.
 *
 * The late fee has its own line because the school's own rule is that a late fee
 * is not a fee: it does not make a family a defaulter and it is not part of
 * `pending_amount`. A message that blurred them would be the first place that
 * rule broke.
 */
function lateFeeAppliedBodyEn(v: NoticeValues): string {
  const [p, s, c, phrase, fees, lateFeeAmount, total] = lateFeeAppliedParams(v);
  return [
    "*Late Fee Applied — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Installment: ${phrase}`,
    `Fees pending: Rs. ${fees}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Late fee applied: Rs. ${lateFeeAmount}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Total to pay: Rs. ${total}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    "",
    "The last date for the installment above has passed, and the late fee shown is now on this account. Please clear the total at the earliest.",
    "",
    "Pay at the school fee counter or using this UPI link:",
    UPI,
    "",
    "Please write the student's name with the payment and collect a receipt. If you have already paid, kindly ignore this message.",
    "",
    "For any query, call the office on 9352205884.",
  ].join("\n");
}

function lateFeeAppliedBodyHi(v: NoticeValues): string {
  const [p, s, c, phrase, fees, lateFeeAmount, total] = lateFeeAppliedParams(v);
  return [
    "*विलंब शुल्क लागू — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `किश्त: ${phrase}`,
    `शेष फीस: रु. ${fees}`,
    `लागू विलंब शुल्क: रु. ${lateFeeAmount}`,
    `कुल देय: रु. ${total}`,
    "",
    "उपरोक्त किश्त की अंतिम तिथि निकल चुकी है तथा दर्शाया गया विलंब शुल्क इस खाते में जुड़ चुका है। कृपया कुल राशि शीघ्र जमा करें।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से जमा करें:",
    UPI,
    "",
    "भुगतान करते समय विद्यार्थी का नाम अवश्य लिखें तथा रसीद प्राप्त करें। यदि भुगतान हो चुका है तो इस संदेश को अनदेखा करें।",
    "",
    "जानकारी हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

/**
 * Reads back the date the family themselves gave.
 *
 * That is the whole force of this notice, and also why it must never go to
 * somebody who did not make the promise: `promise_lapsed` is the only notice
 * whose audience comes from `defaulter_contacts` rather than the ledger alone.
 */
function promiseLapsedBodyEn(v: NoticeValues): string {
  const [p, s, c, promised, amount, date, fee] = promiseLapsedParams(v, "en");
  return [
    "*Fee Payment Follow-up — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Date given: ${promised}`,
    `Amount pending: Rs. ${amount}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `New date: ${date}`,
    `Late fee after the new date: ${fee}`,
    "",
    "Our record shows this payment was expected by the date given above and has not reached us. Kindly pay by the new date shown.",
    "",
    "Pay at the school fee counter or using this UPI link:",
    UPI,
    "",
    "If the amount has already been paid, please ignore this message and call the office so the record can be corrected.",
    "",
    "For any query, call the office on 9352205884.",
  ].join("\n");
}

function promiseLapsedBodyHi(v: NoticeValues): string {
  const [p, s, c, promised, amount, date, fee] = promiseLapsedParams(v, "hi");
  return [
    "*फीस भुगतान अनुवर्ती सूचना — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `दी गई तिथि: ${promised}`,
    `शेष राशि: रु. ${amount}`,
    `नई तिथि: ${date}`,
    `नई तिथि के बाद विलंब शुल्क: ${fee}`,
    "",
    "हमारे रिकॉर्ड के अनुसार यह भुगतान उपरोक्त दी गई तिथि तक अपेक्षित था और अब तक प्राप्त नहीं हुआ है। कृपया दर्शाई गई नई तिथि तक जमा करें।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से जमा करें:",
    UPI,
    "",
    "यदि राशि जमा हो चुकी है तो इस संदेश को अनदेखा करें तथा रिकॉर्ड सुधार हेतु कार्यालय को सूचित करें।",
    "",
    "जानकारी हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

/* ------------------------------------------------------------------ samples */

/** Exactly as they will be submitted to Meta, so every slot is exercised. */
const SAMPLES: Record<string, Record<NoticeLanguage, NoticeValues>> = {
  upcoming: {
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      installmentPhrase: "Installment 3",
      amountDue: 9125,
      lastDate: "20-10-2026",
      lateFeePhrase: "Rs. 1,000 per installment", // @allow-raw-money-format: the literal sample submitted to Meta
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      installmentPhrase: "किश्त 3",
      amountDue: 9125,
      lastDate: "20-10-2026",
      lateFeePhrase: "रु. 1,000 प्रति किश्त",
    },
  },
  upcoming_final: {
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      installmentPhrase: "Installment 3",
      amountDue: 9125,
      lastDate: "20-10-2026",
      lateFeePhrase: "Rs. 1,000 per installment", // @allow-raw-money-format: the literal sample submitted to Meta
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      installmentPhrase: "किश्त 3",
      amountDue: 9125,
      lastDate: "20-10-2026",
      lateFeePhrase: "रु. 1,000 प्रति किश्त",
    },
  },
  late_fee_applied: {
    // The three figures are a real shape from the ledger: fees, the flat ₹1,000
    // the policy charges once a date passes, and their sum. A sample where the
    // total did not add up would be the first thing a reviewer at Meta noticed.
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      installmentPhrase: "Installment 2",
      amountDue: 9125,
      lateFeeApplied: 1000,
      totalToPay: 10125,
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      installmentPhrase: "किश्त 2",
      amountDue: 9125,
      lateFeeApplied: 1000,
      totalToPay: 10125,
    },
  },
  promise_lapsed: {
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      promisedDate: "28-08-2026",
      amountDue: 9125,
      lastDate: "10-09-2026",
      lateFeePhrase: "Rs. 1,000 per installment", // @allow-raw-money-format: the literal sample submitted to Meta
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      promisedDate: "28-08-2026",
      amountDue: 9125,
      lastDate: "10-09-2026",
      lateFeePhrase: "रु. 1,000 प्रति किश्त",
    },
  },
};

/* -------------------------------------------------------------- descriptors */

/** The eight, every one of them `approved: false`. */
export const V3_CAMPAIGNS: readonly CampaignDescriptor[] = [
  /* Bodies are written and reviewable in
     docs/modules/whatsapp-campaign-registry.md. `approved: false` until an admin
     flips them on from /protected/admin-tools/whatsapp-templates, having seen
     the template Live in AiSensy. Until then the picker shows the chip disabled
     and `campaignFor` refuses — a send would return `400 Campaign does not
     exist.`, which costs nothing but explains nothing either. */
  {
    situation: "upcoming",
    language: "hi",
    campaignName: "vpps_app_upcoming_hi_v3",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => upcomingParams(v, "hi"),
    renderPreview: upcomingBodyHi,
    sample: SAMPLES.upcoming.hi,
    approved: false,
  },
  {
    situation: "upcoming",
    language: "en",
    campaignName: "vpps_app_upcoming_en_v3",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => upcomingParams(v, "en"),
    renderPreview: upcomingBodyEn,
    sample: SAMPLES.upcoming.en,
    approved: false,
  },
  {
    situation: "upcoming_final",
    language: "hi",
    campaignName: "vpps_app_upcoming_final_hi_v3",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => upcomingParams(v, "hi"),
    renderPreview: upcomingFinalBodyHi,
    sample: SAMPLES.upcoming_final.hi,
    approved: false,
  },
  {
    situation: "upcoming_final",
    language: "en",
    campaignName: "vpps_app_upcoming_final_en_v3",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => upcomingParams(v, "en"),
    renderPreview: upcomingFinalBodyEn,
    sample: SAMPLES.upcoming_final.en,
    approved: false,
  },
  {
    situation: "late_fee_applied",
    language: "hi",
    campaignName: "vpps_app_late_fee_applied_hi_v3",
    slotOrder: LATE_FEE_APPLIED_SKELETON,
    buildParams: lateFeeAppliedParams,
    renderPreview: lateFeeAppliedBodyHi,
    sample: SAMPLES.late_fee_applied.hi,
    approved: false,
  },
  {
    situation: "late_fee_applied",
    language: "en",
    campaignName: "vpps_app_late_fee_applied_en_v3",
    slotOrder: LATE_FEE_APPLIED_SKELETON,
    buildParams: lateFeeAppliedParams,
    renderPreview: lateFeeAppliedBodyEn,
    sample: SAMPLES.late_fee_applied.en,
    approved: false,
  },
  {
    situation: "promise_lapsed",
    language: "hi",
    campaignName: "vpps_app_promise_lapsed_hi_v3",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => promiseLapsedParams(v, "hi"),
    renderPreview: promiseLapsedBodyHi,
    sample: SAMPLES.promise_lapsed.hi,
    approved: false,
  },
  {
    situation: "promise_lapsed",
    language: "en",
    campaignName: "vpps_app_promise_lapsed_en_v3",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => promiseLapsedParams(v, "en"),
    renderPreview: promiseLapsedBodyEn,
    sample: SAMPLES.promise_lapsed.en,
    approved: false,
  },
];

/**
 * Every registered campaign, approved or not — the list the contract test walks.
 *
 * Deliberately not exported from `campaigns.ts`: assembling it there is what
 * would drag the pending bodies back into the browser.
 */
export const ALL_CAMPAIGNS: readonly CampaignDescriptor[] = [
  ...APPROVED_CAMPAIGNS,
  ...V3_CAMPAIGNS,
];

/**
 * The descriptor for a notice regardless of approval — for the contract test and
 * for a server-side preview. Never a path to sending: use `campaignFor`.
 */
export function describeCampaign(
  situation: NoticeSituation,
  language: NoticeLanguage,
): CampaignDescriptor | null {
  return (
    ALL_CAMPAIGNS.find(
      (entry) => entry.situation === situation && entry.language === language,
    ) ?? null
  );
}
