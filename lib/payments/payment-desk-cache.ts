import type { PaymentStudentIndexItem } from "@/lib/payments/types";

const paymentDeskStudentIndexCacheKey = "vpps.paymentDesk.studentIndex";
const studentIndexCacheFreshMs = 5 * 60 * 1000;

type PaymentDeskStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StudentIndexCachePayload = {
  ts: number;
  data: PaymentStudentIndexItem[];
};

export function getPaymentDeskStudentIndexCacheKey(sessionLabel: string) {
  return `${paymentDeskStudentIndexCacheKey}:${sessionLabel}`;
}

function isPaymentStudentIndexItem(value: unknown): value is PaymentStudentIndexItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.id === "string" &&
    typeof item.fullName === "string" &&
    typeof item.admissionNo === "string" &&
    typeof item.classId === "string" &&
    typeof item.classLabel === "string" &&
    typeof item.studentStatus === "string"
  );
}

export function readPaymentDeskStudentIndexCache(payload: {
  storage: PaymentDeskStorage;
  sessionLabel: string;
  now?: number;
}): { students: PaymentStudentIndexItem[]; stale: boolean } | null {
  const raw = payload.storage.getItem(
    getPaymentDeskStudentIndexCacheKey(payload.sessionLabel),
  );

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StudentIndexCachePayload>;

    if (
      typeof parsed.ts !== "number" ||
      !Array.isArray(parsed.data) ||
      !parsed.data.every(isPaymentStudentIndexItem)
    ) {
      return null;
    }

    const now = payload.now ?? Date.now();

    return {
      students: parsed.data,
      stale: now - parsed.ts > studentIndexCacheFreshMs,
    };
  } catch {
    return null;
  }
}

export function writePaymentDeskStudentIndexCache(payload: {
  storage: PaymentDeskStorage;
  sessionLabel: string;
  students: PaymentStudentIndexItem[];
  now?: number;
}) {
  payload.storage.setItem(
    getPaymentDeskStudentIndexCacheKey(payload.sessionLabel),
    JSON.stringify({ ts: payload.now ?? Date.now(), data: payload.students }),
  );
}

export function clearPaymentDeskStudentIndexCache(payload: {
  storage: PaymentDeskStorage;
  sessionLabel: string;
}) {
  payload.storage.removeItem(getPaymentDeskStudentIndexCacheKey(payload.sessionLabel));
}
