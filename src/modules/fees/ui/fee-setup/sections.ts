/**
 * The sections Fee Setup is divided into, and the save-state a section can be
 * in. Shared by the client and by the chrome that renders around it.
 */
"use client";

export type SyncStatus = "synced" | "dirty" | "saving" | "error";

export const FEE_SETUP_SECTIONS = [
  { id: "session", i18nKey: "sectionSession", icon: "📅" },
  { id: "basic", i18nKey: "sectionBasic", icon: "₹" }, // @allow-raw-money-format — section icon glyph, not a money value
  { id: "classes", i18nKey: "sectionClasses", icon: "🏫" },
  { id: "transport", i18nKey: "sectionTransport", icon: "🚌" },
  { id: "fee-heads", i18nKey: "sectionFeeHeads", icon: "📋" },
  { id: "discounts", i18nKey: "sectionDiscounts", icon: "🏷" },
] as const;

export type FeeSetupSectionId = (typeof FEE_SETUP_SECTIONS)[number]["id"];

