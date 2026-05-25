"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DeleteTemplateButton, TemplateEditor } from "@/components/whatsapp-templates/template-editor";
import { WHATSAPP_TEMPLATE_CATEGORIES, type WhatsappTemplate } from "@/lib/whatsapp-templates/types";

function categoryLabel(value: WhatsappTemplate["category"]): string {
  return WHATSAPP_TEMPLATE_CATEGORIES.find((option) => option.value === value)?.label ?? value;
}

type Props = {
  templates: WhatsappTemplate[];
  canEdit: boolean;
};

export function TemplatesListClient({ templates, canEdit }: Props) {
  const [editing, setEditing] = useState<WhatsappTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="button" variant="accent" onClick={() => setCreating(true)}>
            New template
          </Button>
        </div>
      ) : null}

      {templates.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-2 px-4 py-8 text-center text-sm text-muted-foreground">
          No templates yet. Create one to enable bulk WhatsApp drafts from the defaulters page.
        </p>
      ) : (
        <ul className="space-y-3">
          {templates.map((template) => (
            <li
              key={template.id}
              className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm"
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
                        Inactive
                      </span>
                    ) : null}
                  </div>
                  {template.placeholders.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Variables: {template.placeholders.map((token) => `{{${token}}}`).join(", ")}
                    </p>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(template)}
                    >
                      Edit
                    </Button>
                    <DeleteTemplateButton template={template} />
                  </div>
                ) : null}
              </div>
              <pre className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-3 font-sans text-xs text-foreground">
                {template.body}
              </pre>
            </li>
          ))}
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
