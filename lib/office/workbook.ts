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

export const officeWorkbookMeta: Record<
  OfficeWorkbookView,
  {
    title: string;
    shortTitle: string;
    description: string;
  }
> = {
  transactions: {
    title: "All Transactions",
    shortTitle: "Transactions",
    description: "Latest posted receipt records with current paid and outstanding context.",
  },
  collection_today: {
    title: "Today's Collection",
    shortTitle: "Today",
    description: "Daily summary totals for day-book checking.",
  },
  receipts: {
    title: "Receipts",
    shortTitle: "Receipts",
    description: "Receipt register for reprints, verification, and desk follow-up.",
  },
  student_dues: {
    title: "Student Dues",
    shortTitle: "Dues",
    description: "Student-wise dues, paid, pending, discount, and next-due view.",
  },
  installments: {
    title: "Installment Tracker",
    shortTitle: "Installments",
    description: "Student-wise pending installment view with next due and late fee position.",
  },
  class_register: {
    title: "Class Register",
    shortTitle: "Class Reg",
    description: "Workbook-style class register with summary totals and compact payment history.",
  },
  defaulters: {
    title: "Defaulters",
    shortTitle: "Defaulters",
    description: "Overdue students with phone-ready follow-up details.",
  },
  import_issues: {
    title: "Import Issues",
    shortTitle: "Imports",
    description: "Recent import rows that still need office review.",
  },
  exports: {
    title: "Exports",
    shortTitle: "Exports",
    description: "Download permanent finance views as CSV files.",
  },
};

export function normalizeOfficeWorkbookView(
  value: string | undefined | null,
): OfficeWorkbookView {
  const normalized = (value ?? "").trim();
  const aliases: Record<string, OfficeWorkbookView> = {
    receipts_today: "receipts",
    statements: "student_dues",
    dues: "student_dues",
    all_transactions: "transactions",
    receipt_register: "receipts",
  };

  if (aliases[normalized]) {
    return aliases[normalized];
  }

  return officeWorkbookViews.includes(normalized as OfficeWorkbookView)
    ? (normalized as OfficeWorkbookView)
    : "transactions";
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
    params.set("sessionLabel", payload.sessionLabel);
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
    params.set("sessionLabel", payload.sessionLabel);
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
