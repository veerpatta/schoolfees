"use client";

import { Phone } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import {
  PhoneActionMenu,
  buildStudentPhoneEntries,
} from "@/modules/students/ui/phone-chooser";

type StudentContactActionsProps = {
  fatherPhone: string | null;
  motherPhone: string | null;
};

function buildTelLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * The Call chip for a student. When two numbers are on file the staff member is
 * asked which parent to reach (see PhoneActionMenu).
 *
 * There used to be a "WhatsApp dues" chip beside it, which opened `wa.me` with
 * a hardcoded English sentence and the pending figure baked into the URL. It
 * sent from whichever WhatsApp account the staff member happened to be signed
 * into, and wrote nothing down — so nobody could say afterwards whether a
 * family had been told anything, or what they had been told.
 *
 * Sending is now Send reminder (an approved template, from the school's own
 * number, recorded) and Fee statement (the same, with the PDF attached). This
 * file keeps only the thing that was never WhatsApp: the phone call, which the
 * whole defaulters call list depends on.
 *
 * The student's name, class, admission number and balance were props only to
 * build that sentence. They are gone with it — the figures a parent is quoted
 * are read from the ledger at send time now, never composed on a screen.
 */
export function StudentContactActions({
  fatherPhone,
  motherPhone,
}: StudentContactActionsProps) {
  const entries = buildStudentPhoneEntries({ fatherPhone, motherPhone });
  if (entries.length === 0) {
    return null;
  }

  return (
    <PhoneActionMenu
      entries={entries}
      menuLabel="Call which number?"
      onSelect={(phone) => {
        window.location.href = buildTelLink(phone);
      }}
    >
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs">
        <Phone className="h-3.5 w-3.5" />
        <span>Call</span>
      </Button>
    </PhoneActionMenu>
  );
}
