"use client";

import { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { VoiceNotePlayer } from "@/components/defaulters/voice-note-player";

type ContactEntry = {
  contactedAt: string;
  channel: string | null;
  outcome: string | null;
  note: string | null;
  voiceNotePath: string | null;
};

const CHANNEL_LABEL: Record<string, string> = {
  call: "Phone call",
  whatsapp: "WhatsApp",
  sms: "SMS",
  in_person: "In person",
  email: "Email",
};

const OUTCOME_LABEL: Record<string, string> = {
  reached: "Reached",
  no_answer: "No answer",
  promised_pay: "Promised to pay",
  dispute: "Dispute / query",
  other: "Other",
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

type Props = {
  studentId: string;
  studentName: string;
  sessionLabel: string;
};

export function ContactLogTimelineButton({ studentId, studentName, sessionLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ContactEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || entries !== null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(
      `/protected/defaulters/contact-log?studentId=${encodeURIComponent(studentId)}&sessionLabel=${encodeURIComponent(sessionLabel)}`,
      { headers: { accept: "application/json" } },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load contact log (${response.status})`);
        }
        return (await response.json()) as { entries: ContactEntry[] };
      })
      .then((data) => {
        if (cancelled) return;
        setEntries(data.entries ?? []);
      })
      .catch((caught: Error) => {
        if (cancelled) return;
        setError(caught.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, entries, studentId, sessionLabel]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1 text-xs"
      >
        <History className="size-3.5" aria-hidden="true" />
        View log
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Contact log"
        description={`Recent contact attempts for ${studentName}`}
        size="full"
      >
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading…
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {entries !== null && entries.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface-2 px-3 py-6 text-center text-sm text-muted-foreground">
              No contact attempts logged yet.
            </p>
          ) : null}

          {entries?.map((entry, index) => (
            <div
              key={`${entry.contactedAt}-${index}`}
              className="rounded-lg border border-border bg-card p-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-foreground">
                  {entry.outcome ? OUTCOME_LABEL[entry.outcome] ?? entry.outcome : "Logged"}
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(entry.contactedAt)}</p>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entry.channel ? CHANNEL_LABEL[entry.channel] ?? entry.channel : "Channel unknown"}
              </p>
              {entry.note ? <p className="mt-2 text-sm text-foreground">{entry.note}</p> : null}
              {entry.voiceNotePath ? (
                <div className="mt-2">
                  <VoiceNotePlayer path={entry.voiceNotePath} label="Play voice note" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}
