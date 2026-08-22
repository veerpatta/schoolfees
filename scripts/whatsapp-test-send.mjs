#!/usr/bin/env node
/**
 * Fire one AiSensy API campaign at one number, from the command line.
 *
 * Exists because the reminders screen only knows the single campaign named by
 * AISENSY_CAMPAIGN, and the six `vpps_app_*` campaigns need proving on a real
 * handset before anything is wired to them. Delete this once the campaign
 * registry lands and the screen's test panel can pick a campaign itself.
 *
 * Reads AISENSY_API_KEY from .env.local — never pass the key on the command
 * line, where it lands in shell history.
 *
 *   node scripts/whatsapp-test-send.mjs <campaign> <number> <param1> <param2> ...
 *
 * e.g.
 *   node scripts/whatsapp-test-send.mjs vpps_app_fee_due_en_v2 7976199548 \
 *     "Ramesh Lal Gurjar" "Aaradhya Gurjar" "2" "Installment 1 and 2" \
 *     "18,250" "25-08-2026" "Rs. 1,000 per installment"
 *
 * Quote every argument. PowerShell reads a bare 18,250 as a two-element array,
 * which arrives as two template params and is rejected by AiSensy.
 *
 * Every run sends a real WhatsApp message and spends real credit.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENDPOINT = "https://backend.aisensy.com/campaign/t1/api/v2";

function readApiKey() {
  for (const file of [".env.local", ".env"]) {
    let text;
    try {
      text = readFileSync(resolve(process.cwd(), file), "utf8");
    } catch {
      continue;
    }
    const line = text.split(/\r?\n/).find((l) => l.startsWith("AISENSY_API_KEY="));
    if (line) return line.slice("AISENSY_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

/** AiSensy wants a country code and no punctuation. */
function toDestination(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("91")) return `+${digits.slice(0, 12)}`;
  throw new Error(`Cannot read "${raw}" as an Indian mobile number.`);
}

const [campaignName, number, ...templateParams] = process.argv.slice(2);

if (!campaignName || !number || templateParams.length === 0) {
  console.error("usage: node scripts/whatsapp-test-send.mjs <campaign> <number> <param...>");
  process.exit(2);
}

const apiKey = readApiKey();
if (!apiKey) {
  console.error("AISENSY_API_KEY not found in .env.local or .env");
  process.exit(1);
}

const destination = toDestination(number);

console.log(`campaign : ${campaignName}`);
console.log(`to       : ${destination}`);
templateParams.forEach((value, i) => console.log(`{{${i + 1}}}     : ${value}`));

const response = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    apiKey,
    campaignName,
    destination,
    userName: templateParams[0] ?? "Test",
    source: "whatsapp-test-send",
    templateParams,
  }),
});

const text = await response.text();
console.log(`\nHTTP ${response.status}`);
console.log(text);
process.exit(response.ok ? 0 : 1);
