"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

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

const CATEGORY_I18N: Record<WhatsappTemplateCategory, string> = {
  reminder: "whatsappCategoryReminder",
  final_reminder: "whatsappCategoryFinalReminder",
  receipt: "whatsappCategoryReceipt",
  custom: "whatsappCategoryCustom",
};

const PLACEHOLDER_I18N: Record<string, string> = {
  studentName: "whatsappPlaceholderStudentName",
  fatherName: "whatsappPlaceholderFatherName",
  className: "whatsappPlaceholderClassName",
  pending: "whatsappPlaceholderPending",
  dueDate: "whatsappPlaceholderDueDate",
  schoolName: "whatsappPlaceholderSchoolName",
  receiptNumber: "whatsappPlaceholderReceiptNumber",
  amount: "whatsappPlaceholderAmount",
};

type Props = {
  open: boolean;
  onClose: () => void;
  template: WhatsappTemplate | null;
};

export function TemplateEditor({ open, onClose, template }: Props) {
  const t = useTranslations("AdminTools");
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
      toast({ title: state.message ?? t("whatsappEditorTemplateSaved") });
      onClose();
    }
  }, [state.status, state.message, onClose, t]);

  const placeholders = useMemo(() => extractPlaceholders(body), [body]);
  const preview = useMemo(() => renderWhatsappTemplate(body, PREVIEW_VARS), [body]);

  function insertToken(token: string) {
    const inserted = `{{${token}}}`;
    setBody((current) => `${current}${current.endsWith(" ") || current.length === 0 ? "" : " "}${inserted}`);
  }

  const categoryLabel = (value: WhatsappTemplateCategory) => {
    const key = CATEGORY_I18N[value];
    return key ? t(key as Parameters<typeof t>[0]) : value;
  };

  const placeholderDescription = (token: string, fallback: string) => {
    const key = PLACEHOLDER_I18N[token];
    return key ? t(key as Parameters<typeof t>[0]) : fallback;
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? t("whatsappEditorEditTitle") : t("whatsappEditorNewTitle")}
      description={t("whatsappEditorDescription")}
      size="full"
    >
      <form action={formAction} className="space-y-4">
        {isEdit ? <input type="hidden" name="id" value={template.id} /> : null}

        <div className="space-y-2">
          <label htmlFor="template-name" className="text-sm font-medium text-foreground">
            {t("whatsappEditorNameLabel")}
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
            placeholder={t("whatsappEditorNamePlaceholder")}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="template-category" className="text-sm font-medium text-foreground">
            {t("whatsappEditorCategoryLabel")}
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
                {categoryLabel(option.value)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="template-body" className="text-sm font-medium text-foreground">
            {t("whatsappEditorBodyLabel")}
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
            placeholder={t("whatsappEditorBodyPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("whatsappEditorBodyCount", { count: body.length })}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("whatsappEditorPlaceholdersTitle")}
          </p>
          <div className="flex flex-wrap gap-2">
            {KNOWN_PLACEHOLDERS.map((option) => (
              <button
                key={option.token}
                type="button"
                onClick={() => insertToken(option.token)}
                title={placeholderDescription(option.token, option.description)}
                className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-3"
              >
                {`{{${option.token}}}`}
              </button>
            ))}
          </div>
          {placeholders.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("whatsappEditorDetected", {
                tokens: placeholders.map((token) => `{{${token}}}`).join(", "),
              })}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("whatsappEditorPreviewTitle")}
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
          {t("whatsappEditorActiveLabel")}
        </label>

        {state.status === "error" ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending} className="flex-1">
            {t("whatsappEditorCancel")}
          </Button>
          <Button type="submit" variant="accent" disabled={pending} className="flex-1">
            {pending
              ? t("whatsappEditorSavingDots")
              : isEdit
                ? t("whatsappEditorSaveChanges")
                : t("whatsappEditorCreate")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

export function DeleteTemplateButton({ template }: { template: WhatsappTemplate }) {
  const t = useTranslations("AdminTools");
  const [state, formAction, pending] = useActionState(deleteTemplateAction, INITIAL);

  useEffect(() => {
    if (state.status === "success") {
      toast({ title: t("whatsappEditorDeletedToast") });
    } else if (state.status === "error" && state.message) {
      toast({ title: t("whatsappEditorDeleteErrorTitle"), description: state.message });
    }
  }, [state.status, state.message, t]);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!confirm(t("whatsappEditorConfirmDelete", { name: template.name }))) {
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
        {pending ? t("whatsappDeleting") : t("whatsappDelete")}
      </Button>
    </form>
  );
}
