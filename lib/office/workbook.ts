export const officeWorkbookViews = [
  "transactions",
  "installments",
  "statements",
  "class_register",
  "defaulters",
  "receipts_today",
  "collection_today",
  "import_issues",
] as const;

export type OfficeWorkbookView = (typeof officeWorkbookViews)[number];

export const officeWorkbookMeta: Record<
  OfficeWorkbookView,
  {
    title: string;
    description: string;
  }
> = {
  transactions: {
    title: "Receipt Register",
    description: "Receipt-by-receipt checking for counter follow-up and reprints.",
  },
  installments: {
    title: "Installment Tracker",
    description: "Student-wise pending installment view with next due and late fee position.",
  },
  statements: {
    title: "Master Fee Statement",
    description: "Student-wise statement shortcuts with clean print views and fee breakup.",
  },
  class_register: {
    title: "Class Register",
    description: "Workbook-style class register with summary totals and compact payment history.",
  },
  defaulters: {
    title: "Defaulters",
    description: "Overdue students with phone-ready follow-up details.",
  },
  receipts_today: {
    title: "Today's Receipts",
    description: "Today's posted receipts for quick recheck and printing.",
  },
  collection_today: {
    title: "Today's Collection",
    description: "Daily summary totals for day-book checking.",
  },
  import_issues: {
    title: "Import Issues",
    description: "Recent import rows that still need office review.",
  },
};

export function normalizeOfficeWorkbookView(
  value: string | undefined | null,
): OfficeWorkbookView {
  const normalized = (value ?? "").trim();
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

  return `/protected/dues?${params.toString()}`;
}
