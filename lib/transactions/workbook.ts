export const officeWorkbookViews = [
  "transactions",
  "collection_today",
  "receipts",
  "student_dues",
  "installments",
  "defaulters",
  "class_register",
  "import_issues",
  "exports",
] as const;

export type OfficeWorkbookView = (typeof officeWorkbookViews)[number];

/**
 * Translation key prefixes for each office workbook view. The Common
 * namespace exposes `<prefix>Title`, `<prefix>Short`, and
 * `<prefix>Description` under `workbookViews`. Callers translate via
 * `useTranslations("Common")` and reference these keys.
 *
 * Old hardcoded English labels lived in `officeWorkbookMeta`; that map
 * moved into messages/en.json + sibling locale files during the i18n port.
 */
export const officeWorkbookViewI18nPrefix: Record<OfficeWorkbookView, string> = {
  transactions: "transactions",
  collection_today: "collectionToday",
  receipts: "receipts",
  student_dues: "studentDues",
  installments: "installments",
  class_register: "classRegister",
  defaulters: "defaulters",
  import_issues: "importIssues",
  exports: "exports",
};

export function normalizeOfficeWorkbookView(
  value: string | undefined | null,
): OfficeWorkbookView {
  return resolveOfficeWorkbookView(value).view;
}

export function resolveOfficeWorkbookView(
  value: string | undefined | null,
): {
  view: OfficeWorkbookView;
  wasRecognized: boolean;
  rawValue: string;
} {
  const normalized = (value ?? "").trim();
  const aliases: Record<string, OfficeWorkbookView> = {
    receipts_today: "receipts",
    statements: "student_dues",
    dues: "student_dues",
    all_transactions: "transactions",
    receipt_register: "receipts",
  };

  if (aliases[normalized]) {
    return {
      view: aliases[normalized],
      wasRecognized: true,
      rawValue: normalized,
    };
  }

  if (officeWorkbookViews.includes(normalized as OfficeWorkbookView)) {
    return {
      view: normalized as OfficeWorkbookView,
      wasRecognized: true,
      rawValue: normalized,
    };
  }

  return {
    view: "transactions",
    wasRecognized: normalized.length === 0,
    rawValue: normalized,
  };
}

export function buildOfficeWorkbookHref(payload: {
  view: OfficeWorkbookView;
  classId?: string;
  sessionLabel?: string;
}) {
  const params = new URLSearchParams();

  params.set("view", payload.view);

  if (payload.classId) {
    params.set("classId", payload.classId);
  }

  if (payload.sessionLabel) {
    params.set("session", payload.sessionLabel);
  }

  return `/protected/transactions?${params.toString()}`;
}

export function buildOfficeWorkbookExportHref(payload: {
  view: OfficeWorkbookView;
  classId?: string;
  fromDate?: string;
  paymentMode?: string;
  query?: string;
  routeId?: string;
  sessionLabel?: string;
  toDate?: string;
}) {
  const params = new URLSearchParams();

  params.set("view", payload.view);

  if (payload.classId) {
    params.set("classId", payload.classId);
  }

  if (payload.sessionLabel) {
    params.set("session", payload.sessionLabel);
  }

  if (payload.query) {
    params.set("query", payload.query);
  }

  if (payload.routeId) {
    params.set("routeId", payload.routeId);
  }

  if (payload.paymentMode) {
    params.set("paymentMode", payload.paymentMode);
  }

  if (payload.fromDate) {
    params.set("fromDate", payload.fromDate);
  }

  if (payload.toDate) {
    params.set("toDate", payload.toDate);
  }

  return `/protected/transactions/export?${params.toString()}`;
}
