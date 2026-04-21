export const schoolProfile = {
  name:
    process.env.NEXT_PUBLIC_SCHOOL_NAME?.trim() ||
    "Shri Veer Patta Senior Secondary School",
  shortName: "Shri Veer Patta SSS",
  appMode: process.env.NEXT_PUBLIC_APP_MODE?.trim() || "internal-admin",
  adminOnly: true,
  receiptPrefix: "SVP",
  staffAudience: "Office and accounts staff",
} as const;

export const productPrinciples = [
  "Keep the system internal and task-focused for school staff.",
  "Replace workbook steps gradually instead of forcing a hard cutover.",
  "Preserve who changed what and when for every fee operation.",
] as const;
