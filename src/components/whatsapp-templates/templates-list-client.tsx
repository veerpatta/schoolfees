"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/ui/primitives/button";
import { DeleteTemplateButton, TemplateEditor } from "@/components/whatsapp-templates/template-editor";
import { cn } from "@/platform/utils";
import { type WhatsappTemplate } from "@/lib/whatsapp-templates/types";

const CATEGORY_I18N: Record<WhatsappTemplate["category"], string> = {
  reminder: "whatsappCategoryReminder",
  final_reminder: "whatsappCategoryFinalReminder",
  receipt: "whatsappCategoryReceipt",
  custom: "whatsappCategoryCustom",
};

type Props = {
  templates: WhatsappTemplate[];
  canEdit: boolean;
};

export function TemplatesListClient({ templates, canEdit }: Props) {
  const t = useTranslations("AdminTools");
  const [editing, setEditing] = useState<WhatsappTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  // Phone only. Eight templates at ~15 lines each is a very long scroll, so the
  // body is capped until asked for. The desk shows every body in full, as it
  // always has — the cap is behind `max-md:`, so `expanded` does nothing there.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const categoryLabel = (value: WhatsappTemplate["category"]) => {
    const key = CATEGORY_I18N[value];
    return key ? t(key as Parameters<typeof t>[0]) : value;
  };

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex md:justify-end">
          <Button
            type="button"
            variant="accent"
            onClick={() => setCreating(true)}
            className="max-md:w-full"
          >
            {t("whatsappNewTemplate")}
          </Button>
        </div>
      ) : null}

      {templates.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-2 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("whatsappEmpty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {templates.map((template) => {
            const isOpen = expanded.has(template.id);
            return (
              <li
                key={template.id}
                className="rounded-xl border border-border bg-card p-3.5 text-sm shadow-sm md:p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{template.name}</p>
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                        {categoryLabel(template.category)}
                      </span>
                      {!template.isActive ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {t("whatsappInactive")}
                        </span>
                      ) : null}
                    </div>
                    {template.placeholders.length > 0 ? (
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {t("whatsappVariables", {
                          tokens: template.placeholders.map((token) => `{{${token}}}`).join(", "),
                        })}
                      </p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 gap-2 max-md:w-full">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(template)}
                        className="max-md:flex-1"
                      >
                        {t("whatsappEdit")}
                      </Button>
                      <DeleteTemplateButton template={template} />
                    </div>
                  ) : null}
                </div>

                <pre
                  className={cn(
                    "mt-3 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-border bg-surface-2 p-3 font-sans text-xs text-foreground",
                    !isOpen && "max-md:max-h-24",
                  )}
                >
                  {template.body}
                </pre>
                <button
                  type="button"
                  onClick={() => toggle(template.id)}
                  className="focus-ring mt-1.5 text-xs font-semibold text-accent md:hidden"
                  aria-expanded={isOpen}
                >
                  {isOpen ? t("whatsappHideMessage") : t("whatsappShowFullMessage")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <TemplateEditor open={creating} onClose={() => setCreating(false)} template={null} />
      <TemplateEditor
        open={editing !== null}
        onClose={() => setEditing(null)}
        template={editing}
      />
    </div>
  );
}
