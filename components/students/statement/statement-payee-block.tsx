/** Who the statement is for, and how the office reaches them. */
export function StatementPayeeBlock({
  scopeLabel,
  name,
  meta,
  fatherName,
  fatherPhone,
  transportRouteLabel,
  villageCity,
}: {
  scopeLabel: string;
  name: string;
  meta: string;
  fatherName: string;
  fatherPhone: string;
  transportRouteLabel: string;
  villageCity: string;
}) {
  return (
    <div className="grid grid-cols-[1.3fr_1fr] gap-4 border-b border-border-strong py-2.5">
      <div className="min-w-0">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {scopeLabel}
        </p>
        <p className="mt-1 font-display text-[21px] font-bold leading-[1.15] tracking-[-0.01em]">
          {name}
        </p>
        <p className="mt-[3px] text-[12.5px] text-muted-foreground">{meta}</p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-[3px] text-[12.5px]">
        <dt className="text-muted-foreground">Father</dt>
        <dd className="font-medium">{fatherName}</dd>
        <dt className="text-muted-foreground">Phone</dt>
        <dd className="font-medium">{fatherPhone}</dd>
        <dt className="text-muted-foreground">Transport</dt>
        <dd className="font-medium">{transportRouteLabel}</dd>
        <dt className="text-muted-foreground">Village</dt>
        <dd className="font-medium">{villageCity}</dd>
      </dl>
    </div>
  );
}
