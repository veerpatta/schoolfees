export type WhatsappTemplateCategory =
  | "reminder"
  | "final_reminder"
  | "receipt"
  | "custom";

export const WHATSAPP_TEMPLATE_CATEGORIES: ReadonlyArray<{
  value: WhatsappTemplateCategory;
  label: string;
}> = [
  { value: "reminder", label: "Reminder" },
  { value: "final_reminder", label: "Final reminder" },
  { value: "receipt", label: "Receipt confirmation" },
  { value: "custom", label: "Custom" },
] as const;

export type WhatsappTemplate = {
  id: string;
  name: string;
  body: string;
  placeholders: string[];
  category: WhatsappTemplateCategory;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Canonical placeholder vocabulary surfaced in the UI. Templates can use any
 * `{{token}}` they like — these are just the suggestions shown in the editor.
 */
export const KNOWN_PLACEHOLDERS: ReadonlyArray<{
  token: string;
  description: string;
}> = [
  { token: "studentName", description: "Student's full name." },
  { token: "fatherName", description: "Father's name from the student record." },
  { token: "className", description: "Class label, e.g. Class 8 - A." },
  { token: "pending", description: "Total pending amount (formatted ₹)." },
  { token: "dueDate", description: "Oldest due date in DD-MM-YYYY form." },
  { token: "schoolName", description: "School short name." },
  { token: "receiptNumber", description: "Receipt number (receipt templates)." },
  { token: "amount", description: "Receipt amount in ₹ (receipt templates)." },
];
