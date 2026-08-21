"use client";

/**
 * Cross-tab handoff for "I just posted this payment, dashboard should add it
 * to today's totals immediately". The Payment Desk pushes an entry; the
 * Dashboard reads pending entries on mount and listens for fresh ones via
 * a custom event (same tab) plus the `storage` event (other tabs).
 *
 * Entries auto-expire after PAYMENT_POSTED_TTL_MS so the dashboard doesn't
 * double-count once the server-side revalidation lands.
 */

const STORAGE_KEY = "vpps:payment-posted-queue";
export const PAYMENT_POSTED_EVENT = "vpps:payment-posted";
export const PAYMENT_POSTED_TTL_MS = 30_000;

export type PostedPayment = {
  id: string;
  amount: number;
  postedAt: number;
  receiptNumber?: string | null;
};

function readAll(): PostedPayment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PostedPayment => {
      return (
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        typeof entry.amount === "number" &&
        typeof entry.postedAt === "number"
      );
    });
  } catch {
    return [];
  }
}

function writeAll(entries: PostedPayment[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota / privacy mode — ignore.
  }
}

export function pushOptimisticPayment(payload: { amount: number; receiptNumber?: string | null }) {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) return;
  const entry: PostedPayment = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    amount: payload.amount,
    postedAt: Date.now(),
    receiptNumber: payload.receiptNumber ?? null,
  };
  const next = [...readAll().filter(isActive), entry];
  writeAll(next);
  window.dispatchEvent(new CustomEvent<PostedPayment>(PAYMENT_POSTED_EVENT, { detail: entry }));
}

export function isActive(entry: PostedPayment): boolean {
  return Date.now() - entry.postedAt < PAYMENT_POSTED_TTL_MS;
}

export function getActiveOptimisticPayments(): PostedPayment[] {
  const all = readAll();
  const active = all.filter(isActive);
  if (active.length !== all.length) {
    writeAll(active);
  }
  return active;
}
