export type PaymentDraftKeyParts = {
  sessionLabel: string;
  studentId: string;
  paymentDate: string;
};

export type PaymentDraftValue = {
  amountInput: string;
  paymentMode: string;
  referenceNumber: string;
};

type SaveDraftPayload = PaymentDraftKeyParts & {
  draft: PaymentDraftValue;
};

const dbName = "vpps-payment-drafts";
const storeName = "drafts";

export function buildPaymentDraftKey({
  sessionLabel,
  studentId,
  paymentDate,
}: PaymentDraftKeyParts) {
  return `paymentDraft:${sessionLabel}:${studentId}:${paymentDate}`;
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

function openDraftDb(): Promise<IDBDatabase> {
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

async function idbGet(key: string): Promise<PaymentDraftValue | null> {
  const db = await openDraftDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as PaymentDraftValue | undefined) ?? null);
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, draft: PaymentDraftValue): Promise<void> {
  const db = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const request = transaction.objectStore(storeName).put(draft, key);

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDraftDb();
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

export async function loadDraft(parts: PaymentDraftKeyParts): Promise<PaymentDraftValue | null> {
  const key = buildPaymentDraftKey(parts);

  if (hasIndexedDb()) {
    try {
      return await idbGet(key);
    } catch {
      // Fall through to localStorage when IndexedDB is blocked or unavailable.
    }
  }

  const storage = getLocalStorage();
  const raw = storage?.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PaymentDraftValue;
  } catch {
    storage?.removeItem(key);
    return null;
  }
}

export async function saveDraft({
  sessionLabel,
  studentId,
  paymentDate,
  draft,
}: SaveDraftPayload): Promise<void> {
  const key = buildPaymentDraftKey({ sessionLabel, studentId, paymentDate });

  if (hasIndexedDb()) {
    try {
      await idbSet(key, draft);
      return;
    } catch {
      // Fall through to localStorage when IndexedDB is blocked or unavailable.
    }
  }

  getLocalStorage()?.setItem(key, JSON.stringify(draft));
}

export async function clearDraft(parts: PaymentDraftKeyParts): Promise<void> {
  const key = buildPaymentDraftKey(parts);

  if (hasIndexedDb()) {
    try {
      await idbDelete(key);
    } catch {
      // Continue with localStorage cleanup.
    }
  }

  getLocalStorage()?.removeItem(key);
}

