import type {
  ImportAnomalyCategory,
  ImportIssue,
  ImportRowDetail,
} from "@/lib/import/types";

const BLOCKING_ANOMALY_CATEGORIES = new Set<ImportAnomalyCategory>([
  "missing-admission-no",
  "invalid-dob",
  "duplicate-admission-no",
  "duplicate-name-class-dob",
  "unmapped-class",
  "unmapped-route",
  "placeholder-values",
]);

export function isBlockingAnomalyCategory(category: ImportAnomalyCategory) {
  return BLOCKING_ANOMALY_CATEGORIES.has(category);
}

export function deriveAnomalyCategoriesForRow(input: {
  mode: "add" | "update";
  status: ImportRowDetail["status"];
  errors: ImportIssue[];
}): ImportAnomalyCategory[] {
  const categories = new Set<ImportAnomalyCategory>();

  for (const issue of input.errors) {
    if (
      input.mode !== "add" &&
      (issue.code.includes("MISSING_ADMISSION_NO") || issue.code === "ERR_ADMISSIONNO")
    ) {
      categories.add("missing-admission-no");
    }

    if (issue.code.includes("INVALID_DOB")) {
      categories.add("invalid-dob");
    }

    if (issue.code.includes("DUPLICATE") && issue.code.includes("ADMISSION_NO")) {
      categories.add("duplicate-admission-no");
    }

    if (issue.code.includes("NAME_CLASS_DOB")) {
      categories.add("duplicate-name-class-dob");
    }

    if (issue.code === "ERR_CLASS_NOT_FOUND") {
      categories.add("unmapped-class");
    }

    if (issue.code === "ERR_ROUTE_NOT_FOUND") {
      categories.add("unmapped-route");
    }

    if (issue.code.includes("PLACEHOLDER")) {
      categories.add("placeholder-values");
    }
  }

  if (input.status === "duplicate" && ![...categories].some((item) => item.startsWith("duplicate"))) {
    categories.add("duplicate-admission-no");
  }

  return [...categories];
}

export function isCorrectionQueueRow(
  row: Pick<ImportRowDetail, "status" | "reviewStatus" | "anomalyCategories">,
) {
  if (row.status === "invalid" || row.status === "duplicate") {
    return true;
  }

  if (row.reviewStatus === "hold") {
    return true;
  }

  if (row.status === "valid" && row.reviewStatus === "pending") {
    return row.anomalyCategories.some((category) => isBlockingAnomalyCategory(category));
  }

  return false;
}

