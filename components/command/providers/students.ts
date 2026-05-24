"use client";

import { UsersRound } from "lucide-react";

import type { CommandItem, CommandProvider } from "@/lib/command/types";
import { pushRecent } from "@/lib/command/recents";

type StudentHit = {
  id: string;
  admissionNo: string;
  fullName: string;
  classLabel: string;
};

/**
 * Student provider — debounced fetch against /api/command/students.
 *
 * Items navigate to the student's profile and record a recents entry so
 * the next palette open surfaces them above search.
 */
export const studentsProvider: CommandProvider = {
  id: "students",
  label: "Students",
  priority: 90,
  fetch: async (query, signal) => {
    if (query.trim().length < 2) return [];
    const url = `/api/command/students?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) return [];
    const json = (await response.json()) as { items?: StudentHit[] };
    const hits = json.items ?? [];
    return hits.map<CommandItem>((hit) => ({
      id: `student:${hit.id}`,
      providerId: "students",
      label: hit.fullName,
      hint: hit.admissionNo,
      description: hit.classLabel,
      icon: UsersRound,
      kind: "student",
      onSelect: ({ push, close }) => {
        const href = `/protected/students/${hit.id}`;
        pushRecent({
          id: hit.id,
          kind: "student",
          label: hit.fullName,
          hint: hit.admissionNo,
          href,
        });
        push(href);
        close();
      },
    }));
  },
};
