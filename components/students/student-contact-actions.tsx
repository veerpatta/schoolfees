"use client";

import { MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import {
  PhoneActionMenu,
  buildStudentPhoneEntries,
} from "@/components/students/phone-chooser";

type StudentContactActionsProps = {
  fullName: string;
  classLabel: string;
  admissionNo: string;
  fatherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  outstandingAmount: number;
};

function buildWhatsAppLink(phone: string, message: string): string | null {
  const digits = phone.replace(/\D+/g, "");
  if (digits.length < 10) return null;
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

function buildTelLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * Call / WhatsApp-reminder chips for a student. When two numbers are on file
 * the staff member is asked which parent to reach (see PhoneActionMenu).
 */
export function StudentContactActions({
  fullName,
  classLabel,
  admissionNo,
  fatherName,
  fatherPhone,
  motherPhone,
  outstandingAmount,
}: StudentContactActionsProps) {
  const entries = buildStudentPhoneEntries({ fatherPhone, motherPhone });
  if (entries.length === 0) {
    return null;
  }

  const dueMessage =
    outstandingAmount > 0
      ? `Namaste${fatherName ? ` ${fatherName}` : ""}, this is a fee reminder for ${fullName} (${classLabel}, SR ${admissionNo}). Pending dues are ${formatInr(outstandingAmount)}. Please contact the school office.`
      : `Namaste${fatherName ? ` ${fatherName}` : ""}, all fees are settled for ${fullName} (${classLabel}). Thank you.`;

  return (
    <>
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

      <PhoneActionMenu
        entries={entries}
        menuLabel="WhatsApp which number?"
        onSelect={(phone) => {
          const href = buildWhatsAppLink(phone, dueMessage);
          if (href) window.open(href, "_blank", "noreferrer");
        }}
      >
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs">
          <MessageCircle className="h-3.5 w-3.5" />
          <span>WhatsApp dues</span>
        </Button>
      </PhoneActionMenu>
    </>
  );
}
