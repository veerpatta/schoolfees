"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import {
  createTemplateAction,
  deleteTemplateAction,
  updateTemplateAction,
  type TemplateActionState,
} from "@/app/protected/admin-tools/whatsapp-templates/actions";
import { extractPlaceholders, renderWhatsappTemplate } from "@/lib/whatsapp-templates/render";
import {
  KNOWN_PLACEHOLDERS,
  WHATSAPP_TEMPLATE_CATEGORIES,
  type WhatsappTemplate,
  type WhatsappTemplateCategory,
} from "@/lib/whatsapp-templates/types";

const INITIAL: TemplateActionState = { status: "idle" };

const PREVIEW_VARS: Record<string, string> = {
  studentName: "Aarav Sharma",
  fatherName: "Rajesh Sharma",
  className: "Class 8 - A",
  pending: "₹12,500",
  dueDate: "20-04-2026",
  schoolName: "Shri Veer Patta",
  receiptNumber: "SVP-12345",
  amount: "₹6,250",
};

type Props = {
  open: boolean;
  onClose: () => void;
  template: WhatsappTemplate | null;
};

export function TemplateEditor({ open, onClose, template }: Props) {
  const isEdit = template !== null;
  const action = isEdit ? updateTemplateAction : createTemplateAction;
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [body, setBody] = useState(template?.body ?? "");
  const [name, setName] = useState(template?.name ?? "");
  const [category, setCategory] = useState<WhatsappTemplateCategory>(template?.category ?? "reminder");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);

  useEffect(() => {
    setBody(template?.body ?? "");
    setName(template?.name ?? "");
    setCategory(template?.category ?? "reminder");
    setIsActive(template?.isActive ?? true);
  }, [template]);

  useEffect(() => {
    if (state.status === "success") {
      toast({ title: state.message ?? "Template saved" });
      onClose();
    }
  }, [state.status, state.message, onClose]);

  const placeholders = useMemo(() => extractPlaceholders(body), [body]);
  const preview = useMemo(() => renderWhatsappTemplate(body, PREVIEW_VARS), [body]);

  function insertToken(token: string) {
    const inserted = `{{${token}}}`;
    setBody((current) => `${current}${current.endsWith(" ") || current.length === 0 ? "" : " "}${inserted}`);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit template" : "New template"}
      description="Use {{token}} placeholders. The app renders these before opening WhatsApp."
      size="full"
    >
      <form action={formAction} className="space-y-4">
        {isEdit ? <input type="hidden" name="id" value={template.id} /> : null}

        <div className="space-y-2">
          <label htmlFor="template-name" className="text-sm font-medium text-foreground">
            Name
          </label>
          <input
            id="template-name"
            name="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            placeholder="e.g. Final reminder for class 10"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="template-category" className="text-sm font-medium text-foreground">
            Category
          </label>
          <select
            id="template-category"
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value as WhatsappTemplateCategory)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {WHATSAPP_TEMPLATE_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="template-body" className="text-sm font-medium text-foreground">
            Message body
          </label>
          <textarea
            id="template-body"
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            rows={8}
            maxLength={2000}
            className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-foreground"
            placeholder="Namaste {{fatherName}} ji, …"
          />
          <p className="text-xs text-muted-foreground">{body.length}/2000 characters</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Insert placeholder
          </p>
          <div className="flex flex-wrap gap-2">
            {KNOWN_PLACEHOLDERS.map((option) => (
              <button
                key={option.token}
                type="button"
                onClick={() => insertToken(option.token)}
                title={option.description}
                className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-3"
              >
                {`{{${option.token}}}`}
              </button>
            ))}
          </div>
          {placeholders.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Detected: {placeholders.map((token) => `{{${token}}}`).join(", ")}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Live preview (sample data)
          </p>
          <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{preview}</pre>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="isActive"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="size-4 accent-accent"
          />
          Active (available in the WhatsApp picker)
        </label>

        {state.status === "error" ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={pending} className="flex-1">
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create template"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

export function DeleteTemplateButton({ template }: { template: WhatsappTemplate }) {
  const [state, formAction, pending] = useActionState(deleteTemplateAction, INITIAL);

  useEffect(() => {
    if (state.status === "success") {
      toast({ title: "Template deleted" });
    } else if (state.status === "error" && state.message) {
      toast({ title: "Could not delete", description: state.message });
    }
  }, [state.status, state.message]);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!confirm(`Delete template "${template.name}"? Active drafts will not be affected.`)) {
          event.preventDefault();
        }
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={template.id} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        className="text-destructive hover:bg-destructive/5"
      >
        {pending ? "Deleting…" : "Delete"}
      </Button>
    </form>
  );
}
