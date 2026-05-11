import { type ReactNode } from "react";

import { Section } from "@/components/ui/section";

type SectionCardProps = {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/**
 * Backwards-compatible wrapper around the new `Section` primitive.
 * Renders the canonical card chrome (rounded-lg border bg-card) so legacy callers
 * keep their familiar shape. New code can import `Section` directly.
 */
export function SectionCard({ id, title, description, children, actions, className }: SectionCardProps) {
  return (
    <Section
      id={id}
      title={title}
      description={description}
      actions={actions}
      className={`rounded-lg border-border bg-card ${className ?? ""}`.trim()}
    >
      {children}
    </Section>
  );
}
