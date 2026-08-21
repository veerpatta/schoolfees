export const schoolProfile = {
  name:
    process.env.NEXT_PUBLIC_SCHOOL_NAME?.trim() ||
    "Shri Veer Patta Senior Secondary School",
  shortName: "Shri Veer Patta SSS",
  // Printed receipt header info. All three default to empty so the receipt
  // gracefully omits the line when the env var is not set; populate via env
  // (`NEXT_PUBLIC_SCHOOL_ADDRESS` / `_PHONE` / `_EMAIL`) without code change.
  address: process.env.NEXT_PUBLIC_SCHOOL_ADDRESS?.trim() ?? "",
  phone: process.env.NEXT_PUBLIC_SCHOOL_PHONE?.trim() ?? "",
  email: process.env.NEXT_PUBLIC_SCHOOL_EMAIL?.trim() ?? "",
  appMode: process.env.APP_MODE?.trim() || "production",
  adminOnly: true,
  receiptPrefix: "SVP",
  staffAudience: "Office and accounts staff",
} as const;

