"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

type CopyReminderButtonProps = {
  text: string;
};

export function CopyReminderButton({ text }: CopyReminderButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
      <Copy className="size-3.5" />
      {copied ? "Copied" : "Copy reminder"}
    </Button>
  );
}
