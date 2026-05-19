import type { PaymentDeskStudentSummary } from "@/lib/payments/types";

export type PaymentDeskStudentSummaryCacheKeyParts = {
  sessionLabel: string;
  studentId: string;
  paymentDate: string;
};

type SavePaymentDeskStudentSummaryCachePayload =
  PaymentDeskStudentSummaryCacheKeyParts & {
    summary: PaymentDeskStudentSummary;
    now?: number;
  };

type PaymentDeskStudentSummaryCachePayload = {
  ts: number;
  summary: PaymentDeskStudentSummary;
};

const dbName = "vpps-payment-desk-cache";
const storeName = "studentSummaries";
const localStorageKeyPrefix = "vpps.paymentDesk.studentSummary";
const summaryCacheFreshMs = 2 * 60 * 1000;

export function buildPaymentDeskStudentSummaryCacheKey({
  sessionLabel,
  studentId,
  paymentDate,
}: PaymentDeskStudentSummaryCacheKeyParts) {
  return `${localStorageKeyPrefix}:${sessionLabel}:${studentId}:${paymentDate}`;
}

function getLocalStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : globalThis.localStorage;
  } catch {
    return null;
  }
}

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function isSummaryPayload(value: unknown): value is PaymentDeskStudentSummaryCachePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<PaymentDeskStudentSummaryCachePayload>;
  const summary = payload.summary as Partial<PaymentDeskStudentSummary> | undefined;

  return (
    typeof payload.ts === "number" &&
    Boolean(summary) &&
    typeof summary?.paymentDate === "string" &&
    "student" in summary &&
    "issue" in summary &&
    "latestReceipt" in summary &&
    "suggestedDefaultAmount" in summary
  );
}

function toCacheResult(
  payload: PaymentDeskStudentSummaryCachePayload | null,
  now = Date.now(),
) {
  if (!payload) {
    return null;
  }

  return {
    summary: payload.summary,
    stale: now - payload.ts > summaryCacheFreshMs,
  };
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function idbGet(key: string): Promise<PaymentDeskStudentSummaryCachePayload | null> {
  const db = await openCacheDb();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(isSummaryPayload(result) ? result : null);
      };
    });
  } finally {
    db.close();
  }
}

async function idbSet(
  key: string,
  payload: PaymentDeskStudentSummaryCachePayload,
): Promise<void> {
  const db = await openCacheDb();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const request = transaction.objectStore(storeName).put(payload, key);

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(key: string): Promise<void> {
  const db = await openCacheDb();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const request = transaction.objectStore(storeName).delete(key);

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

function readLocalStoragePayload(key: string) {
  const storage = getLocalStorage();
  const raw = storage?.getItem(key);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (isSummaryPayload(parsed)) {
      return parsed;
    }
  } catch {
    // Remove malformed cache below.
  }

  storage?.removeItem(key);
  return null;
}

export async function loadCachedPaymentDeskStudentSummary({
  sessionLabel,
  studentId,
  paymentDate,
  now,
}: PaymentDeskStudentSummaryCacheKeyParts & { now?: number }) {
  const key = buildPaymentDeskStudentSummaryCacheKey({
    sessionLabel,
    studentId,
    paymentDate,
  });

  if (hasIndexedDb()) {
    try {
      return toCacheResult(await idbGet(key), now);
    } catch {
      // Fall through to localStorage when IndexedDB is blocked or unavailable.
    }
  }

  return toCacheResult(readLocalStoragePayload(key), now);
}

export async function saveCachedPaymentDeskStudentSummary({
  sessionLabel,
  studentId,
  paymentDate,
  summary,
  now,
}: SavePaymentDeskStudentSummaryCachePayload) {
  const key = buildPaymentDeskStudentSummaryCacheKey({
    sessionLabel,
    studentId,
    paymentDate,
  });
  const payload = {
    ts: now ?? Date.now(),
    summary,
  };

  if (hasIndexedDb()) {
    try {
      await idbSet(key, payload);
      return;
    } catch {
      // Fall through to localStorage when IndexedDB is blocked or unavailable.
    }
  }

  getLocalStorage()?.setItem(key, JSON.stringify(payload));
}

export async function clearCachedPaymentDeskStudentSummary(
  parts: PaymentDeskStudentSummaryCacheKeyParts,
) {
  const key = buildPaymentDeskStudentSummaryCacheKey(parts);

  if (hasIndexedDb()) {
    try {
      await idbDelete(key);
    } catch {
      // Continue with localStorage cleanup.
    }
  }

  getLocalStorage()?.removeItem(key);
}
