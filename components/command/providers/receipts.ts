"use client";

import { BookOpenCheck } from "lucide-react";

import type { CommandItem, CommandProvider } from "@/lib/command/types";
import { pushRecent } from "@/lib/command/recents";
import { formatInr } from "@/lib/helpers/currency";

type ReceiptHit = {
  id: string;
  receiptNumber: string;
  studentLabel: string;
  amount: number;
  paymentDate: string | null;
};

/**
 * Receipt provider — debounced fetch against /api/command/receipts.
 *
 * Navigates into Transactions with the receipt pre-selected via query
 * param (the receipts list page already accepts ?receipt=…). If the page
 * doesn't recognise the param the user lands on the list with the search
 * pre-filled, which still beats hunting.
 */
export const receiptsProvider: CommandProvider = {
  id: "receipts",
  label: "Receipts",
  priority: 70,
  fetch: async (query, signal) => {
    if (query.trim().length < 2) return [];
    const url = `/api/command/receipts?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) return [];
    const json = (await response.json()) as { items?: ReceiptHit[] };
    const hits = json.items ?? [];
    return hits.map<CommandItem>((hit) => ({
      id: `receipt:${hit.id}`,
      providerId: "receipts",
      label: hit.receiptNumber,
      hint: formatInr(hit.amount),
      description: hit.studentLabel,
      icon: BookOpenCheck,
      kind: "receipt",
      onSelect: ({ push, close }) => {
        const href = `/protected/transactions?receipt=${encodeURIComponent(hit.receiptNumber)}`;
        pushRecent({
          id: hit.id,
          kind: "receipt",
          label: hit.receiptNumber,
          hint: hit.studentLabel,
          href,
        });
        push(href);
        close();
      },
    }));
  },
};
