import {
  describeCampaign,
  type NoticeLanguage,
  type NoticeSituation,
  type NoticeValues,
} from "@/modules/whatsapp/domain/campaigns";

/**
 * The per-student template bodies — every one of them, approved or pending.
 *
 * Moved out of `campaigns.ts` on 2026-09-08, and for a measured reason. That
 * module is client-reachable: the notice picker, the test panel and the
 * workspace all import it for names, slot orders and samples. But nothing in
 * the browser needs the BODIES any more. The send screen's preview has been
 * server-rendered since 2026-09-03, and the test panel now asks a server action
 * for its preview rather than rendering one as staff type. So fourteen bodies
 * in Hindi and English were ~3 KB gzip of unreachable text on every load of
 * `/protected/reminders`, against a ceiling in
 * `quality/route-bundle-baseline.json` that only ratchets down — and ten more
 * were about to join them.
 *
 * Nothing in `src/app` or `src/modules/**\/ui` may import this file;
 * `tests/ui/whatsapp-reminders-screen.test.ts` enforces it, exactly as it does
 * for `campaign-bodies-v3.ts`. Server actions, `data/` and tests may.
 *
 * Each body takes the PARAMS the campaign's `buildParams` produced, in slot
 * order, rather than the named values. That is the invariant that matters:
 * what the office reads in a preview is rendered from the very array that is
 * posted to AiSensy, so the two cannot quote different values.
 *
 * Copied verbatim from `docs/modules/whatsapp-campaign-registry.md`. WhatsApp
 * sends what Meta approved, not this text — a preview that does not match is
 * worse than no preview, because staff trust it.
 */

const UPI = "upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank";

type Body = (params: readonly string[]) => string;

/* ------------------------------------------------------------ v2, 22 Aug 2026 */

const feeDueEn: Body = ([p, s, c, phrase, amount, date, fee]) =>
  [
    "*Fee Notice — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Installment: ${phrase}`,
    `Amount due: Rs. ${amount}`, // @allow-raw-money-format: verbatim from the Meta-approved English body
    `Last date: ${date}`,
    `Late fee after the last date: ${fee}`,
    "",
    "Paying on or before the last date avoids the late fee. After that date the late fee above is added to the amount.",
    "",
    "Pay at the school fee counter or using this UPI link:",
    UPI,
    "",
    "Please write the student's name with the payment and collect a receipt. If you have already paid, kindly ignore this message.",
    "",
    "For any query, call the office on 9352205884.",
  ].join("\n");

const feeDueHi: Body = ([p, s, c, phrase, amount, date, fee]) =>
  [
    "*फीस सूचना — श्री वीर पत्ता सी. सै. स्कूल*",
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
    "अंतिम तिथि तक फीस जमा करने पर कोई विलंब शुल्क नहीं लगेगा। उसके बाद उपरोक्त दर से विलंब शुल्क जोड़ा जाएगा।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से जमा करें:",
    UPI,
    "",
    "भुगतान करते समय विद्यार्थी का नाम अवश्य लिखें तथा रसीद प्राप्त करें। यदि भुगतान हो चुका है तो इस संदेश को अनदेखा करें।",
    "",
    "जानकारी हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");

const balanceEn: Body = ([p, s, c, received, balance, date, fee]) =>
  [
    "*Fee Balance — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Received so far: Rs. ${received}`, // @allow-raw-money-format: verbatim from the Meta-approved English body
    `Balance due: Rs. ${balance}`, // @allow-raw-money-format: verbatim from the Meta-approved English body
    `Next date: ${date}`,
    `Late fee after the next date: ${fee}`,
    "",
    "Thank you for the payment received. Clearing the balance by the next date avoids the late fee.",
    "",
    "Pay at the fee counter or using this UPI link:",
    UPI,
    "",
    "If this differs from your own record, please call the office on 9352205884.",
  ].join("\n");

const balanceHi: Body = ([p, s, c, received, balance, date, fee]) =>
  [
    "*फीस शेष विवरण — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `अब तक प्राप्त: रु. ${received}`,
    `शेष बकाया: रु. ${balance}`,
    `अगली तिथि: ${date}`,
    `अगली तिथि के बाद विलंब शुल्क: ${fee}`,
    "",
    "प्राप्त भुगतान के लिए धन्यवाद। शेष राशि अगली तिथि तक जमा करने पर कोई विलंब शुल्क नहीं लगेगा।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से जमा करें:",
    UPI,
    "",
    "यदि यह विवरण आपके रिकॉर्ड से भिन्न है तो कृपया कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");

const prevYearEn: Body = ([p, s, c, session, balance, date, fee]) =>
  [
    "*Previous Session Balance — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Session: ${session}`,
    `Balance: Rs. ${balance}`, // @allow-raw-money-format: verbatim from the Meta-approved English body
    `Settle by: ${date}`,
    // A bare "Late fee:" on purpose, so the line reads correctly whether the
    // value is an amount or "not applicable".
    `Late fee: ${fee}`,
    "",
    "This amount is from the previous session and is separate from this year's installments. Please settle it by the date above.",
    "",
    "Visit the fee counter or use this UPI link:",
    UPI,
    "",
    "For a full statement, call the office on 9352205884.",
  ].join("\n");

const prevYearHi: Body = ([p, s, c, session, balance, date, fee]) =>
  [
    "*पिछले सत्र का शेष — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `सत्र: ${session}`,
    `शेष राशि: रु. ${balance}`,
    `निपटान की अंतिम तिथि: ${date}`,
    `विलंब शुल्क: ${fee}`,
    "",
    "यह राशि पिछले सत्र की है और इस वर्ष की किश्तों से अलग है। कृपया उपरोक्त तिथि तक निपटान कर दें।",
    "",
    "फीस काउंटर पर आएं अथवा इस UPI लिंक का उपयोग करें:",
    UPI,
    "",
    "पूरा विवरण देखने हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");

/* ---------------------------------------------------------- v3, 2026-09-04 */

const upcomingEn: Body = ([p, s, c, phrase, amount, date, fee]) =>
  [
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

const upcomingHi: Body = ([p, s, c, phrase, amount, date, fee]) =>
  [
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

/**
 * The firm one. Same seven slots, and the only difference a parent sees is that
 * the late fee is described as starting on a specific day rather than as a
 * consequence in general. Meta rejects a body that near-duplicates an approved
 * one, so it is worded differently throughout.
 */
const upcomingFinalEn: Body = ([p, s, c, phrase, amount, date, fee]) =>
  [
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

const upcomingFinalHi: Body = ([p, s, c, phrase, amount, date, fee]) =>
  [
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

/**
 * Three figures on three lines, never added up for the parent except in the
 * total slot the ledger itself provides. A late fee is not a fee: it does not
 * make a family a defaulter and it is not part of `pending_amount`.
 */
const lateFeeAppliedEn: Body = ([p, s, c, phrase, fees, lateFee, total]) =>
  [
    "*Late Fee Applied — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Installment: ${phrase}`,
    `Fees pending: Rs. ${fees}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Late fee applied: Rs. ${lateFee}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
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

const lateFeeAppliedHi: Body = ([p, s, c, phrase, fees, lateFee, total]) =>
  [
    "*विलंब शुल्क लागू — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `किश्त: ${phrase}`,
    `शेष फीस: रु. ${fees}`,
    `लागू विलंब शुल्क: रु. ${lateFee}`,
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

/**
 * Reads back the date the family themselves gave. That is the whole force of
 * this notice, and also why it must never go to somebody who did not make the
 * promise.
 */
const promiseLapsedEn: Body = ([p, s, c, promised, amount, date, fee]) =>
  [
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

const promiseLapsedHi: Body = ([p, s, c, promised, amount, date, fee]) =>
  [
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

/* ------------------------------------------------- v4, submitted 2026-09-08 */
/* Written here and into docs/modules/whatsapp-campaign-registry.md together.
   None of these is approved yet — the descriptors in `campaigns.ts` carry
   `approved: false` and `campaignFor` refuses them, so a body change here is
   free until Meta says otherwise. Strictly UTILITY: every line states a fact
   about this family's account or what to do about it. The waiver is worded as
   a payment term, never as an offer. */

/**
 * The late fee is on the account, and it will not be charged if the fees
 * arrive by the date. Slot 6 is the LEDGER's late fee; slot 7 is the office's
 * waive-by date. No late-fee phrase — the fee is a fact here, not a lever.
 */
const lateFeeWaiverEn: Body = ([p, s, c, phrase, fees, lateFee, date]) =>
  [
    "*Late Fee Notice — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Installment: ${phrase}`,
    `Fees pending: Rs. ${fees}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Late fee on this account: Rs. ${lateFee}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Last date without late fee: ${date}`,
    "",
    "The late fee shown above will not be charged if the fees pending are received on or before the last date shown. From the day after that date, the fees and the late fee are both payable.",
    "",
    "Pay at the school fee counter or using this UPI link:",
    UPI,
    "",
    "Please write the student's name with the payment and collect a receipt. If you have already paid, kindly ignore this message.",
    "",
    "For any query, call the office on 9352205884.",
  ].join("\n");

const lateFeeWaiverHi: Body = ([p, s, c, phrase, fees, lateFee, date]) =>
  [
    "*विलंब शुल्क सूचना — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `किश्त: ${phrase}`,
    `शेष फीस: रु. ${fees}`,
    `इस खाते पर विलंब शुल्क: रु. ${lateFee}`,
    `बिना विलंब शुल्क की अंतिम तिथि: ${date}`,
    "",
    "यदि शेष फीस उपरोक्त अंतिम तिथि तक प्राप्त हो जाती है तो दर्शाया गया विलंब शुल्क नहीं लिया जाएगा। उस तिथि के अगले दिन से फीस और विलंब शुल्क दोनों देय होंगे।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से जमा करें:",
    UPI,
    "",
    "भुगतान करते समय विद्यार्थी का नाम अवश्य लिखें तथा रसीद प्राप्त करें। यदि भुगतान हो चुका है तो इस संदेश को अनदेखा करें।",
    "",
    "जानकारी हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");

/**
 * The same seven values as the waiver notice, on the last day it holds. Worded
 * differently throughout, and it carries the school's report-card rule.
 */
const waiverLastCallEn: Body = ([p, s, c, phrase, fees, lateFee, date]) =>
  [
    "*Last Date Without Late Fee — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Installment: ${phrase}`,
    `Fees pending: Rs. ${fees}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Late fee held back: Rs. ${lateFee}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Last date: ${date}`,
    "",
    "The date above is the last date on which the fees pending can be received without the late fee. From the day after, the late fee shown is added to this account. Report cards and examination admit cards are issued only for accounts with no pending fees.",
    "",
    "Settle at the school fee counter or using this UPI link:",
    UPI,
    "",
    "Kindly mention the student's name with the payment and take a receipt. Ignore this message if the amount has already been paid.",
    "",
    "To confirm your record, call the office on 9352205884.",
  ].join("\n");

const waiverLastCallHi: Body = ([p, s, c, phrase, fees, lateFee, date]) =>
  [
    "*बिना विलंब शुल्क की अंतिम तिथि — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `किश्त: ${phrase}`,
    `शेष फीस: रु. ${fees}`,
    `रोका गया विलंब शुल्क: रु. ${lateFee}`,
    `अंतिम तिथि: ${date}`,
    "",
    "उपरोक्त तिथि शेष फीस को बिना विलंब शुल्क जमा करने की अंतिम तिथि है। उसके अगले दिन से दर्शाया गया विलंब शुल्क इस खाते में जोड़ दिया जाएगा। रिपोर्ट कार्ड एवं परीक्षा प्रवेश पत्र केवल उन्हीं विद्यार्थियों को दिए जाते हैं जिनकी कोई फीस बकाया नहीं है।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से निपटान करें:",
    UPI,
    "",
    "भुगतान के साथ विद्यार्थी का नाम अवश्य लिखें तथा रसीद लें। राशि जमा हो चुकी हो तो इस संदेश को अनदेखा करें।",
    "",
    "अपना रिकॉर्ड जांचने हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");

/** A passed installment still unpaid, named with a final date. */
const overdueFinalEn: Body = ([p, s, c, phrase, amount, date, fee]) =>
  [
    "*Final Fee Notice — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Installment overdue: ${phrase}`,
    `Amount overdue: Rs. ${amount}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Final date: ${date}`,
    `Late fee on this installment: ${fee}`,
    "",
    "The due date for the installment above has passed and the amount remains unpaid. Please clear it by the final date shown. Report cards and examination admit cards are issued only for accounts with no pending fees.",
    "",
    "Pay at the school fee counter or using this UPI link:",
    UPI,
    "",
    "Please write the student's name with the payment and collect a receipt. If you have already paid, kindly ignore this message.",
    "",
    "For any query, call the office on 9352205884.",
  ].join("\n");

const overdueFinalHi: Body = ([p, s, c, phrase, amount, date, fee]) =>
  [
    "*अंतिम फीस सूचना — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `बकाया किश्त: ${phrase}`,
    `बकाया राशि: रु. ${amount}`,
    `अंतिम तिथि: ${date}`,
    `इस किश्त पर विलंब शुल्क: ${fee}`,
    "",
    "उपरोक्त किश्त की देय तिथि निकल चुकी है और राशि अब तक जमा नहीं हुई है। कृपया दर्शाई गई अंतिम तिथि तक जमा करें। रिपोर्ट कार्ड एवं परीक्षा प्रवेश पत्र केवल उन्हीं विद्यार्थियों को दिए जाते हैं जिनकी कोई फीस बकाया नहीं है।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से जमा करें:",
    UPI,
    "",
    "भुगतान करते समय विद्यार्थी का नाम अवश्य लिखें तथा रसीद प्राप्त करें। यदि भुगतान हो चुका है तो इस संदेश को अनदेखा करें।",
    "",
    "जानकारी हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");

/**
 * The mirror of `promise_lapsed`: the day before (or of) the date the family
 * gave. Slot 4 is the day the office spoke with them, slot 6 the date they
 * agreed — their own words, read back before the date rather than after.
 */
const promiseDueEn: Body = ([p, s, c, spoken, amount, agreed, fee]) =>
  [
    "*Payment Date Reminder — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Spoken on: ${spoken}`,
    `Amount pending: Rs. ${amount}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Date agreed: ${agreed}`,
    `Late fee after the date agreed: ${fee}`,
    "",
    "Our record shows that on the date above you agreed to pay the amount pending by the date shown. Kindly pay on or before that date.",
    "",
    "Pay at the school fee counter or using this UPI link:",
    UPI,
    "",
    "If the amount has already been paid, please ignore this message and call the office so the record can be corrected.",
    "",
    "For any query, call the office on 9352205884.",
  ].join("\n");

const promiseDueHi: Body = ([p, s, c, spoken, amount, agreed, fee]) =>
  [
    "*भुगतान तिथि स्मरण — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `बातचीत की तिथि: ${spoken}`,
    `शेष राशि: रु. ${amount}`,
    `तय की गई तिथि: ${agreed}`,
    `तय तिथि के बाद विलंब शुल्क: ${fee}`,
    "",
    "हमारे रिकॉर्ड के अनुसार उपरोक्त बातचीत की तिथि को आपने शेष राशि तय की गई तिथि तक जमा करने की सहमति दी थी। कृपया उस तिथि तक जमा कर दें।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से जमा करें:",
    UPI,
    "",
    "यदि राशि जमा हो चुकी है तो इस संदेश को अनदेखा करें तथा रिकॉर्ड सुधार हेतु कार्यालय को सूचित करें।",
    "",
    "जानकारी हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");

/** Anything pending on the selected installments, before the examinations. */
const examClearanceEn: Body = ([p, s, c, phrase, amount, date, fee]) =>
  [
    "*Fee Clearance Before Examination — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Installments pending: ${phrase}`,
    `Fees pending: Rs. ${amount}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Clear by: ${date}`,
    `Late fee on pending installments: ${fee}`,
    "",
    "Examinations are approaching. Report cards and examination admit cards are issued only for accounts with no pending fees, so please clear the amount above by the date shown.",
    "",
    "Pay at the school fee counter or using this UPI link:",
    UPI,
    "",
    "Please write the student's name with the payment and collect a receipt. If you have already paid, kindly ignore this message.",
    "",
    "For any query, call the office on 9352205884.",
  ].join("\n");

const examClearanceHi: Body = ([p, s, c, phrase, amount, date, fee]) =>
  [
    "*परीक्षा से पूर्व फीस निपटान — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `शेष किश्तें: ${phrase}`,
    `शेष फीस: रु. ${amount}`,
    `निपटान की तिथि: ${date}`,
    `शेष किश्तों पर विलंब शुल्क: ${fee}`,
    "",
    "परीक्षाएँ निकट हैं। रिपोर्ट कार्ड एवं परीक्षा प्रवेश पत्र केवल उन्हीं विद्यार्थियों को दिए जाते हैं जिनकी कोई फीस बकाया नहीं है, अतः कृपया उपरोक्त राशि दर्शाई गई तिथि तक जमा करें।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से जमा करें:",
    UPI,
    "",
    "भुगतान करते समय विद्यार्थी का नाम अवश्य लिखें तथा रसीद प्राप्त करें। यदि भुगतान हो चुका है तो इस संदेश को अनदेखा करें।",
    "",
    "जानकारी हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");

/* -------------------------------------------------------------------- lookup */

/**
 * A FULL record over `NoticeSituation`, on purpose: a situation registered
 * without a body fails typecheck here rather than shipping a campaign the
 * office cannot preview.
 */
const BODIES: Record<NoticeSituation, Record<NoticeLanguage, Body>> = {
  fee_due: { en: feeDueEn, hi: feeDueHi },
  balance: { en: balanceEn, hi: balanceHi },
  prevyear: { en: prevYearEn, hi: prevYearHi },
  upcoming: { en: upcomingEn, hi: upcomingHi },
  upcoming_final: { en: upcomingFinalEn, hi: upcomingFinalHi },
  late_fee_applied: { en: lateFeeAppliedEn, hi: lateFeeAppliedHi },
  promise_lapsed: { en: promiseLapsedEn, hi: promiseLapsedHi },
  late_fee_waiver: { en: lateFeeWaiverEn, hi: lateFeeWaiverHi },
  waiver_last_call: { en: waiverLastCallEn, hi: waiverLastCallHi },
  overdue_final: { en: overdueFinalEn, hi: overdueFinalHi },
  promise_due: { en: promiseDueEn, hi: promiseDueHi },
  exam_clearance: { en: examClearanceEn, hi: examClearanceHi },
};

/**
 * The body as a parent will read it, from the params that will be posted.
 *
 * Takes the params rather than the values so a caller that already built them
 * for the send renders the preview from the same array. `renderNoticePreview`
 * is the convenience for callers holding named values.
 */
export function renderNoticeBody(
  situation: NoticeSituation,
  language: NoticeLanguage,
  params: readonly string[],
): string {
  return BODIES[situation][language](params);
}

/**
 * Preview for a notice from named values, approved or not.
 *
 * Null only when no descriptor is registered for the combination at all — a
 * bug, not a Tuesday. An unapproved notice still previews: the office needs to
 * read what is awaiting Meta, and a test send may go through it.
 */
export function renderNoticePreview(
  situation: NoticeSituation,
  language: NoticeLanguage,
  values: NoticeValues,
): string | null {
  const campaign = describeCampaign(situation, language);
  if (!campaign) return null;
  return renderNoticeBody(situation, language, campaign.buildParams(values));
}
