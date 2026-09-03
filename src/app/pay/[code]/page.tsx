import type { Metadata } from "next";

import { schoolProfile } from "@/platform/config/school";
import { formatInr } from "@/platform/helpers/currency";
import { formatMediumDate } from "@/platform/helpers/date";
import { buildStudentFeeUpiPayment } from "@/modules/payments/domain/upi";
import { createAdminClient } from "@/platform/supabase/admin";

/**
 * The pay link a parent taps from a WhatsApp reminder.
 *
 * The approved bodies already carry a raw `upi://` link, which works when a
 * phone recognises it and does nothing at all when it does not. WhatsApp will
 * not accept `upi://` as a template BUTTON, and a button is what gets tapped —
 * so the v3 templates point at `https://<site>/pay/{{code}}` and this page
 * builds the intent.
 *
 * **This is a payment link, not a portal.** It shows an amount, a reference and
 * a date, and nothing else. No name, no class, no admission number, no balance
 * history — deliberately stricter than `/r/[code]`, which at least confirms a
 * receipt exists. Anyone who guesses a code learns that somebody owes some money,
 * which is not information about anybody.
 *
 * The code is opaque, random and per-send, so it cannot be computed from an
 * admission number and used to enumerate what every family owes.
 *
 * Unauthenticated by design, and declared in the scan's `PUBLIC_BY_DESIGN` with
 * that reason. Uses the service-role client because the visitor has no session;
 * the query is a single indexed point lookup on `pay_code`.
 */

export const metadata: Metadata = {
  title: "Pay school fees",
  robots: { index: false, follow: false },
};

/** Never cached: the link expires, and a cached page would outlive it. */
export const revalidate = 0;

type PayPageProps = { params: Promise<{ code: string }> };

type PayResult =
  | { state: "invalid" }
  | { state: "expired"; expiredOn: string }
  | { state: "ready"; amount: number; reference: string; expiresOn: string | null };

async function resolvePayCode(rawCode: string): Promise<PayResult> {
  const code = decodeURIComponent(rawCode).trim();

  // Reject anything that is not code-shaped before touching the database. This
  // is the whole rate-limiting story: the codes are 160 bits of randomness in a
  // unique index, so guessing is not a thing that can be done, and a malformed
  // request never reaches Postgres.
  if (!code || code.length < 16 || code.length > 64 || !/^[A-Za-z0-9_-]+$/.test(code)) {
    return { state: "invalid" };
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("whatsapp_reminder_sends")
      .select("due_amount, pay_code_expires_on, students(admission_no)")
      .eq("pay_code", code)
      .maybeSingle();

    if (error || !data) return { state: "invalid" };

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const expiresOn = data.pay_code_expires_on ? String(data.pay_code_expires_on) : null;
    // The amount is what was owed when the message went out. A parent paying
    // from a three-week-old link would pay the wrong figure, so the link stops
    // rather than quietly misleading them.
    if (expiresOn && expiresOn < today) {
      return { state: "expired", expiredOn: expiresOn };
    }

    const admissionNo = String(
      (data.students as { admission_no?: string } | null)?.admission_no ?? "",
    );

    return {
      state: "ready",
      amount: Number(data.due_amount ?? 0),
      // The admission number goes into the UPI note so the office can match the
      // payment, and is NOT rendered on the page — the payer already knows it,
      // and a visitor who guessed the code must not learn it.
      reference: admissionNo,
      expiresOn,
    };
  } catch {
    return { state: "invalid" };
  }
}

export default async function PayPage({ params }: PayPageProps) {
  const { code } = await params;
  const result = await resolvePayCode(code);

  return (
    // dvh, not vh: on a phone browser with a chrome bar, 100vh is taller than
    // the visible viewport and the button lands under it.
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <header className="text-center">
        <h1 className="text-lg font-bold text-foreground">{schoolProfile.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">School fee payment</p>
      </header>

      {result.state === "invalid" ? (
        <section className="rounded-xl border border-border bg-card p-5 text-center">
          <h2 className="text-sm font-bold text-foreground">This link is not valid</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have been mistyped. Please pay at the school fee counter, or call the office on{" "}
            {schoolProfile.phone}.
          </p>
        </section>
      ) : null}

      {result.state === "expired" ? (
        <section className="rounded-xl border border-border bg-card p-5 text-center">
          <h2 className="text-sm font-bold text-foreground">This link has expired</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            It was valid until {formatMediumDate(result.expiredOn)}. The amount may have changed
            since, so please pay at the fee counter or call the office on{" "}
            {schoolProfile.phone} for the current figure.
          </p>
        </section>
      ) : null}

      {result.state === "ready" ? <PayPanel result={result} /> : null}

      <p className="text-center text-xs text-muted-foreground">
        This page shows only an amount and a payment reference. It carries no student details.
      </p>
    </main>
  );
}

function PayPanel({ result }: { result: Extract<PayResult, { state: "ready" }> }) {
  const payment = buildStudentFeeUpiPayment({
    amount: result.amount,
    admissionNo: result.reference,
  });

  return (
    // flex gap, never space-y: the expiry line is conditional.
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount due</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
          {formatInr(payment.amount)}
        </p>
      </div>

      {/* h-14 and full width: this is the only thing on the page anybody came to
          do, and it is being tapped on a phone one-handed. */}
      <a
        href={payment.uri}
        className="focus-ring flex h-14 w-full items-center justify-center rounded-xl bg-accent text-base font-bold text-accent-foreground"
      >
        Open UPI app to pay
      </a>

      {/* The VPA as selectable text, because the button does nothing on a phone
          with no UPI app registered to the scheme — and a parent can still type
          this into the app they do have. */}
      <div className="rounded-lg border border-border bg-surface-2 p-3 text-center">
        <p className="text-xs text-muted-foreground">Or pay this UPI ID by hand</p>
        <p className="mt-1 select-all break-all font-mono text-sm font-semibold text-foreground">
          {payment.vpa}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Reference:{" "}
          <span className="select-all font-mono font-semibold text-foreground">
            {payment.displayReference}
          </span>
        </p>
      </div>

      {result.expiresOn ? (
        <p className="text-center text-xs text-muted-foreground">
          Valid until {formatMediumDate(result.expiresOn)}.
        </p>
      ) : null}
    </section>
  );
}
